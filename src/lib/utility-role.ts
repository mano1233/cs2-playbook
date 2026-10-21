/** Roles explicitly recorded in the imported execute's utility assignment notes. */
export function utilityRole(note: string | null) {
  const prefix = note?.split(":", 1)[0]?.trim() ?? "";
  if (/^bomb(?: carrier)?$/i.test(prefix)) return "Bomb";
  if (/^trade(?: player)?$/i.test(prefix)) return "Trade";
  if (/^palace(?: player)?$/i.test(prefix)) return "Palace";
  if (/^support$/i.test(prefix)) return "Support";
  if (/^entry$/i.test(prefix)) return "Entry";
  return "Unassigned";
}
