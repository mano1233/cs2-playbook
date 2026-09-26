/**
 * Uploads a screenshot for one lineup.
 *
 * Shots hang off the lineup, not the throw: a throw has several ways to land it, and
 * each way has its own stand position and crosshair. Attaching them to the throw would
 * mix three lineups' screenshots into one pile.
 *
 * The bytes are sniffed by magic number. An HTML file named .png is the case that
 * matters — served back from our own origin it would execute as our own page — so the
 * declared content type and the filename are both ignored.
 */
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { lineupShots } from "@/db/schema";
import { requireWriter } from "@/lib/auth";
import { MAX_BYTES, sniffImage } from "@/lib/images";
import { putObject } from "@/lib/r2";
import { SHOT_KINDS, type ShotKind, getLineup } from "@/lib/throws";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireWriter();
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  if (!UUID.test(id)) return Response.json({ error: "bad id" }, { status: 400 });
  if (!(await getLineup(id))) return Response.json({ error: "no such lineup" }, { status: 404 });

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "expected a file field" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) return Response.json({ error: "too large" }, { status: 413 });

  const bytes = new Uint8Array(await file.arrayBuffer());
  const sniffed = sniffImage(bytes);
  if (!sniffed.ok) return Response.json({ error: sniffed.error }, { status: 400 });

  const raw = String(form?.get("shotKind") ?? "stand");
  const shotKind: ShotKind = (SHOT_KINDS as string[]).includes(raw) ? (raw as ShotKind) : "stand";

  const existing = await db()
    .select()
    .from(lineupShots)
    .where(eq(lineupShots.lineupId, id))
    .orderBy(asc(lineupShots.idx));

  const shotId = crypto.randomUUID();
  const key = `lineups/${id}/${shotId}.${sniffed.ext}`;
  await putObject(key, bytes, sniffed.type);

  const [row] = await db()
    .insert(lineupShots)
    .values({
      id: shotId,
      lineupId: id,
      r2Key: key,
      shotKind,
      idx: existing.length,
      uploadedBy: auth.player.steamid64,
    })
    .returning();

  return Response.json({ ok: true, shot: { id: row!.id, shotKind: row!.shotKind, idx: row!.idx } });
}
