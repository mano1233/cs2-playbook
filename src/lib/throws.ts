/**
 * The throw library.
 *
 * Three levels, because that is what the domain actually looks like:
 *
 *   throw    where a grenade lands. One per target — "heaven smoke" is one throw.
 *   lineup   a way to get it there: where you stand, and how you throw. A throw has
 *            several. The same heaven smoke goes from spawn, from ramp, standing or
 *            jump-thrown, and those are different instructions to a player.
 *   shot     a screenshot of one lineup: stand position, crosshair, result.
 *
 * Collapsing lineups into the throw was the mistake: it allowed exactly one origin per
 * landing point, so the second way to throw the same smoke had nowhere to live.
 *
 * All of it is map-scoped and shared. A strat references a throw; it does not own one.
 */
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { lineups, lineupShots, stratUtility, throws } from "@/db/schema";

export type UtilKind = "smoke" | "flash" | "he" | "molotov" | "decoy";
export type Technique = "stand" | "jump" | "run_jump" | "walk" | "run";
export type ShotKind = "stand" | "crosshair" | "result";

export const UTIL_KINDS: UtilKind[] = ["smoke", "flash", "he", "molotov", "decoy"];
export const TECHNIQUES: Technique[] = ["stand", "jump", "run_jump", "walk", "run"];
export const SHOT_KINDS: ShotKind[] = ["stand", "crosshair", "result"];

export interface LineupWithShots {
  lineup: typeof lineups.$inferSelect;
  shots: (typeof lineupShots.$inferSelect)[];
}

export interface ThrowWithLineups {
  item: typeof throws.$inferSelect;
  lineups: LineupWithShots[];
  /** How many strats reference it — shown before offering to delete one. */
  usedBy?: number;
}

/** Drizzle's inArray, but tolerant of an empty list rather than producing `in ()`. */
const inAny = (col: unknown, values: string[]) =>
  sql`${col} in ${values.length ? values : [""]}`;

async function hydrate(rows: (typeof throws.$inferSelect)[]): Promise<ThrowWithLineups[]> {
  if (rows.length === 0) return [];
  const d = db();
  const ids = rows.map((r) => r.id);

  const lineupRows = await d
    .select()
    .from(lineups)
    .where(inAny(lineups.throwId, ids))
    .orderBy(asc(lineups.idx));

  const shotRows = lineupRows.length
    ? await d
        .select()
        .from(lineupShots)
        .where(inAny(lineupShots.lineupId, lineupRows.map((l) => l.id)))
        .orderBy(asc(lineupShots.idx))
    : [];

  const uses = await d
    .select({ throwId: stratUtility.throwId, n: sql<number>`count(*)` })
    .from(stratUtility)
    .where(inAny(stratUtility.throwId, ids))
    .groupBy(stratUtility.throwId);

  return rows.map((item) => ({
    item,
    lineups: lineupRows
      .filter((l) => l.throwId === item.id)
      .map((lineup) => ({
        lineup,
        shots: shotRows.filter((s) => s.lineupId === lineup.id),
      })),
    usedBy: Number(uses.find((u) => u.throwId === item.id)?.n ?? 0),
  }));
}

export async function listThrows(map: string): Promise<ThrowWithLineups[]> {
  const rows = await db()
    .select()
    .from(throws)
    .where(eq(throws.map, map))
    .orderBy(asc(throws.kind), asc(throws.name));
  return hydrate(rows);
}

export async function getThrow(id: string) {
  const [row] = await db().select().from(throws).where(eq(throws.id, id)).limit(1);
  return row ?? null;
}

export async function getThrowFull(id: string): Promise<ThrowWithLineups | null> {
  const row = await getThrow(id);
  if (!row) return null;
  return (await hydrate([row]))[0] ?? null;
}

/**
 * Names are unique per map, so click-to-place has to pick one that is free. "smoke 3"
 * is not a good name, but it is one field to fix — whereas demanding a name before the
 * first marker lands is exactly the friction this editor exists to avoid.
 */
export async function nextThrowName(map: string, kind: UtilKind) {
  const existing = await db()
    .select({ name: throws.name })
    .from(throws)
    .where(and(eq(throws.map, map), sql`${throws.name} like ${kind + " %"}`));

  const used = new Set(
    existing.map((e) => Number(e.name.slice(kind.length + 1))).filter(Number.isInteger),
  );
  let n = 1;
  while (used.has(n)) n += 1;
  return `${kind} ${n}`;
}

export async function createThrow(input: {
  map: string;
  name: string;
  kind: UtilKind;
  /** Null for an imported throw: a filename cannot say where a grenade lands. */
  landX: number | null;
  landY: number | null;
  landZ?: number | null;
  level: string;
  createdBy: string;
}) {
  const [row] = await db()
    .insert(throws)
    .values({
      map: input.map,
      name: input.name,
      kind: input.kind,
      landX: input.landX,
      landY: input.landY,
      landZ: input.landZ ?? null,
      level: input.level as never,
      createdBy: input.createdBy,
    })
    .returning();
  return row!;
}

export async function updateThrow(id: string, patch: Partial<typeof throws.$inferInsert>) {
  const [row] = await db().update(throws).set(patch).where(eq(throws.id, id)).returning();
  return row ?? null;
}

/** Refuses while any strat still references it, rather than quietly gutting execs. */
export async function deleteThrow(id: string) {
  const [row] = await db()
    .select({ n: sql<number>`count(*)` })
    .from(stratUtility)
    .where(eq(stratUtility.throwId, id));

  const usedBy = Number(row?.n ?? 0);
  if (usedBy > 0) return { ok: false as const, usedBy };
  await db().delete(throws).where(eq(throws.id, id));
  return { ok: true as const };
}

// ---- lineups: the ways to throw it ---------------------------------------

export async function createLineup(input: {
  throwId: string;
  name?: string | null;
  createdBy: string;
}) {
  const existing = await db().select().from(lineups).where(eq(lineups.throwId, input.throwId));
  const [row] = await db()
    .insert(lineups)
    .values({
      throwId: input.throwId,
      // Numbered rather than named, for the same reason throws are.
      name: input.name ?? `lineup ${existing.length + 1}`,
      idx: existing.length,
      createdBy: input.createdBy,
    })
    .returning();
  return row!;
}

export async function getLineup(id: string) {
  const [row] = await db().select().from(lineups).where(eq(lineups.id, id)).limit(1);
  return row ?? null;
}

export async function updateLineup(id: string, patch: Partial<typeof lineups.$inferInsert>) {
  const [row] = await db().update(lineups).set(patch).where(eq(lineups.id, id)).returning();
  return row ?? null;
}

export async function deleteLineup(id: string) {
  await db().delete(lineups).where(eq(lineups.id, id));
}

export async function getShot(id: string) {
  const [row] = await db().select().from(lineupShots).where(eq(lineupShots.id, id)).limit(1);
  return row ?? null;
}

export async function deleteShot(id: string) {
  await db().delete(lineupShots).where(eq(lineupShots.id, id));
}

/**
 * The client shape of a throw. One function, used by both the API and the editor page,
 * because two hand-written copies of this drifted apart the moment the model changed.
 */
export function serialiseThrow({ item, lineups, usedBy }: ThrowWithLineups) {
  return {
    id: item.id,
    name: item.name,
    kind: item.kind,
    landX: item.landX,
    landY: item.landY,
    landZ: item.landZ,
    level: item.level,
    note: item.note,
    usedBy,
    lineups: lineups.map(({ lineup, shots }) => ({
      id: lineup.id,
      name: lineup.name,
      throwX: lineup.throwX,
      throwY: lineup.throwY,
      throwZ: lineup.throwZ,
      technique: lineup.technique,
      note: lineup.note,
      shots: shots.map((s) => ({ id: s.id, shotKind: s.shotKind, idx: s.idx })),
    })),
  };
}
