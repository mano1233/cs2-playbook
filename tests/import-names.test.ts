import { describe, expect, it } from "vitest";
import { parseShotName, planImport } from "@/lib/import-names";

/**
 * The real filenames from the team's Inferno folder. Using invented names would only
 * prove the parser is self-consistent; these are what it actually has to cope with,
 * including the two cases that do not fit the convention.
 */
const REAL = [
  "RETAKE PIT POSITION.png",
  "MOLOTOV QUAD+BOXES LOCATION.png",
  "B QUAD MOLOTOV.png",
  "B CT BOOST THROW.png",
  "B CT BOOST LOCATION.png",
  "B CHURCH THROW.png",
  "B CHURCH LOCATION.png",
  "B BOXES MOLOTOV.png",
  "SMOKE LONG MID THROW.png",
  "SMOKE LONG MID LOCATION.png",
  "SMOKE A TO BANANA.png",
  "SHORT POP FLASH THROW.png",
  "SHORT POP FLASH POSITION.png",
  "RETAKE PIT THROW.png",
];

describe("parseShotName", () => {
  it("reads the shot kind off the end", () => {
    expect(parseShotName("B CHURCH THROW.png").shotKind).toBe("crosshair");
    expect(parseShotName("B CHURCH LOCATION.png").shotKind).toBe("stand");
    expect(parseShotName("SHORT POP FLASH POSITION.png").shotKind).toBe("stand");
  });

  it("reads the grenade out of the name and drops it from the title", () => {
    const smoke = parseShotName("SMOKE LONG MID THROW.png");
    expect(smoke.kind).toBe("smoke");
    expect(smoke.name).toBe("Long Mid");

    const molly = parseShotName("B QUAD MOLOTOV.png");
    expect(molly.kind).toBe("molotov");
    expect(molly.name).toBe("B Quad");
  });

  it("pairs THROW and LOCATION onto the same name", () => {
    expect(parseShotName("B CHURCH THROW.png").name).toBe(
      parseShotName("B CHURCH LOCATION.png").name,
    );
  });

  // A shot word is only a shot word at the end; mid-name it is a callout.
  it("does not treat a leading THROW as a shot kind", () => {
    const p = parseShotName("THROW LONG MID.png");
    expect(p.shotKind).toBeNull();
    expect(p.name).toBe("Throw Long Mid");
  });

  it("keeps the name when the grenade word is all there is", () => {
    // Otherwise a file called just "SMOKE" would import as a nameless throw.
    expect(parseShotName("SMOKE.png").name).toBe("Smoke");
    expect(parseShotName("SMOKE.png").kind).toBeNull();
  });

  it("ignores a duplicate suffix the browser added", () => {
    expect(parseShotName("B CHURCH THROW (1).png").name).toBe("B Church");
  });

  it("treats underscores and hyphens as spaces", () => {
    expect(parseShotName("b_church_throw.png").name).toBe("B Church");
    expect(parseShotName("b_church_throw.png").shotKind).toBe("crosshair");
  });
});

describe("planImport", () => {
  it("groups the real folder into one entry per throw", () => {
    const { groups, skipped } = planImport(REAL);
    const names = groups.map((g) => g.name);

    expect(skipped).toHaveLength(0);
    expect(names).toContain("B Church");
    // CT stays an acronym rather than becoming "Ct".
    expect(names).toContain("B CT Boost");
    expect(names).toContain("Long Mid");
    expect(names).toContain("Retake Pit");
    expect(names).toContain("Short Pop");
  });

  it("puts both shots of a pair in one group, stand before crosshair", () => {
    const g = planImport(REAL).groups.find((x) => x.name === "B Church")!;
    expect(g.shots.map((s) => s.shotKind)).toEqual(["stand", "crosshair"]);
  });

  it("takes the grenade from whichever filename states it", () => {
    // "SHORT POP FLASH THROW" names the grenade; "SHORT POP FLASH POSITION" also does.
    expect(planImport(REAL).groups.find((g) => g.name === "Short Pop")!.kind).toBe("flash");
  });

  it("defaults the grenade to smoke and says it guessed", () => {
    const g = planImport(["B CHURCH THROW.png"]).groups[0]!;
    expect(g.kind).toBe("smoke");
    expect(g.kindFromName).toBe(false);
  });

  // The two that do not fit: they must still land somewhere rather than vanish.
  it("keeps the odd ones out as their own groups rather than dropping them", () => {
    const names = planImport(REAL).groups.map((g) => g.name);
    expect(names).toContain("A to Banana");
    expect(names).toContain("Quad+boxes");
    expect(names).toContain("B Boxes");
  });

  it("lists a file it could not name instead of silently skipping it", () => {
    const { skipped } = planImport(["THROW.png"]);
    expect(skipped).toHaveLength(1);
    expect(skipped[0]!.file).toBe("THROW.png");
  });
});
