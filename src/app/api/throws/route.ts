/**
 * The throw library: list and create.
 *
 * Writes here are immediate, not debounced. A throw is shared across every strat that
 * references it, so changing one is a deliberate act rather than a side effect of
 * tweaking an exec — and the editor needs the created row back before it can reference
 * it anyway.
 */
import { requireWriter, requirePlayer } from "@/lib/auth";
import { radarFor } from "@/lib/radar";
import {
  UTIL_KINDS,
  type UtilKind,
  TECHNIQUES,
  type Technique,
  createLineup,
  createThrow,
  getThrowFull,
  updateLineup,
  listThrows,
  nextThrowName,
  serialiseThrow,
} from "@/lib/throws";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requirePlayer();
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

  const map = new URL(request.url).searchParams.get("map") ?? "";
  if (!radarFor(map)) return Response.json({ error: "unknown map" }, { status: 404 });

  const rows = await listThrows(map);
  return Response.json({ throws: rows.map(serialiseThrow) });
}

export async function POST(request: Request) {
  const auth = await requireWriter();
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return Response.json({ error: "bad json" }, { status: 400 });

  const map = typeof body.map === "string" ? body.map : "";
  const cfg = radarFor(map);
  if (!cfg) return Response.json({ error: "unknown map" }, { status: 404 });

  const kind = (UTIL_KINDS as string[]).includes(body.kind as string)
    ? (body.kind as UtilKind)
    : "smoke";

  const landX = typeof body.landX === "number" ? body.landX : null;
  const landY = typeof body.landY === "number" ? body.landY : null;
  if (landX === null || landY === null) {
    return Response.json({ error: "a throw needs a landing point" }, { status: 400 });
  }

  const level = cfg.levels.some((l) => l.id === body.level) ? (body.level as string) : "default";

  // Auto-named so placing a marker never stops to ask. The name is one field to fix,
  // and demanding one before the first marker lands is exactly the friction this
  // editor exists to avoid.
  const name =
    typeof body.name === "string" && body.name.trim()
      ? body.name.trim().slice(0, 80)
      : await nextThrowName(map, kind);

  try {
    // Both positions are captured here, at creation, because both are write-once: a
    // throw made without its spot would be permanently half-formed. The one exception
    // is import, which has no positions at all to give and fills them in later.
    const lineupIn = (body.lineup ?? null) as Record<string, unknown> | null;

    const row = await createThrow({
      map,
      name,
      kind,
      landX,
      landY,
      landZ: typeof body.landZ === "number" ? body.landZ : null,
      level,
      createdBy: auth.player.steamid64,
    });
    if (lineupIn) {
      const lineup = await createLineup({
        throwId: row.id,
        name: typeof lineupIn.name === "string" && lineupIn.name.trim()
          ? lineupIn.name.trim().slice(0, 80)
          : null,
        createdBy: auth.player.steamid64,
      });
      const tx = typeof lineupIn.throwX === "number" ? lineupIn.throwX : null;
      const ty = typeof lineupIn.throwY === "number" ? lineupIn.throwY : null;
      await updateLineup(lineup.id, {
        throwX: tx,
        throwY: ty,
        throwZ: typeof lineupIn.throwZ === "number" ? lineupIn.throwZ : null,
        technique: (TECHNIQUES as string[]).includes(lineupIn.technique as string)
          ? (lineupIn.technique as Technique)
          : "stand",
      });
    }

    const full = await getThrowFull(row.id);
    return Response.json({ ok: true, throw: serialiseThrow(full!) });
  } catch (err) {
    // The unique index on (map, name) is what keeps the library from filling with
    // three different "heaven smoke" entries.
    if (String((err as { code?: string }).code) === "23505") {
      return Response.json({ error: "a throw with that name already exists on this map" }, { status: 409 });
    }
    throw err;
  }
}
