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
import { calloutAt } from "./callouts";
import { lineups, lineupShots, phases, strats, stratUtility, throws } from "@/db/schema";
import {
  CLICKS,
  LINEUP_SIDES,
  MOVEMENTS,
  PRECISIONS,
  REFINE_RADIUS,
  distance2d,
  parseGetpos,
  type Click,
  type LineupSide,
  type Movement,
  type Precision,
} from "./lineup-meta";

export type UtilKind = "smoke" | "flash" | "he" | "molotov" | "decoy";
export type ShotKind = "stand" | "crosshair" | "result";

export const UTIL_KINDS: UtilKind[] = ["smoke", "flash", "he", "molotov", "decoy"];
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
 * Names are unique per map, so click-to-place has to pick one that is free. Where it
 * lands usually names it — "Heaven smoke" — because that is what the team would call
 * it anyway; off the callout data, or on a map with none, it falls back to "smoke 3".
 * Either is one field to fix, whereas demanding a name before the first marker lands
 * is exactly the friction this editor exists to avoid.
 */
export async function nextThrowName(
  map: string,
  kind: UtilKind,
  land?: { x: number; y: number; z?: number | null; level?: string },
) {
  const callout = land ? calloutAt(map, land.x, land.y, land.z, land.level) : null;
  const base = callout ? `${callout} ${kind === "he" ? "HE" : kind}` : kind;

  const existing = await db()
    .select({ name: throws.name })
    .from(throws)
    .where(and(eq(throws.map, map), sql`${throws.name} like ${base + "%"}`));
  const taken = new Set(existing.map((e) => e.name));

  // A callout name stands alone the first time; the bare kind is always numbered.
  if (callout && !taken.has(base)) return base;
  let n = callout ? 2 : 1;
  while (taken.has(`${base} ${n}`)) n += 1;
  return `${base} ${n}`;
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

/**
 * Validates a lineup edit from any of the three places that write one — the lineup's
 * own PATCH, a new throw with its first lineup, and a new lineup — so the write-once
 * rule for positions is enforced in exactly one place.
 *
 * `current` is null when the lineup is being created, where any position is a first
 * write.
 */
export function lineupPatchFrom(
  body: Record<string, unknown>,
  current: typeof lineups.$inferSelect | null,
  /** The throw's map and radar level, to name the spot from the callout data. */
  where: { map: string; level: string },
):
  | { ok: true; patch: Partial<typeof lineups.$inferInsert> }
  | { ok: false; status: number; error: string; [k: string]: unknown } {
  const patch: Partial<typeof lineups.$inferInsert> = {};
  const text = (v: unknown, max: number) =>
    typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;
  const pick = <T extends string>(all: readonly T[], v: unknown) =>
    (all as readonly string[]).includes(v as string) ? (v as T) : undefined;

  if (typeof body.name === "string") patch.name = text(body.name, 80);
  if ("note" in body) patch.note = text(body.note, 500);
  if ("fromCallout" in body) patch.fromCallout = text(body.fromCallout, 60);
  if ("steps" in body) patch.steps = text(body.steps, 1500);

  // Null is a real answer for side ("either") and precision ("nobody has said"), so it
  // clears; anything unrecognised is ignored rather than silently clearing.
  if ("side" in body) {
    if (body.side === null) patch.side = null;
    else if (pick<LineupSide>(LINEUP_SIDES, body.side)) patch.side = body.side as LineupSide;
  }
  if ("precision" in body) {
    if (body.precision === null) patch.precision = null;
    else if (pick<Precision>(PRECISIONS, body.precision)) patch.precision = body.precision as Precision;
  }
  const movement = pick<Movement>(MOVEMENTS, body.movement);
  if (movement) patch.movement = movement;
  if (typeof body.jump === "boolean") patch.jump = body.jump;
  const click = pick<Click>(CLICKS, body.click);
  if (click) patch.click = click;

  const placed = current !== null && (current.throwX !== null || current.throwY !== null);
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

  if (typeof body.getpos === "string" && body.getpos.trim()) {
    const gp = parseGetpos(body.getpos);
    if (!gp) {
      return { ok: false, status: 400, error: "that is not getpos output — expected setpos … ;setang …" };
    }
    // Write once, with one exception. A spot clicked on the radar is an estimate, and a
    // getpos near it is the same spot measured properly: that replaces the estimate,
    // once. A getpos far from it is a different spot, which is a different lineup.
    if (placed) {
      const exact = current!.pitch !== null && current!.yaw !== null;
      const near =
        distance2d({ x: current!.throwX!, y: current!.throwY! }, gp) <= REFINE_RADIUS;
      if (exact || !near) {
        return {
          ok: false,
          status: 409,
          error: exact
            ? "this lineup already has an exact spot — add another lineup instead"
            : "that getpos is somewhere else on the map — add another lineup for it",
          throwX: current!.throwX,
          throwY: current!.throwY,
        };
      }
    }
    Object.assign(patch, { throwX: gp.x, throwY: gp.y, throwZ: gp.z, pitch: gp.pitch, yaw: gp.yaw });
  } else if (num(body.throwX) !== null && num(body.throwY) !== null) {
    // A lineup *is* the spot you stand on; move it and the screenshots showing that
    // spot are of somewhere else, with nothing to indicate it.
    if (placed) {
      return {
        ok: false,
        status: 409,
        error: "where a lineup is thrown from is fixed once set — add another lineup instead",
        throwX: current!.throwX,
        throwY: current!.throwY,
      };
    }
    Object.assign(patch, { throwX: num(body.throwX), throwY: num(body.throwY), throwZ: num(body.throwZ) });
  }

  // A spot that has just been set and has no callout yet gets the one it is in, so a
  // pasted getpos reads "from T Roof" without anyone typing it. An explicit value —
  // including clearing it — always wins.
  if (patch.throwX != null && patch.throwY != null && !("fromCallout" in patch) && !current?.fromCallout) {
    const callout = calloutAt(where.map, patch.throwX, patch.throwY, patch.throwZ, where.level);
    if (callout) patch.fromCallout = callout;
  }

  return { ok: true, patch };
}

/** Which strats use each throw on a map, for "used in" links. */
export async function throwUses(map: string) {
  const rows = await db()
    .selectDistinct({
      throwId: stratUtility.throwId,
      stratId: strats.id,
      name: strats.name,
      side: strats.side,
      status: strats.status,
    })
    .from(stratUtility)
    .innerJoin(phases, eq(phases.id, stratUtility.phaseId))
    .innerJoin(strats, eq(strats.id, phases.stratId))
    .where(eq(strats.map, map));

  const out: Record<string, { stratId: string; name: string; side: string; status: string }[]> = {};
  for (const { throwId, ...s } of rows) (out[throwId] ??= []).push(s);
  return out;
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
      pitch: lineup.pitch,
      yaw: lineup.yaw,
      side: lineup.side,
      movement: lineup.movement,
      jump: lineup.jump,
      click: lineup.click,
      precision: lineup.precision,
      fromCallout: lineup.fromCallout,
      steps: lineup.steps,
      note: lineup.note,
      shots: shots.map((s) => ({ id: s.id, shotKind: s.shotKind, idx: s.idx })),
    })),
  };
}
