/** Minimum utility for this saved execute. Weapons and armor are separate. */
export const MIRAGE_EXECUTE_ID = "4eb23f21-a072-4e5e-a825-000000000001";
export const UTILITY = {
  smoke: { label: "Smoke", price: 300, colour: "#cfd8dc" },
  flash: { label: "Flash", price: 200, colour: "#ffd257" },
  molotov: { label: "Molotov", price: 400, colour: "#ff8a4c" },
} as const;
export type BuyUtility = keyof typeof UTILITY;
export const MIRAGE_BUY_PLAN: { role: string; items: BuyUtility[]; job: string }[] = [
  { role: "Entry", items: [], job: "Enter on the flash; weapon ready." },
  { role: "Trade", items: ["smoke"], job: "Stairs smoke, then trade the entry." },
  { role: "Support", items: ["smoke"], job: "Jungle smoke, then support ramp." },
  { role: "Bomb", items: ["smoke"], job: "CT smoke, then bring the bomb onto site." },
  { role: "Palace", items: ["molotov", "flash"], job: "Clear under Palace, then flash for entry." },
];
export const utilityCost = (items: readonly BuyUtility[]) => items.reduce((total, item) => total + UTILITY[item].price, 0);
export const AFTER_THROW_JOBS: Record<string, string> = {
  Entry: "Enter from ramp on the flash; clear close angles and under Palace.",
  Trade: "After your smoke, follow the entry and trade contact; clear triple.",
  Support: "After your smoke, move up behind ramp teammates and cover their advance.",
  Bomb: "After your smoke, follow the cleared route with the bomb; plant when teammates secure site.",
  Palace: "After your molotov and flash, swing from Palace with ramp contact and clear site / sandwich.",
};
