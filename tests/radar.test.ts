import { describe, expect, it } from "vitest";
import {
  DEFAULT_LEVEL,
  fractionToWorld,
  hasMultipleLevels,
  knownMaps,
  levelForZ,
  pixelToWorld,
  radarFor,
  worldToPixel,
} from "@/lib/radar";

/**
 * Real bomb plants from parsed demos (cs2-demos/results.json), not invented points.
 * They are the only free source of truth for "this world coordinate is really on that
 * part of the map", and they are the same frame cs2-analyzer records them in — which is
 * the whole reason positions are stored in world units.
 */
const PLANTS = {
  de_nuke: {
    // A site sits above the -495 altitude split, B below it.
    a: [
      { x: 655.9, y: -898.1, z: -416.0 },
      { x: 717.1, y: -596.5, z: -400.0 },
      { x: 689.4, y: -879.9, z: -400.0 },
    ],
    b: [{ x: 721.4, y: -1136.7, z: -769.0 }],
  },
  de_inferno: [
    { x: 1932.8, y: 492.0, z: 161.0 },
    { x: 532.6, y: 2982.8, z: 161.5 },
    { x: 2092.3, y: 182.1, z: 160.0 },
  ],
  de_anubis: [
    { x: 1273.8, y: 1965.5, z: -192.0 },
    { x: 1082.5, y: 1896.5, z: -192.0 },
  ],
  de_cache: [
    { x: -86.0, y: 1804.1, z: 1684.0 },
    { x: 106.9, y: -1037.9, z: 1672.0 },
  ],
};

describe("calibration data", () => {
  it("covers the team's map pool", () => {
    for (const m of ["de_nuke", "de_anubis", "de_inferno", "de_cache"]) {
      expect(knownMaps()).toContain(m);
    }
  });

  it("carries Valve's own numbers for nuke", () => {
    const r = radarFor("de_nuke")!;
    expect(r.posX).toBe(-3453);
    expect(r.posY).toBe(2887);
    expect(r.scale).toBe(7);
  });

  it("knows which maps have a lower level", () => {
    expect(hasMultipleLevels("de_nuke")).toBe(true);
    expect(hasMultipleLevels("de_vertigo")).toBe(true);
    expect(hasMultipleLevels("de_train")).toBe(true);
    expect(hasMultipleLevels("de_mirage")).toBe(false);
  });

  it("returns null for a map it does not know", () => {
    expect(radarFor("de_notamap")).toBeNull();
    expect(worldToPixel("de_notamap", 0, 0)).toBeNull();
  });
});

describe("worldToPixel", () => {
  // The one piece of maths every drawn position depends on. If real plants land off
  // the image, nothing rendered on top of it can be trusted either.
  it.each(Object.entries({
    de_nuke: [...PLANTS.de_nuke.a, ...PLANTS.de_nuke.b],
    de_inferno: PLANTS.de_inferno,
    de_anubis: PLANTS.de_anubis,
    de_cache: PLANTS.de_cache,
  }))("puts every real %s plant inside the radar", (map, plants) => {
    for (const p of plants) {
      const px = worldToPixel(map, p.x, p.y)!;
      expect(px.inBounds).toBe(true);
      expect(px.fx).toBeGreaterThanOrEqual(0);
      expect(px.fx).toBeLessThanOrEqual(1);
      expect(px.fy).toBeGreaterThanOrEqual(0);
      expect(px.fy).toBeLessThanOrEqual(1);
    }
  });

  it("puts the upper-left corner at the origin", () => {
    const r = radarFor("de_nuke")!;
    const px = worldToPixel("de_nuke", r.posX, r.posY)!;
    expect(px.px).toBeCloseTo(0);
    expect(px.py).toBeCloseTo(0);
  });

  it("grows pixel-y southward as world-y decreases", () => {
    const north = worldToPixel("de_nuke", 0, 1000)!;
    const south = worldToPixel("de_nuke", 0, -1000)!;
    expect(south.py).toBeGreaterThan(north.py);
  });

  it("reports a point off the map as out of bounds", () => {
    const px = worldToPixel("de_nuke", 99999, 99999)!;
    expect(px.inBounds).toBe(false);
  });

  it("separates the two nuke sites on the radar", () => {
    // Same map, different bombsites: they must not land on the same spot.
    const a = worldToPixel("de_nuke", PLANTS.de_nuke.a[0]!.x, PLANTS.de_nuke.a[0]!.y)!;
    const b = worldToPixel("de_nuke", PLANTS.de_nuke.b[0]!.x, PLANTS.de_nuke.b[0]!.y)!;
    expect(Math.hypot(a.px - b.px, a.py - b.py)).toBeGreaterThan(10);
  });
});

describe("round trips", () => {
  it("pixelToWorld inverts worldToPixel", () => {
    for (const p of PLANTS.de_nuke.a) {
      const px = worldToPixel("de_nuke", p.x, p.y)!;
      const back = pixelToWorld("de_nuke", px.px, px.py)!;
      expect(back.x).toBeCloseTo(p.x, 6);
      expect(back.y).toBeCloseTo(p.y, 6);
    }
  });

  it("fractionToWorld inverts the fraction form", () => {
    const p = PLANTS.de_inferno[0]!;
    const px = worldToPixel("de_inferno", p.x, p.y)!;
    const back = fractionToWorld("de_inferno", px.fx, px.fy)!;
    expect(back.x).toBeCloseTo(p.x, 6);
    expect(back.y).toBeCloseTo(p.y, 6);
  });
});

describe("levelForZ", () => {
  // Nuke's split is at -495. Getting this backwards would draw every B-site strat on
  // the A-site image, which looks plausible enough to go unnoticed.
  it("puts real A-site plants on the upper radar", () => {
    for (const p of PLANTS.de_nuke.a) {
      expect(levelForZ("de_nuke", p.z)).toBe("default");
    }
  });

  it("puts the real B-site plant on the lower radar", () => {
    expect(levelForZ("de_nuke", PLANTS.de_nuke.b[0]!.z)).toBe("lower");
  });

  it("is always default on a map with one flat radar", () => {
    for (const z of [-5000, 0, 161, 5000]) {
      expect(levelForZ("de_mirage", z)).toBe(DEFAULT_LEVEL);
    }
  });

  it("falls back to default when z is unknown", () => {
    expect(levelForZ("de_nuke", null)).toBe(DEFAULT_LEVEL);
    expect(levelForZ("de_nuke", undefined)).toBe(DEFAULT_LEVEL);
  });

  it("clamps a z below every band to the lowest level", () => {
    expect(levelForZ("de_nuke", -99999)).toBe("lower");
  });

  it("treats the boundary itself as the lower band", () => {
    // AltitudeMax for "lower" is -495, and bands are (min, max].
    expect(levelForZ("de_nuke", -495)).toBe("lower");
    expect(levelForZ("de_nuke", -494)).toBe("default");
  });
});

describe("key validation for the R2 proxy", () => {
  // The radar route concatenates `map` and `level` into an object key, so both must be
  // checked against the config first. Unchecked, the proxy becomes a way to read the
  // rest of the bucket -- the lineup screenshots included.
  it.each([
    "../lineups",
    "..%2F..%2Flineups",
    "de_nuke/../../lineups",
    "",
    "DE_NUKE",
  ])("refuses %j as a map", (map) => {
    expect(radarFor(map)).toBeNull();
  });

  it("only accepts levels the map actually declares", () => {
    const nuke = radarFor("de_nuke")!;
    const ids = nuke.levels.map((l) => l.id);
    expect(ids).toContain("default");
    expect(ids).toContain("lower");
    expect(ids).not.toContain("../lineups");

    // Mirage is flat: asking for its lower level must not resolve to anything.
    expect(radarFor("de_mirage")!.levels.map((l) => l.id)).toEqual(["default"]);
  });
});
