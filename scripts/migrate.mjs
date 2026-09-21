/**
 * Plain JS on purpose: this runs from inside the standalone build before the server
 * starts, where there is no TypeScript and no dev dependencies — only the modules Next
 * traced into the image. replicaCount is 1, so there is no migration race to guard.
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("migrate: DATABASE_URL is not set");
  process.exit(1);
}

const pool = new Pool({ connectionString: url, max: 1 });
try {
  await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
  console.log("migrate: up to date");
} catch (err) {
  console.error("migrate: failed", err);
  process.exit(1);
} finally {
  await pool.end();
}
