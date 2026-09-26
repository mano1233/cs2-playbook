import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { TopBar } from "@/components/TopBar";
import { db } from "@/db";
import { players } from "@/db/schema";
import { requirePlayer } from "@/lib/auth";
import { mapDisplayName, radarFor, worldToPixel } from "@/lib/radar";
import { getStrat } from "@/lib/strats";

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
                        <image
                          href={`/api/radars/${strat.map}/${lid}`}
                          x="0"
                          y="0"
                          width="1000"
                          height="1000"
                        />
                        {utility
                          .filter((u) => u.item.level === lid)
                          .map(({ item }) => {
                            const land = worldToPixel(strat.map, item.landX, item.landY)!;
                            const g = GLYPH[item.kind] ?? GLYPH.smoke!;
                            const from =
                              item.throwX !== null && item.throwY !== null
                                ? worldToPixel(strat.map, item.throwX, item.throwY)
                                : null;
                            return (
                              <g key={item.id}>
                                {from ? (
                                  <line
                                    x1={from.fx * 1000}
                                    y1={from.fy * 1000}
                                    x2={land.fx * 1000}
                                    y2={land.fy * 1000}
                                    stroke={g.colour}
                                    strokeWidth="2"
                                    strokeDasharray="6 5"
                                    opacity="0.7"
                                  />
                                ) : null}
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
                            return (
                              <g key={a.id}>
                                <circle
                                  cx={p.fx * 1000}
                                  cy={p.fy * 1000}
                                  r="13"
                                  fill="#17a398"
                                  stroke="#00000088"
                                  strokeWidth="1.5"
                                />
                                <text
                                  x={p.fx * 1000}
                                  y={p.fy * 1000 + 24}
                                  textAnchor="middle"
                                  fontSize="20"
                                  fill="#e6ecea"
                                >
                                  {nameOf(a.playerSteamid64)}
                                </text>
                              </g>
                            );
                          })}
                      </svg>
                    ))}
                  </div>

                  <ul className="board-jobs">
                    {utility.map(({ use, item, lineups }) => {
                      const g = GLYPH[item.kind] ?? GLYPH.smoke!;
                      return (
                        <li key={use.id}>
                          <span className="job-glyph" style={{ color: g.colour }}>
                            {g.glyph}
                          </span>
                          <span className="job-who">{nameOf(use.throwerSteamid64)}</span>
                          <span className="job-what">
                            {item.name} · {item.technique.replace("_", " ")}
                            {lineups.length ? ` · ${lineups.length} shot` : ""}
                          </span>
                          {use.note ?? item.note ? (
                            <span className="muted job-note">{use.note ?? item.note}</span>
                          ) : null}
                        </li>
                      );
                    })}
                    {assignments.map((a) => (
                      <li key={a.id}>
                        <span className="job-glyph" style={{ color: "#17a398" }}>
                          ▲
                        </span>
                        <span className="job-who">{nameOf(a.playerSteamid64)}</span>
                        <span className="job-what">{a.action}</span>
                        {a.note ? <span className="muted job-note">{a.note}</span> : null}
                      </li>
                    ))}
                    {utility.length === 0 && assignments.length === 0 ? (
                      <li className="muted">Nothing placed in this phase.</li>
                    ) : null}
                  </ul>
                </div>
              </section>
            );
          })
        )}
      </main>
    </>
  );
}
