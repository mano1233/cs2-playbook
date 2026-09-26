/**
 * Editing one lineup — where you stand and how you throw.
 *
 * Shared, like the throw it belongs to: fixing a lineup fixes it in every strat that
 * uses the throw, which is the whole point of the library.
 */
import { requireWriter } from "@/lib/auth";
import { TECHNIQUES, type Technique, deleteLineup, getLineup, updateLineup } from "@/lib/throws";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

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

  const patch: Record<string, unknown> = {};
  if (typeof body.name === "string") patch.name = body.name.trim().slice(0, 80) || null;
  if ((TECHNIQUES as string[]).includes(body.technique as string)) {
    patch.technique = body.technique as Technique;
  }
  if ("note" in body) {
    patch.note =
      typeof body.note === "string" && body.note.trim() ? body.note.trim().slice(0, 500) : null;
  }
  // Write once, for the same reason the landing point is. A lineup *is* the spot you
  // stand on; move it and the screenshots showing that spot are of somewhere else, with
  // nothing to indicate it. Another spot for the same landing point is another lineup —
  // which the model already supports, and is the honest way to record it.
  if ("throwX" in body && num(body.throwX) !== null) {
    if (current.throwX !== null || current.throwY !== null) {
      return Response.json(
        {
          error: "where a lineup is thrown from is fixed once set — add another lineup instead",
          throwX: current.throwX,
          throwY: current.throwY,
        },
        { status: 409 },
      );
    }
    patch.throwX = num(body.throwX);
    patch.throwY = num(body.throwY);
    patch.throwZ = num(body.throwZ);
  }

  const row = await updateLineup(id, patch);
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
