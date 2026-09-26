/**
 * The throw library.
 *
 * A throw is map-scoped and shared: the same heaven smoke is referenced by every A exec
 * that uses it, and its screenshots are uploaded once. That is the point of splitting it
 * out of the strat — but it has a consequence worth being deliberate about, which is
 * that moving a marker changes it in every strat that references it.
 *
 * So throws are written through their own endpoints, immediately, rather than riding
 * along in the strat's debounced autosave. Editing something shared should feel like a
 * separate act, not a side effect of tweaking one exec.
 */
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { lineups, stratUtility, throws } from "@/db/schema";

export type UtilKind = "smoke" | "flash" | "he" | "molotov" | "decoy";
export type Technique = "stand" | "jump" | "run_jump" | "walk" | "run";

export const UTIL_KINDS: UtilKind[] = ["smoke", "flash", "he", "molotov", "decoy"];
export const TECHNIQUES: Technique[] = ["stand", "jump", "run_jump", "walk", "run"];

export interface ThrowWithLineups {
  item: typeof throws.$inferSelect;
  lineups: (typeof lineups.$inferSelect)[];
  /** How many strats reference it — shown before offering to delete one. */
  usedBy?: number;
}

export async function listThrows(map: string): Promise<ThrowWithLineups[]> {
  const d = db();
  const rows = await d
    .select()
    .from(throws)
    .where(eq(throws.map, map))
    .orderBy(asc(throws.kind), asc(throws.name));

  if (rows.length === 0) return [];

  const shots = await d
    .select()
    .from(lineups)
    .where(sql`${lineups.throwId} in ${rows.map((r) => r.id)}`)
    .orderBy(asc(lineups.idx));

  const uses = await d
    .select({ throwId: stratUtility.throwId, n: sql<number>`count(*)` })
    .from(stratUtility)
    .where(sql`${stratUtility.throwId} in ${rows.map((r) => r.id)}`)
    .groupBy(stratUtility.throwId);

  return rows.map((item) => ({
    item,
    lineups: shots.filter((s) => s.throwId === item.id),
    usedBy: Number(uses.find((u) => u.throwId === item.id)?.n ?? 0),
  }));
}

export async function getThrow(id: string) {
  const [row] = await db().select().from(throws).where(eq(throws.id, id)).limit(1);
  return row ?? null;
}

/**
 * Names are unique per map, so click-to-place has to pick one that is free. "smoke 3"
 * is not a good name, but it is a name someone can rename in one field — whereas
 * stopping to demand a name before the first marker lands is exactly the friction this
 * editor exists to avoid.
 */
export async function nextThrowName(map: string, kind: UtilKind) {
  const existing = await db()
    .select({ name: throws.name })
    .from(throws)
    .where(and(eq(throws.map, map), sql`${throws.name} like ${kind + " %"}`));

  const used = new Set(
    existing
      .map((e) => Number(e.name.slice(kind.length + 1)))
      .filter((n) => Number.isInteger(n)),
  );
  let n = 1;
  while (used.has(n)) n += 1;
  return `${kind} ${n}`;
}

export async function createThrow(input: {
  map: string;
  name: string;
  kind: UtilKind;
  landX: number;
  landY: number;
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

export async function updateThrow(
  id: string,
  patch: Partial<typeof throws.$inferInsert>,
) {
  const [row] = await db().update(throws).set(patch).where(eq(throws.id, id)).returning();
  return row ?? null;
}

/** Refuses while any strat still references it, rather than silently gutting execs. */
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
