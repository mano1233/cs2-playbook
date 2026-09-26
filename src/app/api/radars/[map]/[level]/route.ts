/**
 * Serves a map's radar image from R2.
 *
 * The bucket is private, so this proxies rather than redirecting to an object URL: a
 * signed URL would outlive the session that produced it and could be passed around,
 * which is the thing the roster allowlist exists to prevent.
 *
 * Both path segments are checked against radars.json before a key is built. Without
 * that, `map` and `level` are attacker-controlled strings being concatenated into an
 * object key, which is how a proxy turns into a way to read the rest of the bucket —
 * including the lineup screenshots.
 */
import { requirePlayer } from "@/lib/auth";
import { getObject } from "@/lib/r2";
import { radarFor } from "@/lib/radar";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ map: string; level: string }> },
) {
  const auth = await requirePlayer();
  if (!auth.ok) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  const { map, level } = await params;

  const cfg = radarFor(map);
  if (!cfg) return Response.json({ error: "unknown map" }, { status: 404 });
  if (!cfg.levels.some((l) => l.id === level)) {
    return Response.json({ error: "unknown level for this map" }, { status: 404 });
  }

  const object = await getObject(`radars/${map}__${level}.png`);
  if (!object) {
    // Calibration without an image: the map is known, its picture has not been
    // uploaded. Worth distinguishing from an unknown map when something is missing.
    return Response.json({ error: "no radar image uploaded for this map" }, { status: 404 });
  }

  return new Response(object.body, {
    headers: {
      "content-type": object.contentType,
      ...(object.contentLength ? { "content-length": String(object.contentLength) } : {}),
      ...(object.etag ? { etag: object.etag } : {}),
      // Private: the response is per-viewer because it is behind a session, but the
      // bytes never change, so the browser should keep them.
      "cache-control": "private, max-age=604800, immutable",
    },
  });
}
