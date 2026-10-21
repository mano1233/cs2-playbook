const ROLES = [
  { label: "Entry", colour: "#ffbe55" },
  { label: "Trade", colour: "#68b5ff" },
  { label: "Support", colour: "#ba98ff" },
  { label: "Bomb", colour: "#70dfad" },
  { label: "Palace", colour: "#ff94c1" },
];

/** Keep stored role metadata, but avoid repeating the title in the description. */
export function assignmentDescription(note: string | null) {
  return note?.replace(/^\s*(Entry|Trade|Support|Bomb|Palace)\s*:\s*/i, "") ?? null;
}

/** Role comes from the assignment note; no fake Steam accounts are needed. */
export function playerMarker(note: string | null, fallbackName: string) {
  const role = note?.split(":", 1)[0]?.trim().toLowerCase();
  const index = ROLES.findIndex((r) => r.label.toLowerCase() === role);
  return index < 0
    ? { label: fallbackName, colour: "#17a398", number: null }
    : { ...ROLES[index]!, number: index + 1 };
}
