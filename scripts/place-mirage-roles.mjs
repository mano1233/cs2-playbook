import { Pool } from 'pg';
import { mkdir, writeFile } from 'node:fs/promises';
const stratId = '4eb23f21-a072-4e5e-a825-000000000001';
const roles = ['Entry', 'Trade', 'Support', 'Bomb', 'Palace'];
// Suggested planning positions in Source world units, not verified grenade impacts.
const plan = [
  [[450,-1450,-180],[908,-1036,-194],[1200,-850,-194],[1104,-998,-194],[568,-2224,24]],
  [[100,-1700,-168],[500,-1450,-180],[1088,-1016,-196],[1104,-998,-194],[23,-2367,24]],
  [[-380,-1450,-168],[-250,-2000,-168],[350,-1550,-180],[-300,-2170,-168],[50,-2300,24]],
];
const actions = [
  ['hold','support','support','support','hold'],
  ['entry','trade','throw','throw','support'],
  ['hold','hold','support','hold','hold'],
];
const notes = [
  ['Stage at ramp and wait for the utility call.', 'Prepare the stairs smoke.', 'Prepare the jungle smoke.', 'Prepare the CT smoke; keep the bomb safe.', 'Stage in Palace; prepare the molotov and flash.'],
  ['Enter from ramp after the smokes and flash.', 'Follow ramp entry at trading distance after throwing stairs smoke.', 'Throw jungle smoke from your saved lineup, then join ramp.', 'Throw CT smoke from your saved lineup, then follow with the bomb.', 'Use the saved molotov and flash lineups in sequence, then join the entry.'],
  ['Watch stairs/jungle from cover.', 'Watch CT from site cover.', 'Hold ramp and save remaining utility.', 'After planting, hold a crossfire with the trade player.', 'Hold from Palace and report retake movement.'],
];
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1, connectionTimeoutMillis: 5000 });
const client = await pool.connect();
try {
  await client.query('BEGIN');
  await client.query('SELECT id FROM strats WHERE id=$1 FOR UPDATE', [stratId]);
  const phases = await client.query('SELECT id,idx,note FROM phases WHERE strat_id=$1 ORDER BY idx', [stratId]);
  if (phases.rowCount !== 3 || phases.rows.some((p,i) => p.idx !== i)) throw new Error('Expected three sample phases');
  const previous = await client.query('SELECT a.* FROM assignments a JOIN phases p ON p.id=a.phase_id WHERE p.strat_id=$1', [stratId]);
  await mkdir('work', { recursive: true });
  await writeFile(`work/role-positions-backup-${Date.now()}.json`, JSON.stringify({phases:phases.rows,assignments:previous.rows},null,2));
  for (const phase of phases.rows) {
    for (const [r, role] of roles.entries()) {
      const existing = previous.rows.filter(a => a.phase_id === phase.id && a.note?.startsWith(role + ':'));
      if (existing.length > 1) throw new Error('Ambiguous role: ' + role);
      const [x,y,z] = plan[phase.idx][r];
      const note = `${role}: ${notes[phase.idx][r]}`;
      if (existing.length) {
        await client.query('UPDATE assignments SET x=$1,y=$2,z=$3,action=$4,note=$5 WHERE id=$6', [x,y,z,actions[phase.idx][r],note,existing[0].id]);
      } else {
        await client.query('INSERT INTO assignments (phase_id,x,y,z,action,note) VALUES ($1,$2,$3,$4,$5,$6)', [phase.id,x,y,z,actions[phase.idx][r],note]);
      }
    }
    const explanation = ' Suggested role positions for planning; adjust in the editor after practice. Utility screenshots show the exact throwing aim; markers represent this phase, not a movement simulation.';
    if (!phase.note?.includes('Suggested role positions')) await client.query('UPDATE phases SET note=coalesce(note,\'\') || $1 WHERE id=$2', [explanation,phase.id]);
  }
  await client.query('UPDATE strats SET version=version+1, updated_at=now() WHERE id=$1', [stratId]);
  const result = await client.query('SELECT p.name,count(a.id)::int AS markers FROM phases p JOIN assignments a ON a.phase_id=p.id WHERE p.strat_id=$1 AND a.x IS NOT NULL AND a.y IS NOT NULL GROUP BY p.id ORDER BY p.idx', [stratId]);
  await client.query('COMMIT');
  console.log(JSON.stringify(result.rows));
} catch (error) { await client.query('ROLLBACK'); throw error; }
finally { client.release(); await pool.end(); }
