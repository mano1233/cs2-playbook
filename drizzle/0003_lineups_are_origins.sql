CREATE TABLE "lineup_shots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lineup_id" uuid NOT NULL,
	"r2_key" text NOT NULL,
	"shot_kind" "shot_kind" DEFAULT 'stand' NOT NULL,
	"idx" integer DEFAULT 0 NOT NULL,
	"uploaded_by" text,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lineups" ALTER COLUMN "r2_key" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "lineups" ALTER COLUMN "shot_kind" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "lineups" ADD COLUMN "name" text;--> statement-breakpoint
ALTER TABLE "lineups" ADD COLUMN "throw_x" real;--> statement-breakpoint
ALTER TABLE "lineups" ADD COLUMN "throw_y" real;--> statement-breakpoint
ALTER TABLE "lineups" ADD COLUMN "throw_z" real;--> statement-breakpoint
ALTER TABLE "lineups" ADD COLUMN "technique" "technique" DEFAULT 'stand' NOT NULL;--> statement-breakpoint
ALTER TABLE "lineups" ADD COLUMN "note" text;--> statement-breakpoint
ALTER TABLE "lineup_shots" ADD CONSTRAINT "lineup_shots_lineup_id_lineups_id_fk" FOREIGN KEY ("lineup_id") REFERENCES "public"."lineups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lineup_shots" ADD CONSTRAINT "lineup_shots_uploaded_by_players_steamid64_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."players"("steamid64") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lineup_shots_lineup_idx" ON "lineup_shots" USING btree ("lineup_id");