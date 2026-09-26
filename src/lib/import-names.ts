/**
 * Reads a CS2 screenshot filename and works out what it is a picture of.
 *
 * The convention this parses is the one the team already uses when saving shots:
 *
 *   B CHURCH THROW         -> throw "B Church", the crosshair view
 *   B CHURCH LOCATION      -> throw "B Church", where you stand
 *   SHORT POP FLASH THROW  -> throw "Short Pop", a flash, crosshair view
 *   B QUAD MOLOTOV         -> throw "B Quad", a molotov, shot kind unstated
 *
 * So a folder of screenshots already says which pictures belong together and what each
 * one shows, which is the difference between dropping a folder in and uploading thirty
 * files one at a time.
 *
 * What a filename cannot say is *where* anything is. Positions are not in here and
 * cannot be inferred, so imported throws arrive unplaced and get a spot on the radar
 * afterwards. Pretending otherwise would put markers in confidently wrong places.
 */

export type ShotKind = "stand" | "crosshair" | "result";
export type UtilKind = "smoke" | "flash" | "he" | "molotov" | "decoy";

/** Trailing words that say what the picture shows rather than what it is of. */
const SHOT_WORDS: Record<string, ShotKind> = {
  THROW: "crosshair",
  AIM: "crosshair",
  CROSSHAIR: "crosshair",
  LOCATION: "stand",
  POSITION: "stand",
  POS: "stand",
  SPOT: "stand",
  STAND: "stand",
  RESULT: "result",
  LANDS: "result",
  LANDED: "result",
};

/** Words anywhere in the name that identify the grenade. */
const KIND_WORDS: Record<string, UtilKind> = {
  SMOKE: "smoke",
  SMOKES: "smoke",
  FLASH: "flash",
  FLASHBANG: "flash",
  POPFLASH: "flash",
  MOLOTOV: "molotov",
  MOLLY: "molotov",
  INCENDIARY: "molotov",
  HE: "he",
  NADE: "he",
  GRENADE: "he",
  DECOY: "decoy",
};

export interface ParsedShot {
  /** The filename as given, so the UI can show what it decided and from what. */
  file: string;
  /** Normalised group key — what the throw is called. Empty when nothing was left. */
  name: string;
  kind: UtilKind | null;
  shotKind: ShotKind | null;
}

/**
 * Short words are left shouting on purpose: in a callout they are nearly always
 * acronyms or site letters — A, B, CT, HE, T. The exceptions are ordinary English, and
 * "A TO BANANA" reads badly.
 */
const JOINERS = new Set(["TO", "ON", "IN", "AT", "OF", "BY", "UP", "AND", "THE", "VS"]);

const titleCase = (s: string) =>
  s
    .split(" ")
    .map((w, i) => {
      if (i > 0 && JOINERS.has(w)) return w.toLowerCase();
      return w.length > 2 ? w[0] + w.slice(1).toLowerCase() : w;
    })
    .join(" ");

export function parseShotName(filename: string): ParsedShot {
  // Drop the extension and anything a download added, e.g. "(1)" or a trailing number
  // that browsers and Steam append to duplicates.
  const stem = filename
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/\s*\(\d+\)\s*$/, "")
    .replace(/[_\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const words = stem.toUpperCase().split(" ").filter(Boolean);
  if (words.length === 0) return { file: filename, name: "", kind: null, shotKind: null };

  // The shot word is only meaningful at the end. "SMOKE LONG MID THROW" is a crosshair
  // shot of a smoke; "THROW LONG MID" would be somebody's callout, not a shot kind.
  let shotKind: ShotKind | null = null;
  const last = words[words.length - 1]!;
  if (SHOT_WORDS[last]) {
    shotKind = SHOT_WORDS[last]!;
    words.pop();
  }

  let kind: UtilKind | null = null;
  const kept: string[] = [];
  for (const w of words) {
    const hit = KIND_WORDS[w];
    // Only the first kind word is consumed, and only when it is not the entire name —
    // a throw called just "SMOKE" should keep its name rather than end up nameless.
    if (hit && kind === null && words.length > 1) {
      kind = hit;
      continue;
    }
    kept.push(w);
  }

  return {
    file: filename,
    name: titleCase(kept.join(" ")),
    kind,
    shotKind,
  };
}

export interface ImportGroup {
  /** What the throw will be called. */
  name: string;
  kind: UtilKind;
  /** Whether the kind was read from the filenames or fell back to a default. */
  kindFromName: boolean;
  shots: { file: string; shotKind: ShotKind }[];
}

export interface ImportPlan {
  groups: ImportGroup[];
  /** Files that produced no usable name, listed rather than silently dropped. */
  skipped: { file: string; reason: string }[];
}

/**
 * Groups parsed filenames into one throw per name.
 *
 * Every group becomes a throw with a single lineup holding its shots. A throw genuinely
 * landed several ways would need its shots split across lineups, and nothing in a
 * filename says which — so it goes in as one and gets split by hand, which is honest
 * about what the filenames actually told us.
 */
export function planImport(filenames: string[]): ImportPlan {
  const groups = new Map<string, ImportGroup>();
  const skipped: { file: string; reason: string }[] = [];

  for (const file of filenames) {
    const parsed = parseShotName(file);
    if (!parsed.name) {
      skipped.push({ file, reason: "no name left after removing the shot word" });
      continue;
    }

    const key = parsed.name.toUpperCase();
    const existing = groups.get(key);
    if (existing) {
      // A kind read from any one filename settles it for the group: "B QUAD MOLOTOV"
      // names the grenade even though "B QUAD LOCATION" does not.
      if (parsed.kind && !existing.kindFromName) {
        existing.kind = parsed.kind;
        existing.kindFromName = true;
      }
      existing.shots.push({ file, shotKind: parsed.shotKind ?? "stand" });
    } else {
      groups.set(key, {
        name: parsed.name,
        kind: parsed.kind ?? "smoke",
        kindFromName: parsed.kind !== null,
        shots: [{ file, shotKind: parsed.shotKind ?? "stand" }],
      });
    }
  }

  // Stand first, then crosshair, then result: the order someone actually uses them in.
  const order: Record<ShotKind, number> = { stand: 0, crosshair: 1, result: 2 };
  for (const g of groups.values()) {
    g.shots.sort((a, b) => order[a.shotKind] - order[b.shotKind]);
  }

  return {
    groups: [...groups.values()].sort((a, b) => a.name.localeCompare(b.name)),
    skipped,
  };
}
