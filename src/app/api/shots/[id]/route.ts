/**
 * Serves and deletes one lineup screenshot.
 *
 * The object key is looked up from the row rather than built from the request, so no
 * caller can name an object. That is a stronger guarantee than validating a key: the
 * only reachable objects are rows that exist.
 */
import { requirePlayer, requireWriter } from "@/lib/auth";
import { deleteObject, getObject } from "@/lib/r2";
import { deleteShot, getShot } from "@/lib/throws";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requirePlayer();
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  if (!UUID.test(id)) return Response.json({ error: "bad id" }, { status: 400 });

  const row = await getShot(id);
  if (!row) return Response.json({ error: "no such shot" }, { status: 404 });

  const object = await getObject(row.r2Key);
  if (!object) return Response.json({ error: "image missing from storage" }, { status: 404 });

  return new Response(object.body, {
    headers: {
      "content-type": object.contentType,
      ...(object.contentLength ? { "content-length": String(object.contentLength) } : {}),
      "cache-control": "private, max-age=604800, immutable",
      // Belt and braces: the bytes are sniffed on upload, but tell the browser not to
      // second-guess the type, and forbid scripts if one ever got through.
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

  const { id } = await params;
  if (!UUID.test(id)) return Response.json({ error: "bad id" }, { status: 400 });

  const row = await getShot(id);
  if (!row) return Response.json({ error: "no such shot" }, { status: 404 });

  // Row first: an orphaned object costs a few KB, whereas a row pointing at bytes that
  // are gone shows as a broken image mid-match.
  await deleteShot(row.id);
  await deleteObject(row.r2Key).catch(() => {});
  return Response.json({ ok: true });
}
