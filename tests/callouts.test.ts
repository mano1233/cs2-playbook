import { describe, expect, it } from "vitest";
import { calloutAt, calloutLabels, calloutName, hasCallouts } from "@/lib/callouts";

describe("calloutName", () => {
  it("reads Valve's identifiers the way the HUD shows them", () => {
    expect(calloutName("BombsiteA")).toBe("Bombsite A");
    expect(calloutName("CTSpawn")).toBe("CT Spawn");
    expect(calloutName("TSpawn")).toBe("T Spawn");
    expect(calloutName("TopofMid")).toBe("Top of Mid");
    expect(calloutName("BackofB")).toBe("Back of B");
    expect(calloutName("AHalls")).toBe("A Halls");
    expect(calloutName("Heaven")).toBe("Heaven");
  });
});

/**
 * Median positions of players the game placed in each callout, from a parsed Nuke
 * demo — the same source the data was built from, checked back against it.
 */
describe("calloutAt on Nuke", () => {
  it("finds the obvious ones", () => {
    expect(calloutAt("de_nuke", -1872, -1076, -416)).toBe("T Spawn");
    expect(calloutAt("de_nuke", 2552, -424, -352)).toBe("CT Spawn");
    expect(calloutAt("de_nuke", 813, -920, -678)).toBe("Bombsite B");
  });

  it("tells Heaven from Hell by height, though they share x and y", () => {
    expect(calloutAt("de_nuke", 1119, -391, -128)).toBe("Heaven");
    expect(calloutAt("de_nuke", 1170, -442, -416)).toBe("Hell");
  });

  it("uses the radar level when there is no z", () => {
    expect(calloutAt("de_nuke", 813, -920, null, "lower")).toBe("Bombsite B");
  });

  it("is null off the map and for maps without demos", () => {
    expect(calloutAt("de_nuke", 20000, 20000, 0)).toBeNull();
    expect(calloutAt("de_nowhere", 0, 0, 0)).toBeNull();
    expect(hasCallouts("de_nowhere")).toBe(false);
  });
});

describe("calloutLabels", () => {
  it("puts Nuke's lower site on the lower radar", () => {
    const b = calloutLabels("de_nuke").find((l) => l.name === "Bombsite B");
    expect(b?.level).toBe("lower");
    const a = calloutLabels("de_nuke").find((l) => l.name === "Bombsite A");
    expect(a?.level).toBe("default");
  });
});
