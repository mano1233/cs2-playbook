import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "@/lib/env";
import * as schema from "./schema";

let pool: Pool | undefined;

/** One pool per process. Next reuses modules across requests, so this is not per-request. */
export function db() {
  pool ??= new Pool({ connectionString: env.databaseUrl(), max: 10 });
  return drizzle(pool, { schema });
}

export { schema };
