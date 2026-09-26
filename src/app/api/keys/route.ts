/**
 * Listing and creating API keys.
 *
 * Deliberately session-only: a key must not be able to mint another key. Otherwise one
 * leaked token becomes permanent access that revoking the original does not undo.
 */
import { requirePlayer, requireWriter } from "@/lib/auth";
import { createApiKey, listApiKeys } from "@/lib/api-keys";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requirePlayer();
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
  return Response.json({ keys: await listApiKeys(auth.player.steamid64) });
}

export async function POST(request: Request) {
  const auth = await requireWriter();
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
  if (auth.via === "api_key") {
    return Response.json({ error: "a key cannot create another key" }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as { name?: string };
  const created = await createApiKey(auth.player.steamid64, String(body.name ?? ""));
  // The only time the plaintext exists. It is not stored and cannot be shown again.
  return Response.json({ ok: true, key: created });
}
