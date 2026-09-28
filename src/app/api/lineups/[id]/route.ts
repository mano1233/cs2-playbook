/**
 * Editing one lineup — where you stand and how you throw.
 *
 * Shared, like the throw it belongs to: fixing a lineup fixes it in every strat that
 * uses the throw, which is the whole point of the library.
 */
import { requireWriter } from "@/lib/auth";
import { deleteLineup, getLineup, getThrow, lineupPatchFrom, updateLineup } from "@/lib/throws";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireWriter();
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  if (!UUID.test(id)) return Response.json({ error: "bad id" }, { status: 400 });
  const current = await getLineup(id);
  if (!current) return Response.json({ error: "no such lineup" }, { status: 404 });

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return Response.json({ error: "bad json" }, { status: 400 });

  // Validation, and the write-once rule for where it is thrown from, live in
  // lineupPatchFrom so every route that writes a lineup enforces them the same way.
  const owner = (await getThrow(current.throwId))!;
  const result = lineupPatchFrom(body, current, { map: owner.map, level: owner.level });
  if (!result.ok) {
    const { status, ...rest } = result;
    return Response.json(rest, { status });
  }

  const row = await updateLineup(id, result.patch);
  return Response.json({ ok: true, lineup: row });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireWriter();
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  if (!UUID.test(id)) return Response.json({ error: "bad id" }, { status: 400 });
  // Shots cascade with it: a screenshot of a lineup that no longer exists has nothing
  // to attach to.
  await deleteLineup(id);
  return Response.json({ ok: true });
}
