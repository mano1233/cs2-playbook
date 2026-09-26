/**
 * Serves and deletes a lineup screenshot.
 *
 * The key is looked up from the database by id rather than built from the request, so
 * there is no path for a caller to name an object. That is a stronger guarantee than
 * validating a key would be: the only reachable objects are rows that exist.
 */
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { lineups } from "@/db/schema";
import { requirePlayer, requireWriter } from "@/lib/auth";
import { deleteObject, getObject } from "@/lib/r2";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function lookup(id: string) {
  if (!UUID.test(id)) return null;
  const [row] = await db().select().from(lineups).where(eq(lineups.id, id)).limit(1);
  return row ?? null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requirePlayer();
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

  const row = await lookup((await params).id);
  if (!row) return Response.json({ error: "no such lineup" }, { status: 404 });

  const object = await getObject(row.r2Key);
  if (!object) {
    // Row without bytes: worth distinguishing, because it means an upload half
    // succeeded rather than that the id is wrong.
    return Response.json({ error: "image missing from storage" }, { status: 404 });
  }

  return new Response(object.body, {
    headers: {
      "content-type": object.contentType,
      ...(object.contentLength ? { "content-length": String(object.contentLength) } : {}),
      "cache-control": "private, max-age=604800, immutable",
      // Belt and braces: even though the bytes are sniffed on upload, tell the browser
      // not to second-guess the type, and forbid scripts if one ever got through.
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; img-src 'self'; sandbox",
    },
  });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireWriter();
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

  const row = await lookup((await params).id);
  if (!row) return Response.json({ error: "no such lineup" }, { status: 404 });

  // Row first: an orphaned object costs a few KB, whereas a row pointing at bytes that
  // are gone shows up as a broken image in the card view mid-match.
  await db().delete(lineups).where(eq(lineups.id, row.id));
  await deleteObject(row.r2Key).catch(() => {});

  return Response.json({ ok: true });
}
