import { describe, expect, it } from "vitest";
import {
  REFINE_RADIUS,
  describeThrow,
  distance2d,
  parseGetpos,
  setposCommand,
  stepsOf,
} from "@/lib/lineup-meta";

describe("parseGetpos", () => {
  // Verbatim shape of CS2's console output, taken from a Nuke T Roof lineup.
  const LINE =
    "setpos -137.468689 -532.276917 -108.128784;setang -7.130153 -47.250313 0.000000";

  it("reads the line getpos prints", () => {
    expect(parseGetpos(LINE)).toEqual({
      x: -137.468689,
      y: -532.276917,
      z: -108.128784,
      pitch: -7.130153,
      yaw: -47.250313,
    });
  });

  it("tolerates the console echo and a line break between the halves", () => {
    const copied = `] getpos\nsetpos 10 20 30;\nsetang 1.5 2.5 0`;
    expect(parseGetpos(copied)).toMatchObject({ x: 10, y: 20, z: 30, pitch: 1.5, yaw: 2.5 });
  });

  it("accepts the _exact variants", () => {
    expect(parseGetpos("setpos_exact 1 2 3; setang_exact 4 5 0")).toMatchObject({ x: 1, yaw: 5 });
  });

  it("refuses half a getpos", () => {
    expect(parseGetpos("setpos 1 2 3")).toBeNull();
    expect(parseGetpos("setang 1 2 0")).toBeNull();
    expect(parseGetpos("heaven smoke")).toBeNull();
  });

  it("refuses a pitch the engine cannot produce", () => {
    expect(parseGetpos("setpos 1 2 3;setang 120 0 0")).toBeNull();
  });

  it("keeps yaw in (-180, 180]", () => {
    expect(parseGetpos("setpos 1 2 3;setang 0 270 0")!.yaw).toBe(-90);
    expect(parseGetpos("setpos 1 2 3;setang 0 -180 0")!.yaw).toBe(180);
  });
});

describe("setposCommand", () => {
  it("round-trips through parseGetpos", () => {
    const cmd = setposCommand({ throwX: -137.5, throwY: -532.25, throwZ: -108, pitch: -7.125, yaw: -47.25 })!;
    expect(parseGetpos(cmd)).toEqual({ x: -137.5, y: -532.25, z: -108, pitch: -7.125, yaw: -47.25 });
  });

  it("is null without angles — a teleport that faces the wrong way is no lineup", () => {
    expect(setposCommand({ throwX: 1, throwY: 2, throwZ: 3, pitch: null, yaw: null })).toBeNull();
    expect(setposCommand({ throwX: 1, throwY: 2, throwZ: null, pitch: 0, yaw: 0 })).toBeNull();
  });
});

describe("describeThrow", () => {
  it("names what your hands do", () => {
    expect(describeThrow({ click: "left", jump: false })).toBe("Left click");
    expect(describeThrow({ click: "both", jump: true })).toBe("Jump + left + right click");
  });
});

describe("refining a radar click", () => {
  it("a few steps off is the same spot; across a site is not", () => {
    expect(distance2d({ x: 0, y: 0 }, { x: 60, y: 80 })).toBe(100);
    expect(100).toBeLessThan(REFINE_RADIUS);
    expect(distance2d({ x: 0, y: 0 }, { x: 600, y: 0 })).toBeGreaterThan(REFINE_RADIUS);
  });
});

describe("stepsOf", () => {
  it("splits lines and drops list markers and blanks", () => {
    expect(stepsOf("1. Stand in the corner\n\n- aim at the antenna\n3) jump throw")).toEqual([
      "Stand in the corner",
      "aim at the antenna",
      "jump throw",
    ]);
    expect(stepsOf(null)).toEqual([]);
  });
});
