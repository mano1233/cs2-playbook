import { expect, it } from "vitest";
import { MIRAGE_BUY_PLAN, utilityCost } from "@/lib/mirage-buy-plan";

it("funds the execute's three smokes, Palace flash and molotov for $1500", () => {
  expect(MIRAGE_BUY_PLAN.map((r) => utilityCost(r.items))).toEqual([0, 300, 300, 300, 600]);
  expect(MIRAGE_BUY_PLAN.reduce((sum, r) => sum + utilityCost(r.items), 0)).toBe(1500);
  expect(MIRAGE_BUY_PLAN.flatMap((r) => r.items).filter((kind) => kind === "smoke")).toHaveLength(3);
});
