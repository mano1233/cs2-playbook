/**
 * World coordinates to radar pixels, and back.
 *
 * Positions are stored in raw Source world units — the same frame cs2-analyzer records
 * plant_x/plant_y/plant_z in — and converted to pixels only when something is drawn.
 * Doing it the other way round would bake one radar image's dimensions into the
 * database and make the stored data useless the day an image is replaced.
 *
 * The calibration comes from Valve's own `resource/overviews/<map>.txt`, extracted from
 * a local CS2 install, so `posX`/`posY`/`scale` are authoritative rather than fitted:
 *
 *   px = (world_x - posX) / scale
 *   py = (posY - world_y) / scale      // world y grows north, pixels grow down
 *
 * Nuke, Vertigo and Train ship `verticalsections`: the lower bombsite is a separate
 * image with its own altitude band. That is why every placed object carries a level —
 * and why it can be derived from z rather than asked of whoever is drawing the strat.
 */
import radarData from "@/data/radars.json";

export type LevelId = string;

export interface RadarLevel {
  id: LevelId;
  /** null on maps with a single flat radar. */
  altitudeMin: number | null;
  altitudeMax: number | null;
}

export interface RadarConfig {
  map: string;
  /** World coordinate of the image's upper-left corner. */
  posX: number;
  posY: number;
  /** World units per pixel. */
  scale: number;
  /** Edge length of the canonical square image. */
  size: number;
  levels: RadarLevel[];
}

const RADARS = radarData as Record<string, RadarConfig>;

export const DEFAULT_LEVEL: LevelId = "default";

export function radarFor(map: string): RadarConfig | null {
  return RADARS[map] ?? null;
}

export function knownMaps(): string[] {
  return Object.keys(RADARS).sort();
}

export interface Pixel {
  /** Pixels on the canonical `size` x `size` image. */
  px: number;
  py: number;
  /** The same point as a 0..1 fraction, for rendering at any display size. */
  fx: number;
  fy: number;
  /** False when the point falls outside the image — off-radar, not merely off-screen. */
  inBounds: boolean;
}

export function worldToPixel(map: string, x: number, y: number): Pixel | null {
  const r = radarFor(map);
  if (!r) return null;

  const px = (x - r.posX) / r.scale;
  const py = (r.posY - y) / r.scale;

  return {
    px,
    py,
    fx: px / r.size,
    fy: py / r.size,
    inBounds: px >= 0 && px <= r.size && py >= 0 && py <= r.size,
  };
}

/** The inverse, for turning a click on the radar into a stored position. */
export function pixelToWorld(map: string, px: number, py: number) {
  const r = radarFor(map);
  if (!r) return null;
  return { x: r.posX + px * r.scale, y: r.posY - py * r.scale };
}

/** Same, from a 0..1 fraction — what a click handler actually has to hand. */
export function fractionToWorld(map: string, fx: number, fy: number) {
  const r = radarFor(map);
  if (!r) return null;
  return pixelToWorld(map, fx * r.size, fy * r.size);
}

/**
 * Which radar image a point belongs on.
 *
 * Levels are ordered as Valve writes them, so the first band containing z wins. A map
 * with one flat radar has null bounds and always answers "default", which means callers
 * never need to special-case Nuke.
 */
export function levelForZ(map: string, z: number | null | undefined): LevelId {
  const r = radarFor(map);
  if (!r || z === null || z === undefined) return DEFAULT_LEVEL;

  for (const level of r.levels) {
    if (level.altitudeMin === null || level.altitudeMax === null) continue;
    if (z > level.altitudeMin && z <= level.altitudeMax) return level.id;
  }

  // Below every band: the lowest one is still the best answer, since a point under the
  // map is a parsing artefact rather than a reason to draw on the wrong floor.
  const lowest = [...r.levels]
    .filter((l) => l.altitudeMin !== null)
    .sort((a, b) => (a.altitudeMin ?? 0) - (b.altitudeMin ?? 0))[0];
  return lowest?.id ?? DEFAULT_LEVEL;
}

export function hasMultipleLevels(map: string): boolean {
  return (radarFor(map)?.levels.length ?? 0) > 1;
}
