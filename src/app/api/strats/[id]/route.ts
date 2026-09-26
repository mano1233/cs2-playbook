/**
 * Saves a whole strat.
 *
 * The editor holds the entire tree and sends it back on every save rather than
 * streaming field-level patches. At five teammates and a few dozen markers that costs
 * nothing, and it means a save is one coherent state rather than a sequence that can
 * half-apply and leave a phase pointing at utility that no longer exists.
 *
 * The version check is the important part. Two people editing the same strat during a
 * review session is the realistic collision, and silently discarding one of their
 * edits is the failure that would lose trust in the tool — so a stale version is
 * rejected and the editor is told to reload.
 */
import { and, eq, notInArray } from "drizzle-orm";
import { db } from "@/db";
import { assignments, phases, stratUtility, strats, throws } from "@/db/schema";
import { requireWriter } from "@/lib/auth";
import { radarFor } from "@/lib/radar";
import { KINDS, STATUSES, getStrat, snapshot } from "@/lib/strats";

export const dynamic = "force-dynamic";

// `as const` so the guards below narrow to the column's union type rather than to
// `string`, which the enum columns reject.
const ACTIONS = ["hold", "entry", "trade", "lurk", "drop", "throw", "support"] as const;
const LEVELS = ["default", "lower"] as const;

type Action = (typeof ACTIONS)[number];
type Level = (typeof LEVELS)[number];

const oneOf = <T extends readonly string[]>(allowed: T, v: unknown, fallback: T[number]): T[number] =>
  typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T[number]) : fallback;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function str(v: unknown, max = 500): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireWriter();
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  if (!UUID.test(id)) return Response.json({ error: "bad id" }, { status: 400 });

  const existing = await getStrat(id);
  if (!existing) return Response.json({ error: "no such strat" }, { status: 404 });

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return Response.json({ error: "bad json" }, { status: 400 });

  const version = num(body.version);
  if (version === null) return Response.json({ error: "missing version" }, { status: 400 });
  if (version !== existing.strat.version) {
    return Response.json(
      { error: "version_conflict", currentVersion: existing.strat.version },
      { status: 409 },
    );
  }

  const cfg = radarFor(existing.strat.map)!;
  // Every throw this strat references must be on this map. Without the check, a strat
  // could point at a Mirage smoke and render it at Nuke coordinates.
  const mapThrows = new Set(
    (await db().select({ id: throws.id }).from(throws).where(eq(throws.map, existing.strat.map)))
      .map((t) => t.id),
  );
  const levelIds = cfg.levels.map((l) => l.id);
  // Narrowed to the enum *and* checked against what this map actually declares, so a
  // flat map cannot be given a "lower" marker that nothing would ever render.
  const levelOf = (v: unknown): Level => {
    const lvl = oneOf(LEVELS, v, "default");
    return levelIds.includes(lvl) ? lvl : "default";
  };

  const name = str(body.name, 120) ?? existing.strat.name;
  const kind = KINDS.some((k) => k.id === body.kind)
    ? (body.kind as typeof existing.strat.kind)
    : existing.strat.kind;
  const status = STATUSES.some((x) => x.id === body.status)
    ? (body.status as typeof existing.strat.status)
    : existing.strat.status;
  const target = str(body.target, 40);
  const description = str(body.description, 4000);

  const incoming = Array.isArray(body.phases) ? body.phases : [];

  const d = db();

  // One revision per save session, coalesced: a 10-minute window per editor, so an
  // afternoon of tweaking leaves a handful of restore points rather than hundreds.
  const lastRevisionAge = Date.now() - new Date(existing.strat.updatedAt).getTime();
  if (lastRevisionAge > 10 * 60 * 1000) {
    await snapshot(id, auth.player.steamid64);
  }

  const keptPhaseIds: string[] = [];

  for (const [idx, raw] of incoming.entries()) {
    const p = raw as Record<string, unknown>;
    const phaseId = typeof p.id === "string" && UUID.test(p.id) ? p.id : crypto.randomUUID();
    keptPhaseIds.push(phaseId);

    const values = {
      id: phaseId,
      stratId: id,
      idx,
      name: str(p.name, 60) ?? `Phase ${idx + 1}`,
      clockOffsetS: Math.max(0, Math.min(115, Math.round(num(p.clockOffsetS) ?? 0))),
      note: str(p.note, 1000),
    };
    await d.insert(phases).values(values).onConflictDoUpdate({
      target: phases.id,
      set: { idx: values.idx, name: values.name, clockOffsetS: values.clockOffsetS, note: values.note },
    });

    const keptAssignments: string[] = [];
    for (const rawA of Array.isArray(p.assignments) ? p.assignments : []) {
      const a = rawA as Record<string, unknown>;
      const aid = typeof a.id === "string" && UUID.test(a.id) ? a.id : crypto.randomUUID();
      keptAssignments.push(aid);
      const av = {
        id: aid,
        phaseId,
        playerSteamid64: str(a.playerSteamid64, 20),
        x: num(a.x),
        y: num(a.y),
        z: num(a.z),
        level: levelOf(a.level),
        action: oneOf(ACTIONS, a.action, "hold") satisfies Action,
        note: str(a.note, 500),
      };
      await d.insert(assignments).values(av).onConflictDoUpdate({
        target: assignments.id,
        set: av,
      });
    }
    await d.delete(assignments).where(
      keptAssignments.length
        ? and(eq(assignments.phaseId, phaseId), notInArray(assignments.id, keptAssignments))
        : eq(assignments.phaseId, phaseId),
    );

    const keptUtility: string[] = [];
    for (const rawU of Array.isArray(p.utility) ? p.utility : []) {
      const u = rawU as Record<string, unknown>;
      const throwId = typeof u.throwId === "string" && UUID.test(u.throwId) ? u.throwId : null;
      // A reference to nothing is not a strat instruction. Dropped rather than stored.
      if (!throwId || !mapThrows.has(throwId)) continue;

      const uid = typeof u.id === "string" && UUID.test(u.id) ? u.id : crypto.randomUUID();
      keptUtility.push(uid);
      const uv = {
        id: uid,
        phaseId,
        throwId,
        throwerSteamid64: str(u.throwerSteamid64, 20),
        note: str(u.note, 500),
      };
      await d.insert(stratUtility).values(uv).onConflictDoUpdate({
        target: stratUtility.id,
        set: uv,
      });
    }
    // Only the reference goes; the throw itself survives, because other strats use it.
    await d.delete(stratUtility).where(
      keptUtility.length
        ? and(eq(stratUtility.phaseId, phaseId), notInArray(stratUtility.id, keptUtility))
        : eq(stratUtility.phaseId, phaseId),
    );
  }

  await d.delete(phases).where(
    keptPhaseIds.length
      ? and(eq(phases.stratId, id), notInArray(phases.id, keptPhaseIds))
      : eq(phases.stratId, id),
  );

  const [saved] = await d
    .update(strats)
    .set({
      name,
      kind,
      status,
      target,
      description,
      version: version + 1,
      updatedAt: new Date(),
    })
    .where(and(eq(strats.id, id), eq(strats.version, version)))
    .returning();

  if (!saved) {
    return Response.json({ error: "version_conflict" }, { status: 409 });
  }

  return Response.json({ ok: true, version: saved.version });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireWriter();
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  if (!UUID.test(id)) return Response.json({ error: "bad id" }, { status: 400 });

  await db().delete(strats).where(eq(strats.id, id));
  return Response.json({ ok: true });
}
