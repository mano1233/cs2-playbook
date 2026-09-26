/**
 * Editing and deleting one throw.
 *
 * Every write here lands in every strat that references this throw. That is the point
 * of the library — fix a lineup once — but it also means the geometry is not something
 * a strat's autosave should be allowed to touch, which is why it has its own endpoint.
 */
import { radarFor } from "@/lib/radar";
import { requireWriter } from "@/lib/auth";
import {
  TECHNIQUES,
  type Technique,
  UTIL_KINDS,
  type UtilKind,
  deleteThrow,
  getThrow,
  updateThrow,
} from "@/lib/throws";

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

  const current = await getThrow(id);
  if (!current) return Response.json({ error: "no such throw" }, { status: 404 });

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return Response.json({ error: "bad json" }, { status: 400 });

  const cfg = radarFor(current.map)!;
  const patch: Record<string, unknown> = {};

  if (typeof body.name === "string" && body.name.trim()) {
    patch.name = body.name.trim().slice(0, 80);
  }
  if ((UTIL_KINDS as string[]).includes(body.kind as string)) patch.kind = body.kind as UtilKind;
  if ((TECHNIQUES as string[]).includes(body.technique as string)) {
    patch.technique = body.technique as Technique;
  }
  if (cfg.levels.some((l) => l.id === body.level)) patch.level = body.level;
  if ("note" in body) {
    patch.note = typeof body.note === "string" && body.note.trim() ? body.note.trim().slice(0, 500) : null;
  }

  // Landing point can move but cannot be removed: a throw with no target is not a throw.
  if (num(body.landX) !== null && num(body.landY) !== null) {
    patch.landX = num(body.landX);
    patch.landY = num(body.landY);
    patch.landZ = num(body.landZ);
  }
  // The origin is genuinely optional, so an explicit null clears it.
  if ("throwX" in body) {
    patch.throwX = num(body.throwX);
    patch.throwY = num(body.throwY);
    patch.throwZ = num(body.throwZ);
  }

  if (Object.keys(patch).length === 0) return Response.json({ ok: true, throw: current });

  try {
    const row = await updateThrow(id, patch);
    return Response.json({ ok: true, throw: row });
  } catch (err) {
    if (String((err as { code?: string }).code) === "23505") {
      return Response.json({ error: "that name is taken on this map" }, { status: 409 });
    }
    throw err;
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireWriter();
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  if (!UUID.test(id)) return Response.json({ error: "bad id" }, { status: 400 });

  const result = await deleteThrow(id);
  if (!result.ok) {
    // Refused rather than cascaded: removing this would quietly gut every exec using it.
    return Response.json(
      { error: `still used by ${result.usedBy} strat${result.usedBy === 1 ? "" : "s"}`, usedBy: result.usedBy },
      { status: 409 },
    );
  }
  return Response.json({ ok: true });
}
