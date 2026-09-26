import { requireWriter } from "@/lib/auth";
import { revokeApiKey } from "@/lib/api-keys";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireWriter();
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  if (!UUID.test(id)) return Response.json({ error: "bad id" }, { status: 400 });

  // Scoped to the caller's own keys: revoking is not an admin action over the roster.
  const row = await revokeApiKey(id, auth.player.steamid64);
  if (!row) return Response.json({ error: "no such key" }, { status: 404 });
  return Response.json({ ok: true });
}
