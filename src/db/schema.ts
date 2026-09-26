/**
 * Keys deliberately match cs2-analyzer's, so the two services can be joined later
 * without a migration: `map` is the raw Source name (`de_nuke`), `side` is t/ct, and
 * every coordinate is in Source world units — the same frame as the analyzer's
 * plant_x/plant_y/plant_z. Radar pixels are a rendering detail, computed at display
 * time from resource/overviews/<map>.txt, and are never stored.
 */
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const side = pgEnum("side", ["t", "ct"]);
export const stratKind = pgEnum("strat_kind", [
  "exec",
  "default",
  "retake",
  "after_plant",
  "anti_eco",
]);
export const stratStatus = pgEnum("strat_status", [
  "experimental",
  "drilled",
  "retired",
]);
export const utilityKind = pgEnum("utility_kind", [
  "smoke",
  "flash",
  "he",
  "molotov",
  "decoy",
]);
export const technique = pgEnum("technique", [
  "stand",
  "jump",
  "run_jump",
  "walk",
  "run",
]);
export const action = pgEnum("action", [
  "hold",
  "entry",
  "trade",
  "lurk",
  "drop",
  "throw",
  "support",
]);
export const shotKind = pgEnum("shot_kind", ["stand", "crosshair", "result"]);
/** Nuke and Vertigo have a `verticalsections` radar: the lower site is its own image. */
export const mapLevel = pgEnum("map_level", ["default", "lower"]);

export const players = pgTable("players", {
  /** steamid64 as text — 17 digits does not survive a float64 round trip. */
  steamid64: text("steamid64").primaryKey(),
  nickname: text("nickname").notNull(),
  displayName: text("display_name"),
  role: text("role"),
  avatarUrl: text("avatar_url"),
  /** The allowlist. Steam will authenticate anyone; only active players get a session. */
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable(
  "sessions",
  {
    /** 256 bits of randomness, stored hashed — see lib/session.ts. */
    id: text("id").primaryKey(),
    steamid64: text("steamid64")
      .notNull()
      .references(() => players.steamid64, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    userAgent: text("user_agent"),
  },
  (t) => [index("sessions_steamid64_idx").on(t.steamid64)],
);

/**
 * A key that lets a script do what a signed-in teammate can.
 *
 * Stored hashed, like sessions, so reading the table does not hand anyone a working
 * key. It carries no scopes: with five teammates, a key that can add a throw but not a
 * strat is a distinction nobody asked for, and pretending otherwise would suggest a
 * containment that is not there. A key is as powerful as its owner, which is why the
 * plaintext is shown exactly once and revoking is a single click.
 */
export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** HMAC of the token, never the token. */
    tokenHash: text("token_hash").notNull().unique(),
    steamid64: text("steamid64")
      .notNull()
      .references(() => players.steamid64, { onDelete: "cascade" }),
    /** What it is for: "import script", "laptop". */
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    /** So an unused key is visibly unused and can be cleaned up. */
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [index("api_keys_steamid64_idx").on(t.steamid64)],
);

export const strats = pgTable(
  "strats",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    map: text("map").notNull(),
    side: side("side").notNull(),
    kind: stratKind("kind").notNull().default("exec"),
    /** a | b | mid | null — free text because map layouts differ. */
    target: text("target"),
    name: text("name").notNull(),
    description: text("description"),
    status: stratStatus("status").notNull().default("experimental"),
    /** Optimistic concurrency: a save carries the version it loaded. */
    version: integer("version").notNull().default(1),
    createdBy: text("created_by").references(() => players.steamid64),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("strats_map_side_idx").on(t.map, t.side)],
);

export const phases = pgTable(
  "phases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    stratId: uuid("strat_id")
      .notNull()
      .references(() => strats.id, { onDelete: "cascade" }),
    idx: integer("idx").notNull(),
    name: text("name").notNull(),
    /** Seconds after freeze-end. The CS2 round clock is 1:55, so 15 here reads "1:40". */
    clockOffsetS: integer("clock_offset_s").notNull().default(0),
    note: text("note"),
  },
  (t) => [uniqueIndex("phases_strat_idx_uq").on(t.stratId, t.idx)],
);

export const assignments = pgTable(
  "assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    phaseId: uuid("phase_id")
      .notNull()
      .references(() => phases.id, { onDelete: "cascade" }),
    /** Null means the job is unassigned — a strat is useful before the roster is settled. */
    playerSteamid64: text("player_steamid64").references(() => players.steamid64),
    x: real("x"),
    y: real("y"),
    z: real("z"),
    level: mapLevel("level").notNull().default("default"),
    action: action("action").notNull().default("hold"),
    note: text("note"),
  },
  (t) => [index("assignments_phase_idx").on(t.phaseId)],
);

/**
 * A throw is map-scoped and reusable: the geometry, the technique and the screenshots
 * that show how to do it. The same heaven smoke appears in half a dozen A execs, and
 * the screenshots are the expensive part to produce — so it is defined once here and
 * referenced from wherever it is used.
 *
 * What is deliberately NOT here is who throws it or when. That varies per strat, which
 * is why it lives on stratUtility below rather than on the throw itself.
 */
export const throws = pgTable(
  "throws",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    map: text("map").notNull(),
    /** What the team calls it: "heaven smoke", "hut molly". */
    name: text("name").notNull(),
    kind: utilityKind("kind").notNull(),
    /**
     * Where it lands. Nullable, which was not the original intent: a bulk import reads
     * the throw's name and its screenshots out of the filenames, but a filename cannot
     * say where anything is. A throw with two screenshots and no coordinates is still
     * worth having — you can read the pictures — and refusing the import to preserve a
     * tidy invariant would trade something useful for something merely neat. Unplaced
     * throws are shown as such rather than drawn somewhere wrong.
     */
    landX: real("land_x"),
    landY: real("land_y"),
    landZ: real("land_z"),
    level: mapLevel("level").notNull().default("default"),
    note: text("note"),
    createdBy: text("created_by").references(() => players.steamid64),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("throws_map_idx").on(t.map),
    // One name per map: two different "heaven smoke" entries is how a library turns
    // back into the duplication it exists to prevent.
    uniqueIndex("throws_map_name_uq").on(t.map, t.name),
  ],
);

/** A throw used in one phase of one strat, by one player. */
export const stratUtility = pgTable(
  "strat_utility",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    phaseId: uuid("phase_id")
      .notNull()
      .references(() => phases.id, { onDelete: "cascade" }),
    throwId: uuid("throw_id")
      .notNull()
      // Restrict, not cascade: deleting a throw that strats depend on should fail
      // loudly rather than quietly remove it from every exec that used it.
      .references(() => throws.id, { onDelete: "restrict" }),
    throwerSteamid64: text("thrower_steamid64").references(() => players.steamid64),
    /** Strat-specific colour: "only if they smoke ramp first". */
    note: text("note"),
  },
  (t) => [
    index("strat_utility_phase_idx").on(t.phaseId),
    index("strat_utility_throw_idx").on(t.throwId),
  ],
);


export const lineups = pgTable(
  "lineups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    throwId: uuid("throw_id")
      .notNull()
      .references(() => throws.id, { onDelete: "cascade" }),
    /** What to call this way of throwing it: "from spawn", "from T ramp". */
    name: text("name"),
    /** Where you stand. This is what makes a lineup a lineup. */
    throwX: real("throw_x"),
    throwY: real("throw_y"),
    throwZ: real("throw_z"),
    technique: technique("technique").notNull().default("stand"),
    note: text("note"),
    idx: integer("idx").notNull().default(0),
    createdBy: text("uploaded_by").references(() => players.steamid64),
    createdAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("lineups_throw_idx").on(t.throwId)],
);

/**
 * The screenshots for one lineup. A lineup needs several — where to stand, what the
 * crosshair looks like, where it lands — so they hang off the lineup rather than off
 * the throw.
 */
export const lineupShots = pgTable(
  "lineup_shots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    lineupId: uuid("lineup_id")
      .notNull()
      .references(() => lineups.id, { onDelete: "cascade" }),
    /** Object key in the cs2-playbook R2 bucket. The bucket stays private. */
    r2Key: text("r2_key").notNull(),
    shotKind: shotKind("shot_kind").notNull().default("stand"),
    idx: integer("idx").notNull().default(0),
    uploadedBy: text("uploaded_by").references(() => players.steamid64),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("lineup_shots_lineup_idx").on(t.lineupId)],
);

export const stratRevisions = pgTable(
  "strat_revisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    stratId: uuid("strat_id")
      .notNull()
      .references(() => strats.id, { onDelete: "cascade" }),
    snapshot: jsonb("snapshot").notNull(),
    editedBy: text("edited_by").references(() => players.steamid64),
    editedAt: timestamp("edited_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("strat_revisions_strat_idx").on(t.stratId)],
);
