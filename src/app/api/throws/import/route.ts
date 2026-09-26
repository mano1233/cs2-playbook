/**
 * Imports a folder of screenshots as throws.
 *
 * One request for the whole folder rather than a call per file: a set of fourteen
 * shots is seven throws, seven lineups and fourteen uploads, and doing that as
 * twenty-eight round trips would be slow and half-finish badly.
 *
 * The client sends a plan — which files belong to which throw, and what each picture
 * shows — because the person importing may have corrected a name or a grenade type
 * before confirming. That plan is data, not instruction: every name, kind and shot kind
 * is validated here, every file is sniffed by magic number, and a file the plan does
 * not mention is ignored rather than guessed at.
 *
 * Throws arrive **unplaced**. A filename cannot say where a grenade lands, so inventing
 * a position would put confident markers in wrong places.
 */
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { lineupShots, throws } from "@/db/schema";
import { requireWriter } from "@/lib/auth";
import { MAX_BYTES, sniffImage } from "@/lib/images";
import { radarFor } from "@/lib/radar";
import { putObject } from "@/lib/r2";
import {
  SHOT_KINDS,
  type ShotKind,
  UTIL_KINDS,
  type UtilKind,
  createLineup,
  createThrow,
} from "@/lib/throws";

export const dynamic = "force-dynamic";

/** A folder, not a library. Anything larger is a mistake worth refusing. */
const MAX_FILES = 120;

interface PlanEntry {
  file: string;
  name: string;
  kind: string;
  shotKind: string;
}

export async function POST(request: Request) {
  const auth = await requireWriter();
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

  const form = await request.formData().catch(() => null);
  if (!form) return Response.json({ error: "expected multipart form data" }, { status: 400 });

  const map = String(form.get("map") ?? "");
  if (!radarFor(map)) return Response.json({ error: "unknown map" }, { status: 404 });

  let plan: PlanEntry[];
  try {
    plan = JSON.parse(String(form.get("plan") ?? "[]")) as PlanEntry[];
  } catch {
    return Response.json({ error: "bad plan" }, { status: 400 });
  }
  if (!Array.isArray(plan) || plan.length === 0) {
    return Response.json({ error: "empty plan" }, { status: 400 });
  }
  if (plan.length > MAX_FILES) {
    return Response.json({ error: `too many files (max ${MAX_FILES})` }, { status: 413 });
  }

  const files = new Map<string, File>();
  for (const [key, value] of form.entries()) {
    if (key === "file" && value instanceof File) files.set(value.name, value);
  }

  const created: { name: string; throwId: string; shots: number }[] = [];
  const problems: { file: string; reason: string }[] = [];

  // One throw per distinct name in the plan, and one lineup under it holding the shots.
  // Nothing in a filename says a throw is landed several ways, so it goes in as one
  // lineup and is split by hand — which is honest about what the names actually said.
  const byName = new Map<string, PlanEntry[]>();
  for (const entry of plan) {
    const name = String(entry.name ?? "").trim().slice(0, 80);
    if (!name) {
      problems.push({ file: String(entry.file), reason: "no name" });
      continue;
    }
    byName.set(name, [...(byName.get(name) ?? []), { ...entry, name }]);
  }

  for (const [name, entries] of byName) {
    const rawKind = entries.find((e) => (UTIL_KINDS as string[]).includes(e.kind))?.kind;
    const kind = (rawKind ?? "smoke") as UtilKind;

    // Re-importing the same folder should add the missing shots, not a second throw
    // with the same name — and the unique index on (map, name) would reject it anyway.
    const [existing] = await db()
      .select()
      .from(throws)
      .where(and(eq(throws.map, map), eq(throws.name, name)))
      .limit(1);

    const target =
      existing ??
      (await createThrow({
        map,
        name,
        kind,
        landX: null,
        landY: null,
        level: "default",
        createdBy: auth.player.steamid64,
      }));

    const lineup = await createLineup({
      throwId: target.id,
      name: "imported",
      createdBy: auth.player.steamid64,
    });

    let stored = 0;
    for (const entry of entries) {
      const file = files.get(String(entry.file));
      if (!file) {
        problems.push({ file: String(entry.file), reason: "file not in the upload" });
        continue;
      }
      if (file.size > MAX_BYTES) {
        problems.push({ file: file.name, reason: "too large" });
        continue;
      }

      const bytes = new Uint8Array(await file.arrayBuffer());
      const sniffed = sniffImage(bytes);
      if (!sniffed.ok) {
        problems.push({ file: file.name, reason: sniffed.error });
        continue;
      }

      const shotKind: ShotKind = (SHOT_KINDS as string[]).includes(entry.shotKind)
        ? (entry.shotKind as ShotKind)
        : "stand";

      const shotId = crypto.randomUUID();
      const key = `lineups/${lineup.id}/${shotId}.${sniffed.ext}`;
      await putObject(key, bytes, sniffed.type);
      await db().insert(lineupShots).values({
        id: shotId,
        lineupId: lineup.id,
        r2Key: key,
        shotKind,
        idx: stored,
        uploadedBy: auth.player.steamid64,
      });
      stored += 1;
    }

    created.push({ name, throwId: target.id, shots: stored });
  }

  return Response.json({ ok: true, created, problems });
}
