/**
 * Seeds the allowlist. Steam authenticates anyone; only rows here get a session, so
 * this script is what decides who can open the playbook.
 *
 *   ROSTER="76561198...:mirithefish,76561198...:heCTik" node scripts/seed-roster.mjs
 *
 * Re-running is safe: it updates the nickname of an id it already knows and leaves
 * `active` alone, so deactivating someone is not undone by the next seed.
 */
import { Pool } from "pg";

const url = process.env.DATABASE_URL;
const roster = process.env.ROSTER;

if (!url) {
  console.error("seed-roster: DATABASE_URL is not set");
  process.exit(1);
}
if (!roster) {
  console.error('seed-roster: ROSTER is not set (expected "steamid64:nickname,...")');
  process.exit(1);
}

const entries = roster
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean)
  .map((pair) => {
    const [steamid64, nickname] = pair.split(":").map((s) => s?.trim());
    if (!/^\d{17}$/.test(steamid64 ?? "")) {
      throw new Error(`not a steamid64: ${steamid64}`);
    }
    if (!nickname) throw new Error(`no nickname for ${steamid64}`);
    return { steamid64, nickname };
  });

const pool = new Pool({ connectionString: url, max: 1 });
try {
  for (const { steamid64, nickname } of entries) {
    await pool.query(
      `insert into players (steamid64, nickname) values ($1, $2)
       on conflict (steamid64) do update set nickname = excluded.nickname`,
      [steamid64, nickname],
    );
    console.log(`seed-roster: ${nickname} (${steamid64})`);
  }
  console.log(`seed-roster: ${entries.length} player(s) on the roster`);
} finally {
  await pool.end();
}
