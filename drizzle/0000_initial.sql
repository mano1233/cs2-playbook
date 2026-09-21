CREATE TYPE "public"."action" AS ENUM('hold', 'entry', 'trade', 'lurk', 'drop', 'throw', 'support');--> statement-breakpoint
CREATE TYPE "public"."map_level" AS ENUM('default', 'lower');--> statement-breakpoint
CREATE TYPE "public"."shot_kind" AS ENUM('stand', 'crosshair', 'result');--> statement-breakpoint
CREATE TYPE "public"."side" AS ENUM('t', 'ct');--> statement-breakpoint
CREATE TYPE "public"."strat_kind" AS ENUM('exec', 'default', 'retake', 'after_plant', 'anti_eco');--> statement-breakpoint
CREATE TYPE "public"."strat_status" AS ENUM('experimental', 'drilled', 'retired');--> statement-breakpoint
CREATE TYPE "public"."technique" AS ENUM('stand', 'jump', 'run_jump', 'walk', 'run');--> statement-breakpoint
CREATE TYPE "public"."utility_kind" AS ENUM('smoke', 'flash', 'he', 'molotov', 'decoy');--> statement-breakpoint
CREATE TABLE "assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phase_id" uuid NOT NULL,
	"player_steamid64" text,
	"x" real,
	"y" real,
	"z" real,
	"level" "map_level" DEFAULT 'default' NOT NULL,
	"action" "action" DEFAULT 'hold' NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "lineups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"utility_id" uuid NOT NULL,
	"r2_key" text NOT NULL,
	"shot_kind" "shot_kind" DEFAULT 'stand' NOT NULL,
	"idx" integer DEFAULT 0 NOT NULL,
	"uploaded_by" text,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "phases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"strat_id" uuid NOT NULL,
	"idx" integer NOT NULL,
	"name" text NOT NULL,
	"clock_offset_s" integer DEFAULT 0 NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "players" (
	"steamid64" text PRIMARY KEY NOT NULL,
	"nickname" text NOT NULL,
	"display_name" text,
	"role" text,
	"avatar_url" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"steamid64" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"user_agent" text
);
--> statement-breakpoint
CREATE TABLE "strat_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"strat_id" uuid NOT NULL,
	"snapshot" jsonb NOT NULL,
	"edited_by" text,
	"edited_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "strats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"map" text NOT NULL,
	"side" "side" NOT NULL,
	"kind" "strat_kind" DEFAULT 'exec' NOT NULL,
	"target" text,
	"name" text NOT NULL,
	"description" text,
	"status" "strat_status" DEFAULT 'experimental' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "utility" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phase_id" uuid NOT NULL,
	"kind" "utility_kind" NOT NULL,
	"thrower_steamid64" text,
	"land_x" real NOT NULL,
	"land_y" real NOT NULL,
	"land_z" real,
	"throw_x" real,
	"throw_y" real,
	"throw_z" real,
	"level" "map_level" DEFAULT 'default' NOT NULL,
	"technique" "technique" DEFAULT 'stand' NOT NULL,
	"note" text
);
--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_phase_id_phases_id_fk" FOREIGN KEY ("phase_id") REFERENCES "public"."phases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_player_steamid64_players_steamid64_fk" FOREIGN KEY ("player_steamid64") REFERENCES "public"."players"("steamid64") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lineups" ADD CONSTRAINT "lineups_utility_id_utility_id_fk" FOREIGN KEY ("utility_id") REFERENCES "public"."utility"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lineups" ADD CONSTRAINT "lineups_uploaded_by_players_steamid64_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."players"("steamid64") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "phases" ADD CONSTRAINT "phases_strat_id_strats_id_fk" FOREIGN KEY ("strat_id") REFERENCES "public"."strats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_steamid64_players_steamid64_fk" FOREIGN KEY ("steamid64") REFERENCES "public"."players"("steamid64") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strat_revisions" ADD CONSTRAINT "strat_revisions_strat_id_strats_id_fk" FOREIGN KEY ("strat_id") REFERENCES "public"."strats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strat_revisions" ADD CONSTRAINT "strat_revisions_edited_by_players_steamid64_fk" FOREIGN KEY ("edited_by") REFERENCES "public"."players"("steamid64") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strats" ADD CONSTRAINT "strats_created_by_players_steamid64_fk" FOREIGN KEY ("created_by") REFERENCES "public"."players"("steamid64") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "utility" ADD CONSTRAINT "utility_phase_id_phases_id_fk" FOREIGN KEY ("phase_id") REFERENCES "public"."phases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "utility" ADD CONSTRAINT "utility_thrower_steamid64_players_steamid64_fk" FOREIGN KEY ("thrower_steamid64") REFERENCES "public"."players"("steamid64") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assignments_phase_idx" ON "assignments" USING btree ("phase_id");--> statement-breakpoint
CREATE INDEX "lineups_utility_idx" ON "lineups" USING btree ("utility_id");--> statement-breakpoint
CREATE UNIQUE INDEX "phases_strat_idx_uq" ON "phases" USING btree ("strat_id","idx");--> statement-breakpoint
CREATE INDEX "sessions_steamid64_idx" ON "sessions" USING btree ("steamid64");--> statement-breakpoint
CREATE INDEX "strat_revisions_strat_idx" ON "strat_revisions" USING btree ("strat_id");--> statement-breakpoint
CREATE INDEX "strats_map_side_idx" ON "strats" USING btree ("map","side");--> statement-breakpoint
CREATE INDEX "utility_phase_idx" ON "utility" USING btree ("phase_id");