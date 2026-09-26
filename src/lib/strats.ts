/**
 * Reading and writing strats.
 *
 * A strat is a small tree — phases, each with assignments and utility — and it is
 * always loaded whole. Five teammates and a few dozen strats per map is not a scale
 * where lazy-loading a phase earns anything, and having the whole thing in hand is what
 * lets the editor autosave a coherent snapshot rather than a stream of field edits.
 */
import { and, asc, count, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  assignments,
  lineups,
  phases,
  players,
  strats,
  stratRevisions,
  utility,
} from "@/db/schema";

export type Side = "t" | "ct";
export type StratKind = "exec" | "default" | "retake" | "after_plant" | "anti_eco";
export type StratStatus = "experimental" | "drilled" | "retired";

export const SIDES: Side[] = ["t", "ct"];

export const KINDS: { id: StratKind; label: string; sides: Side[] }[] = [
  { id: "exec", label: "Exec", sides: ["t"] },
  { id: "default", label: "Default", sides: ["t", "ct"] },
  { id: "retake", label: "Retake", sides: ["ct"] },
  { id: "after_plant", label: "After-plant", sides: ["t", "ct"] },
  { id: "anti_eco", label: "Anti-eco", sides: ["t", "ct"] },
];

export const STATUSES: { id: StratStatus; label: string; hint: string }[] = [
  { id: "experimental", label: "Experimental", hint: "written down, not drilled yet" },
  { id: "drilled", label: "Drilled", hint: "the team has actually run it" },
  { id: "retired", label: "Retired", hint: "kept for reference, not in the plan" },
];

export function kindsForSide(side: Side) {
  return KINDS.filter((k) => k.sides.includes(side));
}

/** How many strats exist per map and side, for the map grid. */
export async function stratCounts() {
  const rows = await db()
    .select({ map: strats.map, side: strats.side, n: count() })
    .from(strats)
    .where(sql`${strats.status} <> 'retired'`)
    .groupBy(strats.map, strats.side);

  const out: Record<string, Record<Side, number>> = {};
  for (const r of rows) {
    out[r.map] ??= { t: 0, ct: 0 };
    out[r.map]![r.side as Side] = Number(r.n);
  }
  return out;
}

export async function listStrats(map: string, side: Side) {
  return db()
    .select({
      id: strats.id,
      name: strats.name,
      kind: strats.kind,
      target: strats.target,
      status: strats.status,
      updatedAt: strats.updatedAt,
      author: players.nickname,
      phaseCount: sql<number>`(select count(*) from ${phases} where ${phases.stratId} = ${strats.id})`,
      utilityCount: sql<number>`(
        select count(*) from ${utility}
        join ${phases} p on p.id = ${utility.phaseId}
        where p.strat_id = ${strats.id}
      )`,
    })
    .from(strats)
    .leftJoin(players, eq(players.steamid64, strats.createdBy))
    .where(and(eq(strats.map, map), eq(strats.side, side)))
    .orderBy(desc(strats.updatedAt));
}

export interface FullStrat {
  strat: typeof strats.$inferSelect;
  phases: {
    phase: typeof phases.$inferSelect;
    assignments: (typeof assignments.$inferSelect)[];
    utility: {
      item: typeof utility.$inferSelect;
      lineups: (typeof lineups.$inferSelect)[];
    }[];
  }[];
}

export async function getStrat(id: string): Promise<FullStrat | null> {
  const d = db();
  const [row] = await d.select().from(strats).where(eq(strats.id, id)).limit(1);
  if (!row) return null;

  const phaseRows = await d
    .select()
    .from(phases)
    .where(eq(phases.stratId, id))
    .orderBy(asc(phases.idx));

  const phaseIds = phaseRows.map((p) => p.id);
  if (phaseIds.length === 0) return { strat: row, phases: [] };

  const [assignmentRows, utilityRows] = await Promise.all([
    d.select().from(assignments).where(inAny(assignments.phaseId, phaseIds)),
    d.select().from(utility).where(inAny(utility.phaseId, phaseIds)),
  ]);

  const utilityIds = utilityRows.map((u) => u.id);
  const lineupRows = utilityIds.length
    ? await d
        .select()
        .from(lineups)
        .where(inAny(lineups.utilityId, utilityIds))
        .orderBy(asc(lineups.idx))
    : [];

  return {
    strat: row,
    phases: phaseRows.map((phase) => ({
      phase,
      assignments: assignmentRows.filter((a) => a.phaseId === phase.id),
      utility: utilityRows
        .filter((u) => u.phaseId === phase.id)
        .map((item) => ({
          item,
          lineups: lineupRows.filter((l) => l.utilityId === item.id),
        })),
    })),
  };
}

/** Drizzle's inArray, but tolerant of an empty list rather than producing `in ()`. */
function inAny<T extends { }>(col: T, values: string[]) {
  return sql`${col} in ${values.length ? values : [""]}`;
}

export async function createStrat(input: {
  map: string;
  side: Side;
  name: string;
  kind: StratKind;
  target?: string | null;
  createdBy: string;
}) {
  const d = db();
  const [row] = await d
    .insert(strats)
    .values({
      map: input.map,
      side: input.side,
      name: input.name,
      kind: input.kind,
      target: input.target ?? null,
      createdBy: input.createdBy,
    })
    .returning();

  // A strat with no phase cannot be edited — the creator needs somewhere to put the
  // first marker — so every strat starts with one. CT setups are not timed, so the
  // name differs from a T-side exec.
  await d.insert(phases).values({
    stratId: row!.id,
    idx: 0,
    name: input.side === "ct" ? "Setup" : "Exec",
    clockOffsetS: 0,
  });

  return row!;
}

/**
 * Optimistic concurrency. The caller sends the version it loaded; a mismatch means
 * someone else saved in between and this write would silently discard their edit.
 */
export async function touchStrat(id: string, expectedVersion: number, editedBy: string) {
  const [row] = await db()
    .update(strats)
    .set({ version: expectedVersion + 1, updatedAt: new Date() })
    .where(and(eq(strats.id, id), eq(strats.version, expectedVersion)))
    .returning();

  if (!row) return { ok: false as const, reason: "version_conflict" as const };
  void editedBy;
  return { ok: true as const, strat: row };
}

export async function snapshot(stratId: string, editedBy: string) {
  const full = await getStrat(stratId);
  if (!full) return;
  await db().insert(stratRevisions).values({
    stratId,
    snapshot: full as unknown as Record<string, unknown>,
    editedBy,
  });
}

export async function deleteStrat(id: string) {
  await db().delete(strats).where(eq(strats.id, id));
}
