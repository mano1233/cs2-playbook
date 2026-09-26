/**
 * Uploads a lineup screenshot for one throw.
 *
 * Screenshots hang off the shared throw, not off a strat, which is the whole reason the
 * library exists: the heaven smoke is photographed once and every exec that references
 * it gets the pictures.
 *
 * Lineups are uploaded immediately rather than carried in the strat save: a screenshot
 * is megabytes and the strat save runs on a one-second debounce, so bundling them would
 * mean re-sending every image on every keystroke.
 *
 * The uploaded bytes are sniffed by magic number. An HTML file named .png is the case
 * that matters — served back from our own origin it would execute as our own page — so
 * the declared content type and the filename are both ignored.
 */
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { lineups, throws } from "@/db/schema";
import { requireWriter } from "@/lib/auth";
import { MAX_BYTES, sniffImage } from "@/lib/images";
import { putObject } from "@/lib/r2";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHOT_KINDS = ["stand", "crosshair", "result"] as const;
type ShotKind = (typeof SHOT_KINDS)[number];

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireWriter();
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  if (!UUID.test(id)) return Response.json({ error: "bad id" }, { status: 400 });

  // The throw must already exist: a lineup with nothing to attach to is orphaned
  // storage, and the foreign key would reject it anyway.
  const [target] = await db().select().from(throws).where(eq(throws.id, id)).limit(1);
  if (!target) return Response.json({ error: "no such throw" }, { status: 404 });

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "expected a file field" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return Response.json({ error: "too large" }, { status: 413 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const sniffed = sniffImage(bytes);
  if (!sniffed.ok) return Response.json({ error: sniffed.error }, { status: 400 });

  const rawKind = String(form?.get("shotKind") ?? "stand");
  const shotKind: ShotKind = (SHOT_KINDS as readonly string[]).includes(rawKind)
    ? (rawKind as ShotKind)
    : "stand";

  const existing = await db().select().from(lineups).where(eq(lineups.throwId, id));
  const lineupId = crypto.randomUUID();
  const key = `lineups/${id}/${lineupId}.${sniffed.ext}`;

  await putObject(key, bytes, sniffed.type);

  const [row] = await db()
    .insert(lineups)
    .values({
      id: lineupId,
      throwId: id,
      r2Key: key,
      shotKind,
      idx: existing.length,
      uploadedBy: auth.player.steamid64,
    })
    .returning();

  return Response.json({
    ok: true,
    lineup: { id: row!.id, shotKind: row!.shotKind, idx: row!.idx },
  });
}
