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

export const utility = pgTable(
  "utility",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    phaseId: uuid("phase_id")
      .notNull()
      .references(() => phases.id, { onDelete: "cascade" }),
    kind: utilityKind("kind").notNull(),
    throwerSteamid64: text("thrower_steamid64").references(() => players.steamid64),
    /** Where it lands. Required — a piece of utility without a target is not a strat. */
    landX: real("land_x").notNull(),
    landY: real("land_y").notNull(),
    landZ: real("land_z"),
    /** Where it is thrown from. Optional until someone works out the lineup. */
    throwX: real("throw_x"),
    throwY: real("throw_y"),
    throwZ: real("throw_z"),
    level: mapLevel("level").notNull().default("default"),
    technique: technique("technique").notNull().default("stand"),
    note: text("note"),
  },
  (t) => [index("utility_phase_idx").on(t.phaseId)],
);

export const lineups = pgTable(
  "lineups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    utilityId: uuid("utility_id")
      .notNull()
      .references(() => utility.id, { onDelete: "cascade" }),
    /** Object key in the cs2-playbook R2 bucket. The bucket stays private. */
    r2Key: text("r2_key").notNull(),
    shotKind: shotKind("shot_kind").notNull().default("stand"),
    idx: integer("idx").notNull().default(0),
    uploadedBy: text("uploaded_by").references(() => players.steamid64),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("lineups_utility_idx").on(t.utilityId)],
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
