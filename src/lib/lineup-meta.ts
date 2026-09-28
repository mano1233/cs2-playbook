/**
 * What a teammate needs to know to reproduce a lineup, beyond where it is.
 *
 * How you move, whether you jump, and which mouse button releases the grenade are three
 * independent things — a jump-throw with left click and one with both buttons land in
 * different places — so they are separate fields, the way csnades.gg and every other
 * lineup site record them.
 *
 * Pure and dependency-free: the server validates with it, the client labels with it,
 * and the tests exercise it without a database.
 */

export type Movement = "stationary" | "crouching" | "walking" | "running" | "crouch_walking";
export type Click = "left" | "right" | "both";
export type Precision = "loose" | "precise" | "very_precise";
export type LineupSide = "t" | "ct";

export const MOVEMENTS: Movement[] = ["stationary", "crouching", "walking", "running", "crouch_walking"];
export const CLICKS: Click[] = ["left", "right", "both"];
export const PRECISIONS: Precision[] = ["loose", "precise", "very_precise"];
export const LINEUP_SIDES: LineupSide[] = ["t", "ct"];

export const MOVEMENT_LABEL: Record<Movement, string> = {
  stationary: "Stationary",
  crouching: "Crouching",
  walking: "Walking",
  running: "Running",
  crouch_walking: "Crouch-walking",
};

export const CLICK_LABEL: Record<Click, string> = {
  left: "Left click",
  right: "Right click",
  both: "Left + right click",
};

export const PRECISION_LABEL: Record<Precision, string> = {
  loose: "Loose",
  precise: "Precise",
  very_precise: "Very precise",
};

export const SIDE_LABEL: Record<LineupSide, string> = { t: "T", ct: "CT" };

/** "Jump + left click", "Left + right click" — what you actually do with your hands. */
export function describeThrow(l: { click: Click; jump: boolean }): string {
  const click = CLICK_LABEL[l.click];
  return l.jump ? `Jump + ${click.toLowerCase()}` : click;
}

// ---- getpos ---------------------------------------------------------------

export interface GetPos {
  x: number;
  y: number;
  z: number;
  pitch: number;
  yaw: number;
}

const NUM = String.raw`(-?\d+(?:\.\d+)?(?:e[-+]?\d+)?)`;
const SETPOS = new RegExp(String.raw`setpos(?:_exact)?\s+${NUM}\s+${NUM}\s+${NUM}`, "i");
const SETANG = new RegExp(String.raw`setang(?:_exact)?\s+${NUM}\s+${NUM}(?:\s+${NUM})?`, "i");

/**
 * Reads what CS2's `getpos` prints:
 *
 *   setpos 1234.000000 -567.000000 -100.031250;setang 5.123456 90.000000 0.000000
 *
 * Tolerant of what a copy out of the console drags along — a leading "] getpos" echo,
 * line breaks between the two halves, `_exact` variants — but not of a missing half. A
 * position without angles is only half a lineup, and the radar click already gives
 * that much.
 */
export function parseGetpos(text: string): GetPos | null {
  const pos = SETPOS.exec(text);
  const ang = SETANG.exec(text);
  if (!pos || !ang) return null;

  const [x, y, z, pitch, yaw] = [pos[1], pos[2], pos[3], ang[1], ang[2]].map(Number);
  if (![x, y, z, pitch, yaw].every(Number.isFinite)) return null;
  // Pitch is clamped to ±89 by the engine; anything else was not copied from CS2.
  if (Math.abs(pitch!) > 90) return null;

  return { x: x!, y: y!, z: z!, pitch: pitch!, yaw: normaliseYaw(yaw!) };
}

/** CS2 prints yaw in (-180, 180]; keep it there so equal angles compare equal. */
function normaliseYaw(yaw: number) {
  let y = yaw % 360;
  if (y > 180) y -= 360;
  if (y <= -180) y += 360;
  return y;
}

/**
 * The console line that puts you on the spot, looking the right way. Needs
 * `sv_cheats 1`, i.e. a practice server — which is where lineups get learned.
 */
export function setposCommand(l: {
  throwX: number | null;
  throwY: number | null;
  throwZ: number | null;
  pitch: number | null;
  yaw: number | null;
}): string | null {
  if (l.throwX === null || l.throwY === null || l.throwZ === null) return null;
  if (l.pitch === null || l.yaw === null) return null;
  const f = (n: number) => n.toFixed(6);
  return `setpos ${f(l.throwX)} ${f(l.throwY)} ${f(l.throwZ)};setang ${f(l.pitch)} ${f(l.yaw)} 0.000000`;
}

/**
 * How far a getpos may be from a spot that was clicked on the radar and still count as
 * the same spot.
 *
 * A radar click is an estimate: one radar pixel is 5–7 world units, and a click is
 * easily a dozen pixels off. A getpos is exact. Letting the exact value replace the
 * estimate once, when they plainly describe the same place, is a correction — whereas
 * accepting a getpos from across the map would be moving the lineup, which the
 * write-once rule exists to prevent.
 */
export const REFINE_RADIUS = 160;

export function distance2d(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Steps are stored as text, one per line; blank lines are not steps. */
export function stepsOf(text: string | null | undefined): string[] {
  return (text ?? "")
    .split(/\r?\n/)
    .map((s) => s.replace(/^\s*(?:\d+[.)]|[-*•])\s*/, "").trim())
    .filter(Boolean);
}
