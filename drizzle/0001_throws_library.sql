CREATE TABLE "strat_utility" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phase_id" uuid NOT NULL,
	"throw_id" uuid NOT NULL,
	"thrower_steamid64" text,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "throws" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"map" text NOT NULL,
	"name" text NOT NULL,
	"kind" "utility_kind" NOT NULL,
	"land_x" real NOT NULL,
	"land_y" real NOT NULL,
	"land_z" real,
	"throw_x" real,
	"throw_y" real,
	"throw_z" real,
	"level" "map_level" DEFAULT 'default' NOT NULL,
	"technique" "technique" DEFAULT 'stand' NOT NULL,
	"note" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "lineups_utility_idx";--> statement-breakpoint
ALTER TABLE "lineups" ALTER COLUMN "utility_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "lineups" ADD COLUMN "throw_id" uuid;--> statement-breakpoint
ALTER TABLE "strat_utility" ADD CONSTRAINT "strat_utility_phase_id_phases_id_fk" FOREIGN KEY ("phase_id") REFERENCES "public"."phases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strat_utility" ADD CONSTRAINT "strat_utility_throw_id_throws_id_fk" FOREIGN KEY ("throw_id") REFERENCES "public"."throws"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strat_utility" ADD CONSTRAINT "strat_utility_thrower_steamid64_players_steamid64_fk" FOREIGN KEY ("thrower_steamid64") REFERENCES "public"."players"("steamid64") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "throws" ADD CONSTRAINT "throws_created_by_players_steamid64_fk" FOREIGN KEY ("created_by") REFERENCES "public"."players"("steamid64") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "strat_utility_phase_idx" ON "strat_utility" USING btree ("phase_id");--> statement-breakpoint
CREATE INDEX "strat_utility_throw_idx" ON "strat_utility" USING btree ("throw_id");--> statement-breakpoint
CREATE INDEX "throws_map_idx" ON "throws" USING btree ("map");--> statement-breakpoint
CREATE UNIQUE INDEX "throws_map_name_uq" ON "throws" USING btree ("map","name");--> statement-breakpoint
ALTER TABLE "lineups" ADD CONSTRAINT "lineups_throw_id_throws_id_fk" FOREIGN KEY ("throw_id") REFERENCES "public"."throws"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lineups_throw_idx" ON "lineups" USING btree ("throw_id");