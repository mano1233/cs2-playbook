CREATE TYPE "public"."click" AS ENUM('left', 'right', 'both');--> statement-breakpoint
CREATE TYPE "public"."movement" AS ENUM('stationary', 'walking', 'running', 'crouch_walking');--> statement-breakpoint
CREATE TYPE "public"."precision" AS ENUM('loose', 'precise', 'very_precise');--> statement-breakpoint
ALTER TABLE "lineups" ADD COLUMN "pitch" real;--> statement-breakpoint
ALTER TABLE "lineups" ADD COLUMN "yaw" real;--> statement-breakpoint
ALTER TABLE "lineups" ADD COLUMN "side" "side";--> statement-breakpoint
ALTER TABLE "lineups" ADD COLUMN "movement" "movement" DEFAULT 'stationary' NOT NULL;--> statement-breakpoint
ALTER TABLE "lineups" ADD COLUMN "jump" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "lineups" ADD COLUMN "click" "click" DEFAULT 'left' NOT NULL;--> statement-breakpoint
ALTER TABLE "lineups" ADD COLUMN "precision" "precision";--> statement-breakpoint
ALTER TABLE "lineups" ADD COLUMN "from_callout" text;--> statement-breakpoint
ALTER TABLE "lineups" ADD COLUMN "steps" text;--> statement-breakpoint
-- Hand-written: carry the old technique across before 0008 drops it, so existing
-- lineups keep their movement and jump.
UPDATE "lineups" SET
  "movement" = CASE "technique"
    WHEN 'run_jump' THEN 'running'::"movement"
    WHEN 'run' THEN 'running'::"movement"
    WHEN 'walk' THEN 'walking'::"movement"
    ELSE 'stationary'::"movement"
  END,
  "jump" = "technique" IN ('jump', 'run_jump');
