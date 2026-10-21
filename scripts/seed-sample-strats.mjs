/** Local practice examples, not verified professional tactics or grenade lineups. */
import { Pool } from "pg";

const samples = [
  {
    id: "4eb23f21-a072-4e5e-a825-000000000001",
    name: "[Sample] Mirage A execute", side: "t", kind: "exec", target: "a",
    phases: [
      [20, "Stage the attack", "Wait for all five players before committing.", [
        "Entry: stage at A ramp; prepare to clear close angles.",
        "Trade: follow the entry within trading distance.",
        "Support: prepare a practiced stairs smoke.",
        "Bomb: prepare a practiced CT smoke; keep the bomb safe.",
        "Palace: hold quietly and wait for the execute call.",
      ]],
      [35, "Execute together", "Call when the smokes bloom. Timings are illustrative, not automatic.", [
        "Entry: leave ramp on the flash; clear close right and under palace.",
        "Trade: trade the entry and clear toward default.",
        "Support: smoke stairs, then flash above site on the entry call.",
        "Bomb: smoke CT, then follow teammates toward a safe plant.",
        "Palace: swing with ramp contact; clear below before dropping.",
      ]],
      [50, "Plant and hold", "Plant only after teammates clear the site. Adjust to surviving players.", [
        "Entry: hold the jungle approach from site cover.",
        "Trade: cover stairs and communicate incoming utility.",
        "Support: fall toward ramp and preserve utility for the retake.",
        "Bomb: plant for ramp if safe, then hold a crossfire.",
        "Palace: watch the CT approach without duplicating teammates' angles.",
      ]],
    ],
  },
  {
    id: "4eb23f21-a072-4e5e-a825-000000000002",
    name: "[Sample] Mirage CT balanced setup", side: "ct", kind: "default", target: null,
    phases: [
      [10, "Take initial positions", "A basic two-A, one-mid, two-B practice setup.", [
        "A anchor: watch ramp from cover; keep an escape route.",
        "A support: cover palace and be ready to flash for the anchor.",
        "Mid: watch top mid from window; report utility and contact.",
        "B short: cover short and help mid without abandoning B.",
        "B anchor: watch apartments from site cover.",
      ]],
      [35, "React to information", "Rotate on confirmed information; silence alone is not proof of a site attack.", [
        "A anchor: delay confirmed ramp pressure with available utility.",
        "A support: flash for the anchor; communicate palace contact.",
        "Mid: report connector and short threats; avoid an isolated duel.",
        "B short: support B contact or hold the rotation route.",
        "B anchor: delay apartments pressure and call numbers seen.",
      ]],
    ],
  },
  {
    id: "4eb23f21-a072-4e5e-a825-000000000003",
    name: "[Sample] Mirage A retake", side: "ct", kind: "retake", target: "a",
    phases: [
      [60, "Regroup", "Example assumes an A plant around +60s. Adapt to actual bomb time; do not wait for the round-clock timestamps.", [
        "CT entry: stage at ticket; wait for support.",
        "CT trade: join the entry with a kit if available.",
        "Jungle support: prepare a flash and communicate your route.",
        "Connector: check the flank before joining jungle.",
        "Flank watch: report ramp or palace threats; regroup if time is short.",
      ]],
      [68, "Clear and defuse", "Use the bomb timer, kit availability and information to decide whether a retake is viable.", [
        "CT entry: swing on the flash and clear close site angles.",
        "CT trade: trade immediately, then protect the defuser.",
        "Jungle support: flash on the call; push together with connector.",
        "Connector: clear stairs and synchronize with the jungle player.",
        "Flank watch: cover ramp/palace while the teammate with a kit defuses.",
      ]],
    ],
  },
];

if (process.argv.includes("--preview")) {
  console.log(JSON.stringify(samples, null, 2));
} else {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is missing. Run node --env-file=.env.local scripts/seed-sample-strats.mjs");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1, connectionTimeoutMillis: 5000 });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    let added = 0;
    for (const sample of samples) {
      const result = await client.query(
        `INSERT INTO strats (id, map, side, kind, target, name, description, status)
         VALUES ($1, 'de_mirage', $2, $3, $4, $5, $6, 'experimental')
         ON CONFLICT (id) DO NOTHING RETURNING id`,
        [sample.id, sample.side, sample.kind, sample.target, sample.name,
          "Practice example for exploring the app, not a verified professional tactic. Roles are unassigned. Positions and exact grenade lineups are intentionally omitted; verify them in CS2 before practice."],
      );
      if (!result.rowCount) continue; // Preserve edits when the script is rerun.
      for (const [idx, [seconds, name, note, roles]] of sample.phases.entries()) {
        const phase = await client.query(
          "INSERT INTO phases (strat_id, idx, name, clock_offset_s, note) VALUES ($1,$2,$3,$4,$5) RETURNING id",
          [sample.id, idx, name, seconds, note],
        );
        for (const role of roles) {
          await client.query("INSERT INTO assignments (phase_id, action, note) VALUES ($1, 'support', $2)", [phase.rows[0].id, role]);
        }
      }
      added++;
    }
    await client.query("COMMIT");
    console.log(`Added ${added} sample tactics; existing samples were preserved.`);
    console.log("Open http://localhost:3000/de_mirage/t or http://localhost:3000/de_mirage/ct");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}
