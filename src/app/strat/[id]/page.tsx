import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { TopBar } from "@/components/TopBar";
import { RadarBackground } from "@/components/RadarBackground";
import { db } from "@/db";
import { players } from "@/db/schema";
import { requirePlayer } from "@/lib/auth";
import { mapDisplayName, radarFor, worldToPixel } from "@/lib/radar";
import { getStrat } from "@/lib/strats";
import { playerMarker, assignmentDescription } from "@/lib/player-markers";
import { MIRAGE_EXECUTE_ID, MIRAGE_BUY_PLAN, UTILITY, utilityCost, AFTER_THROW_JOBS } from "@/lib/mirage-buy-plan";
import { UtilityIcon } from "@/components/UtilityIcon";
import { MirageExecuteOverlay, CLEAR_TARGETS, HOLD_TARGETS } from "@/components/MirageExecuteOverlay";
import { LineupGuide } from "@/components/LineupGuide";
import { utilityRole } from "@/lib/utility-role";

export const dynamic = "force-dynamic";

const GLYPH: Record<string, { glyph: string; colour: string }> = {
  smoke: { glyph: "●", colour: "#cfd8dc" },
  flash: { glyph: "◎", colour: "#ffd257" },
  he: { glyph: "✳", colour: "#e57373" },
  molotov: { glyph: "▲", colour: "#ff8a4c" },
  decoy: { glyph: "◌", colour: "#90a4ae" },
};

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
const onClock = (s: number) => {
  const r = Math.max(0, 115 - s);
  return `${Math.floor(r / 60)}:${String(r % 60).padStart(2, "0")}`;
};

export default async function Board({ params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePlayer();
  if (!auth.ok) redirect("/login");

  const { id } = await params;
  const full = await getStrat(id);
  const cfg = full ? radarFor(full.strat.map) : null;
  if (!full || !cfg) notFound();

  const roster = await db()
    .select({ steamid64: players.steamid64, nickname: players.nickname })
    .from(players);
  const nameOf = (sid: string | null) =>
    sid ? (roster.find((r) => r.steamid64 === sid)?.nickname ?? "?") : "unassigned";

  const { strat } = full;

  return (
    <>
      <TopBar
        nickname={auth.player.nickname}
        crumbs={[
          { href: `/${strat.map}/${strat.side}`, label: mapDisplayName(strat.map) },
          { href: `/${strat.map}/${strat.side}`, label: strat.side === "t" ? "T side" : "CT side" },
          { label: strat.name },
        ]}
      />
      <main className="wrap">
        <div className="board-head">
          <div>
            <h1>{strat.name}</h1>
            <p className="muted">
              {mapDisplayName(strat.map)} · {strat.side.toUpperCase()} ·{" "}
              {strat.kind.replace("_", "-")}
              {strat.target ? ` · ${strat.target.toUpperCase()}` : ""}{" "}
              <span className={`tag tag-${strat.status}`}>{strat.status}</span>
            </p>
          </div>
          <div className="board-actions">
            <Link className="btn btn-primary" href={`/strat/${id}/edit`}>
              Edit
            </Link>
          </div>
        </div>

        {full.phases.length === 0 ? (
          <p className="muted">No phases yet.</p>
        ) : (
          full.phases.map(({ phase, assignments, utility }) => {
            const isMirageExecute = strat.id === MIRAGE_EXECUTE_ID;
            const showBuyPlan = isMirageExecute && phase.idx === 0;
            const showExecuteOverlay = isMirageExecute && phase.idx === 1;
            const showHoldOverlay = isMirageExecute && phase.idx === 2;
            const guideUtility = showBuyPlan ? full.phases.find((p) => p.phase.idx === 1)?.utility ?? [] : isMirageExecute ? [] : utility;
            const lookTargets = showHoldOverlay ? HOLD_TARGETS : CLEAR_TARGETS;
            // Only levels that actually carry a marker, so a flat map shows one radar
            // and Nuke shows two only when both floors are used.
            const levels = cfg.levels
              .map((l) => l.id)
              .filter(
                (lid) =>
                  utility.some((u) => u.item.level === lid) ||
                  assignments.some((a) => a.level === lid),
              );
            const shown = levels.length ? levels : [cfg.levels[0]!.id];

            return (
              <section key={phase.id} className="board-phase">
                <h2>
                  {phase.name}{" "}
                  <span className="muted board-clock">
                    +{mmss(phase.clockOffsetS)} · {onClock(phase.clockOffsetS)} on the clock
                  </span>
                </h2>

                <div className="board-cols">
                  <div className="board-radars" data-n={shown.length}>
                    {shown.map((lid) => (
                      <svg key={lid} viewBox="0 0 1000 1000" className="radar">
                        <RadarBackground map={strat.map} level={lid} />
                        {showBuyPlan && lid === "default" ? <MirageExecuteOverlay mode="planning" assignments={assignments} guides={guideUtility.flatMap(({use, item, lineups}) => lineups.slice(0, 1).map(({lineup}) => ({name: item.name, lineupId: lineup.id, role: utilityRole(use.note)})))} /> : null}
                        {showExecuteOverlay && lid === "default" ? <MirageExecuteOverlay assignments={assignments} /> : null}
                        {showHoldOverlay && lid === "default" ? <MirageExecuteOverlay assignments={assignments} mode="hold" /> : null}
                        {utility
                          .filter((u) => u.item.level === lid)
                          .filter((u) => u.item.landX !== null && u.item.landY !== null)
                          .map(({ use, item, lineups }) => {
                            const land = worldToPixel(strat.map, item.landX!, item.landY!)!;
                            const g = GLYPH[item.kind] ?? GLYPH.smoke!;
                            const spots = lineups.filter((l) => l.lineup.throwX !== null);
                            return (
                              <g key={use.id}>
                                {spots.map(({ lineup }, i) => {
                                  const from = worldToPixel(strat.map, lineup.throwX!, lineup.throwY!)!;
                                  return (
                                    <g key={lineup.id}>
                                      <line
                                        x1={from.fx * 1000} y1={from.fy * 1000}
                                        x2={land.fx * 1000} y2={land.fy * 1000}
                                        stroke={g.colour} strokeWidth="2"
                                        strokeDasharray="6 5" opacity="0.6"
                                      />
                                      <circle cx={from.fx * 1000} cy={from.fy * 1000} r="11"
                                        fill={g.colour} fillOpacity="0.75" stroke="#00000088" strokeWidth="1.5" />
                                      <text x={from.fx * 1000} y={from.fy * 1000 + 5} textAnchor="middle"
                                        fontSize="14" fill="#0d1416" fontWeight="700">{i + 1}</text>
                                    </g>
                                  );
                                })}
                                <circle
                                  cx={land.fx * 1000}
                                  cy={land.fy * 1000}
                                  r="14"
                                  fill={g.colour}
                                  fillOpacity="0.85"
                                  stroke="#00000088"
                                  strokeWidth="1.5"
                                />
                                <text
                                  x={land.fx * 1000}
                                  y={land.fy * 1000 + 5}
                                  textAnchor="middle"
                                  fontSize="15"
                                  fill="#0d1416"
                                >
                                  {g.glyph}
                                </text>
                              </g>
                            );
                          })}
                        {assignments
                          .filter((a) => a.level === lid && a.x !== null && a.y !== null)
                          .map((a) => {
                            const p = worldToPixel(strat.map, a.x!, a.y!)!;
                            const marker = playerMarker(a.note, nameOf(a.playerSteamid64));
                            return (
                              <g key={a.id}>
                                <title>{marker.label}: {assignmentDescription(a.note) ?? a.action}</title>
                                <circle
                                  cx={p.fx * 1000}
                                  cy={p.fy * 1000}
                                  r="16"
                                  fill={marker.colour}
                                  stroke="#101719"
                                  strokeWidth="3"
                                />
                                <text x={p.fx * 1000} y={p.fy * 1000 + 6} textAnchor="middle" fontSize="18" fontWeight="800" fill="#101719">{marker.number ?? "•"}</text>
                                <text
                                  x={p.fx * 1000}
                                  y={p.fy * 1000 + 38}
                                  textAnchor="middle"
                                  fontSize="18"
                                  fill={marker.colour}
                                  stroke="#101719"
                                  strokeWidth="5"
                                  paintOrder="stroke"
                                >
                                  {marker.label}
                                </text>
                              </g>
                            );
                          })}
                      </svg>
                    ))}
                  </div>

                  <div>
                  {showBuyPlan ? (
                    <section className="buy-plan" aria-label="Player utility buy plan">
                      <h3>Utility to buy</h3>
                      <p className="muted">Minimum cash for the listed utility, assuming none is carried over. Weapons and armor cost extra.</p>
                      {MIRAGE_BUY_PLAN.map(({ role, items, job }) => {
                        const marker = playerMarker(`${role}:`, role);
                        return (
                          <div className="buy-role" key={role}>
                            <div className="buy-role-head"><strong style={{ color: marker.colour }}>{marker.number} · {role}</strong><strong>${utilityCost(items)}</strong></div>
                            <div className="buy-items">{items.length ? items.map((kind, i) => <span className="buy-item" key={`${kind}-${i}`}><UtilityIcon kind={kind} colour={marker.colour} /><span>{UTILITY[kind].label}</span></span>) : <span className="muted">No utility required for this role</span>}</div>
                            <p className="muted">{job}</p>
                          </div>
                        );
                      })}
                      <div className="buy-role-head buy-total"><strong>Team utility minimum</strong><strong>${MIRAGE_BUY_PLAN.reduce((sum, row) => sum + utilityCost(row.items), 0)}</strong></div>
                    </section>
                  ) : null}
                  <ul className="board-jobs">
                    {!showExecuteOverlay ? utility.map(({ use, item, lineups }) => {
                      const g = GLYPH[item.kind] ?? GLYPH.smoke!;
                      return (
                        <li key={use.id}>
                          <span className="job-glyph" style={{ color: g.colour }}>
                            {g.glyph}
                          </span>
                          <span className="job-who">{nameOf(use.throwerSteamid64)}</span>
                          <span className="job-what">
                            {item.name}
                            {lineups.length
                              ? ` · ${lineups.length} lineup${lineups.length === 1 ? "" : "s"}`
                              : " · no lineup yet"}
                          </span>
                          {use.note ?? item.note ? (
                            <span className="muted job-note">{use.note ?? item.note}</span>
                          ) : null}
                        </li>
                      );
                    }) : null}
                    {!showBuyPlan ? assignments.map((a) => {
                      const marker = playerMarker(a.note, nameOf(a.playerSteamid64));
                      return (
                      <li key={a.id}>
                        <span className="job-glyph" style={{ color: marker.colour }}>
                          {marker.number ?? "▲"}
                        </span>
                        <span className="job-who" style={{ color: marker.colour }}>{marker.label}{a.playerSteamid64 ? ` · ${nameOf(a.playerSteamid64)}` : ""}</span>
                        <span className="job-what">{a.action}</span>
                        {a.note ? <span className="muted job-note">{showExecuteOverlay ? AFTER_THROW_JOBS[marker.label] ?? assignmentDescription(a.note) : assignmentDescription(a.note)}</span> : null}
                        {(showExecuteOverlay || showHoldOverlay) && lookTargets[marker.label] ? <span className="muted job-note">→ {lookTargets[marker.label]!.label}</span> : null}
                      </li>
                    ); }) : null}
                    {utility.length === 0 && assignments.length === 0 ? (
                      <li className="muted">Nothing placed in this phase.</li>
                    ) : null}
                  </ul>
                  {showBuyPlan ? <p className="muted">Utility zones use the thrower's role color. Click an icon for the lineup. Landing areas are approximate planning targets.</p> : null}
                  {showExecuteOverlay ? <p className="muted">After throwing: move together on the flash. Arrows show clearing angles; Bomb and Support follow behind the first contact.</p> : null}
                  {showHoldOverlay ? <p className="muted">Colored arrows show where each role should look after planting. These are suggested holding angles; adjust to enemy information.</p> : null}
                  </div>
                </div>
                {guideUtility.length ? (
                  <section className="role-lineups">
                    <h3>Utility guides by role</h3>
                    <p className="muted">Click a utility icon on the radar, or choose “Show how to throw” below.</p>
                    {[...new Set(guideUtility.map(({ use }) => utilityRole(use.note)))].map((role) => {
                      const marker = playerMarker(`${role}:`, role);
                      const uses = guideUtility.filter(({use}) => utilityRole(use.note) === role);
                      const playerIds = [...new Set(uses.map(({use}) => use.throwerSteamid64).filter((sid): sid is string => Boolean(sid)))];
                      return <section key={role}>
                        <h3 style={{ color: marker.colour }}>{role}{playerIds.length ? ` · ${playerIds.map(nameOf).join(", ")}` : ""}</h3>
                        <div className="execute-lineups">
                          {uses.flatMap(({item, lineups}) => lineups.map(({lineup, shots}) => <LineupGuide
                            key={lineup.id} id={lineup.id} name={item.name}
                            technique={`${lineup.movement.replaceAll("_", " ")} · ${lineup.jump ? "jump throw" : "no jump"} · ${lineup.click} click`}
                            steps={lineup.steps} note={lineup.note}
                            shots={shots.map(({id, shotKind}) => ({id, shotKind}))}
                            command={lineup.throwX !== null && lineup.throwY !== null && lineup.throwZ !== null && lineup.pitch !== null && lineup.yaw !== null ? `setpos ${lineup.throwX} ${lineup.throwY} ${lineup.throwZ}; setang ${lineup.pitch} ${lineup.yaw} 0` : null}
                          />))}
                        </div>
                      </section>;
                    })}
                  </section>
                ) : null}
              </section>
            );
          })
        )}
      </main>
    </>
  );
}
