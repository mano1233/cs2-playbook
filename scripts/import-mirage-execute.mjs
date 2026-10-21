import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { Pool } from 'pg';

const source = process.argv[2];
if (!source || !process.env.LOCAL_IMAGE_DIR || !process.env.DATABASE_URL) {
  throw new Error('Usage: node --env-file=.env.local scripts/import-mirage-execute.mjs "SCREENSHOT_FOLDER"; requires LOCAL_IMAGE_DIR and DATABASE_URL');
}
const samples = [
  ['ct smokes.jpg', 'CT smoke from ramp', 'smoke', [1104.068115,-997.946228,-194.258789,-28.503326,-143.699997], true, 'stationary', 'Bomb carrier: throw CT smoke, then follow the entry.', 'Stand still. Left-click jump-throw. Use the user-corrected position and aim.'],
  ['stairs smoke.jpg', 'Stairs smoke from ramp', 'smoke', [908.409485,-1036.031372,-194.624115,-65.011642,-159.897186], true, 'stationary', 'Trade player: throw stairs smoke, then trade the ramp entry.', 'Stand still. Left-click jump-throw.'],
  ['jungle smoke from ramp.jpg', 'Jungle smoke from ramp', 'smoke', [1087.941895,-1016.105591,-196.113739,-25.810286,-164.368057], true, 'stationary', 'Support: throw jungle smoke; coordinate its bloom with CT and stairs.', 'Stand still. Left-click jump-throw.'],
  ['flash site from palace.jpg', 'Site flash from palace', 'flash', [22.968523,-2366.924316,23.871250,5.511044,49.692051], false, 'stationary', 'Palace player: flash on the entry call; warn teammates.', 'Stand still. Left-click throw without jumping.'],
  ['under palace molotov.jpg', 'Under palace molotov', 'molotov', [567.968201,-2224.028076,24.031250,-9.676621,-164.336639], false, 'running', 'Palace player: clear under balcony before teammates commit.', 'Move forward (W) and left-click throw. Release timing must be practiced in CS2.'],
];
function id(label) {
  const h = createHash('sha256').update('mirage-user-execute-v1:' + label).digest('hex');
  return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;
}
// Validate and copy all five images before touching the database.
const prepared = [];
for (const row of samples) {
  const bytes = await readFile(path.join(source, row[0]));
  if (bytes.length > 5 * 1024 * 1024 || bytes[0] !== 255 || bytes[1] !== 216 || bytes[2] !== 255) throw new Error(`Invalid JPEG: ${row[0]}`);
  const lineupId = id(row[0] + ':lineup');
  const hash = createHash('sha256').update(bytes).digest('hex');
  const shotId = id(hash + ':shot');
  const key = `lineups/${lineupId}/${hash}.jpg`;
  const dest = path.resolve(process.env.LOCAL_IMAGE_DIR, key);
  await mkdir(path.dirname(dest), { recursive: true });
  await writeFile(dest, bytes);
  prepared.push({ row, lineupId, shotId, key });
}
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1, connectionTimeoutMillis: 5000 });
const client = await pool.connect();
try {
  await client.query('BEGIN');
  const stratId = '4eb23f21-a072-4e5e-a825-000000000001';
  const phases = await client.query('SELECT id FROM phases WHERE strat_id=$1 AND idx=1', [stratId]);
  if (phases.rowCount !== 1) throw new Error('Expected sample Mirage A execute phase is missing; no database changes made.');
  const phaseId = phases.rows[0].id;
  for (const { row, lineupId, shotId, key } of prepared) {
    const [filename, name, kind, coords, jump, movement, role, steps] = row;
    const throwId = id(filename + ':throw');
    await client.query(`INSERT INTO throws (id,map,name,kind,note) VALUES ($1,'de_mirage',$2,$3,$4) ON CONFLICT (id) DO NOTHING`,
      [throwId, name + ' [A execute]', kind, 'User screenshot and supplied coordinates. Landing coordinates not recorded; no landing marker is implied.']);
    await client.query(`INSERT INTO lineups (id,throw_id,name,throw_x,throw_y,throw_z,pitch,yaw,side,movement,jump,click,from_callout,steps,note)
      VALUES ($1,$2,'User practice capture',$3,$4,$5,$6,$7,'t',$8,$9,'left',$10,$11,$12) ON CONFLICT (id) DO NOTHING`,
      [lineupId, throwId, ...coords, movement, jump, filename.includes('palace') ? 'Palace' : 'A ramp', steps,
        'Crosshair reference supplied by user. Held weapon may differ from the intended grenade; equip the listed utility before throwing. Capture does not verify the grenade landing.']);
    await client.query(`INSERT INTO lineup_shots (id,lineup_id,r2_key,shot_kind,idx) VALUES ($1,$2,$3,'crosshair',0) ON CONFLICT (id) DO NOTHING`, [shotId,lineupId,key]);
    await client.query(`INSERT INTO strat_utility (id,phase_id,throw_id,note) VALUES ($1,$2,$3,$4) ON CONFLICT (id) DO NOTHING`, [id(filename + ':use'),phaseId,throwId,role]);
  }
  await client.query('COMMIT');
  console.log(`Imported 5 utility lineups and photos. Reruns preserve existing edits. Open http://localhost:3000/strat/${stratId}`);
} catch (error) {
  await client.query('ROLLBACK'); throw error;
} finally { client.release(); await pool.end(); }
