/**
 * Map callouts: Valve's own place names, where they are, and which one a point is in.
 *
 * The data is extracted from demos by scripts/extract-callouts.py — the place the game
 * itself reports each player standing in, sampled over real matches, in the same Source
 * world units as every stored position. So "which callout is this getpos in" is a
 * lookup, not a guess, and it agrees with what the HUD would have said.
 *
 * A map with no demos yet has no callouts; everything here answers null for it.
 */
import data from "@/data/callouts.json";
import { DEFAULT_LEVEL, levelForZ } from "./radar";

interface MapCallouts {
  demos: number;
  cell: number;
  zcell: number;
  places: string[];
  labels: { place: number; x: number; y: number; z: number; level: string }[];
  /** [ix, iy, iz, placeIndex] */
  cells: [number, number, number, number][];
}

const DATA = data as unknown as Record<string, MapCallouts>;

/**
 * "BombsiteA" -> "Bombsite A", "CTSpawn" -> "CT Spawn", "TopofMid" -> "Top of Mid".
 * The raw names are Valve's identifiers; this is what they say on the HUD.
 */
export function calloutName(raw: string): string {
  return raw
    .replace(/([a-z])of([A-Z])/g, "$1 of $2")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1 $2");
}

export interface CalloutLabel {
  name: string;
  x: number;
  y: number;
  level: string;
}

/** Where to draw each name, for the radar. Small enough to hand to the client. */
export function calloutLabels(map: string): CalloutLabel[] {
  const m = DATA[map];
  if (!m) return [];
  return m.labels.map((l) => ({ name: calloutName(m.places[l.place]!), x: l.x, y: l.y, level: l.level }));
}

// ---- lookup ----------------------------------------------------------------

/** Per map: column (ix,iy) -> the cells stacked in it, built once on first use. */
const columns = new Map<string, Map<string, [number, number][]>>();

function columnsFor(map: string) {
  let cols = columns.get(map);
  if (cols) return cols;
  cols = new Map();
  for (const [ix, iy, iz, p] of DATA[map]?.cells ?? []) {
    const key = `${ix},${iy}`;
    const col = cols.get(key);
    if (col) col.push([iz, p]);
    else cols.set(key, [[iz, p]]);
  }
  columns.set(map, cols);
  return cols;
}

/** How far a point may be from any sampled cell and still get a name: two cells. */
const REACH = 2;

/**
 * The callout a point is in, or null when nobody has stood near it in a demo.
 *
 * With z the answer is exact, which matters on Nuke where Heaven sits over Hell.
 * Without z — a spot clicked on the radar — the radar level stands in for it, which is
 * enough to tell Ramp from B site but not Heaven from Hell; the nearest wins.
 */
export function calloutAt(
  map: string,
  x: number,
  y: number,
  z: number | null | undefined,
  level: string = DEFAULT_LEVEL,
): string | null {
  const m = DATA[map];
  if (!m) return null;
  const cols = columnsFor(map);
  const cx = Math.floor(x / m.cell);
  const cy = Math.floor(y / m.cell);
  const cz = z === null || z === undefined ? null : Math.floor(z / m.zcell);
  const wanted = z === null || z === undefined ? level : levelForZ(map, z);

  let best: { d: number; p: number } | null = null;
  for (let dx = -REACH; dx <= REACH; dx++) {
    for (let dy = -REACH; dy <= REACH; dy++) {
      for (const [iz, p] of cols.get(`${cx + dx},${cy + dy}`) ?? []) {
        if (cz !== null ? Math.abs(iz - cz) > 1 : levelForZ(map, (iz + 0.5) * m.zcell) !== wanted) continue;
        const d = dx * dx + dy * dy + (cz !== null ? (iz - cz) ** 2 : 0);
        if (!best || d < best.d) best = { d, p };
      }
    }
  }
  return best ? calloutName(m.places[best.p]!) : null;
}

export function hasCallouts(map: string): boolean {
  return map in DATA;
}
