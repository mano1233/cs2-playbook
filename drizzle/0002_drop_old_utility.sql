ALTER TABLE "utility" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "utility" CASCADE;--> statement-breakpoint
-- Removed by hand: the DROP TABLE ... CASCADE above already drops this constraint,
-- so drizzle-kit's own next statement fails on a constraint that no longer exists.
--> statement-breakpoint
ALTER TABLE "lineups" ALTER COLUMN "throw_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "lineups" DROP COLUMN "utility_id";