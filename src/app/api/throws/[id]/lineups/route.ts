/**
 * Adds a lineup to a throw: another way to land the same grenade.
 *
 * Created empty and positioned afterwards, because the origin is set by clicking the
 * radar and the row has to exist before there is anything to click for.
 */
import { requireWriter } from "@/lib/auth";
import { createLineup, getThrow } from "@/lib/throws";

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
  if (!(await getThrow(id))) return Response.json({ error: "no such throw" }, { status: 404 });

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const name =
    typeof body.name === "string" && body.name.trim() ? body.name.trim().slice(0, 80) : null;

  const row = await createLineup({ throwId: id, name, createdBy: auth.player.steamid64 });
  return Response.json({ ok: true, lineup: { ...row, shots: [] } });
}
