/**
 * Adds a lineup to a throw: another way to land the same grenade.
 *
 * Created empty and positioned afterwards when the origin is set by clicking the radar,
 * since the row has to exist before there is anything to click for. With a getpos the
 * spot is known up front, so it can arrive with the lineup in one call.
 */
import { requireWriter } from "@/lib/auth";
import { createLineup, getLineup, getThrow, lineupPatchFrom, updateLineup } from "@/lib/throws";

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
  const owner = await getThrow(id);
  if (!owner) return Response.json({ error: "no such throw" }, { status: 404 });

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const result = lineupPatchFrom(body, null, { map: owner.map, level: owner.level });
  if (!result.ok) {
    const { status, ...rest } = result;
    return Response.json(rest, { status });
  }

  const row = await createLineup({
    throwId: id,
    name: result.patch.name ?? null,
    createdBy: auth.player.steamid64,
  });
  const { name: _name, ...rest } = result.patch;
  if (Object.keys(rest).length) await updateLineup(row.id, rest);
  return Response.json({ ok: true, lineup: { ...(await getLineup(row.id))!, shots: [] } });
}
