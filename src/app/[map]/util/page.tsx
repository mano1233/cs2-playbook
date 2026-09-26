/**
 * The throw library for one map.
 *
 * One radar per throw, with every lineup drawn on it at once — each origin dashed back
 * to the same landing point. That is the shape the data actually has: a smoke lands in
 * one place and there are several ways to get it there, from spawn, from ramp, jump
 * thrown or standing.
 */
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { TopBar } from "@/components/TopBar";
import { requirePlayer } from "@/lib/auth";
import { mapDisplayName, radarFor, worldToPixel } from "@/lib/radar";
import { listThrows } from "@/lib/throws";

export const dynamic = "force-dynamic";

const GLYPH: Record<string, { glyph: string; colour: string }> = {
  smoke: { glyph: "●", colour: "#cfd8dc" },
  flash: { glyph: "◎", colour: "#ffd257" },
  he: { glyph: "✳", colour: "#e57373" },
  molotov: { glyph: "▲", colour: "#ff8a4c" },
  decoy: { glyph: "◌", colour: "#90a4ae" },
};

export default async function UtilLibrary({ params }: { params: Promise<{ map: string }> }) {
  const auth = await requirePlayer();
  if (!auth.ok) redirect("/login");

  const { map } = await params;
  const cfg = radarFor(map);
  if (!cfg) notFound();

  const rows = await listThrows(map);
  const byKind = new Map<string, typeof rows>();
  for (const r of rows) byKind.set(r.item.kind, [...(byKind.get(r.item.kind) ?? []), r]);

  return (
    <>
      <TopBar
        nickname={auth.player.nickname}
        crumbs={[{ href: `/${map}/t`, label: mapDisplayName(map) }, { label: "Utility" }]}
      />
      <main className="wrap">
        <div className="side-switch">
          <Link href={`/${map}/t`}>T side</Link>
          <Link href={`/${map}/ct`}>CT side</Link>
          <Link href={`/${map}/util`} className="active">Utility</Link>
        </div>

        <div className="board-head">
          <h1>{mapDisplayName(map)} · utility</h1>
          <div className="board-actions">
            <Link className="btn btn-primary" href={`/${map}/util/import`}>
              Import screenshots
            </Link>
          </div>
        </div>
        <p className="muted">
          Every throw on this map, with each way of landing it. They belong to the map,
          not to a strat — a strat references them, so the screenshots are taken once and
          a fixed lineup is fixed everywhere.
        </p>

        {rows.length === 0 ? (
          <p className="muted">
            Nothing yet. Place utility while editing a strat and it lands here
            automatically, or build the set here first.
          </p>
        ) : null}

        {[...byKind.entries()].map(([kind, items]) => (
          <section key={kind} style={{ marginTop: "1.6rem" }}>
            <h2 style={{ fontSize: "1rem" }}>
              <span style={{ color: GLYPH[kind]?.colour }}>{GLYPH[kind]?.glyph}</span> {kind}
              <span className="muted" style={{ fontWeight: 400, fontSize: ".85rem" }}> · {items.length}</span>
            </h2>

            <div className="util-grid">
              {items.map(({ item, lineups, usedBy }) => {
                const land =
                  item.landX !== null && item.landY !== null
                    ? worldToPixel(map, item.landX, item.landY)
                    : null;
                const g = GLYPH[item.kind] ?? GLYPH.smoke!;
                const positioned = lineups.filter((l) => l.lineup.throwX !== null);

                return (
                  <article key={item.id} className="util-card">
                    <h3>{item.name}</h3>
                    <div className="util-meta">
                      {land ? "" : "not placed yet · "}
                      {lineups.length} lineup{lineups.length === 1 ? "" : "s"}
                      {positioned.length !== lineups.length
                        ? ` · ${lineups.length - positioned.length} without an origin`
                        : ""}
                      {cfg.levels.length > 1 ? ` · ${item.level}` : ""}
                    </div>

                    {land ? (
                    <svg viewBox="0 0 1000 1000" className="radar" style={{ marginTop: ".5rem" }}>
                      <image href={`/api/radars/${map}/${item.level}`} x="0" y="0" width="1000" height="1000" />

                      {/* Every origin dashed back to the one landing point. */}
                      {land
                        ? positioned.map(({ lineup }, i) => {
                            const from = worldToPixel(map, lineup.throwX!, lineup.throwY!)!;
                            return (
                              <g key={lineup.id}>
                                <line
                                  x1={from.fx * 1000} y1={from.fy * 1000}
                                  x2={land.fx * 1000} y2={land.fy * 1000}
                                  stroke={g.colour} strokeWidth="3" strokeDasharray="9 7" opacity="0.75"
                                />
                                <circle cx={from.fx * 1000} cy={from.fy * 1000} r="13"
                                  fill={g.colour} fillOpacity="0.9" stroke="#00000088" strokeWidth="2" />
                                <text x={from.fx * 1000} y={from.fy * 1000 + 5}
                                  textAnchor="middle" fontSize="16" fill="#0d1416" fontWeight="700">
                                  {i + 1}
                                </text>
                              </g>
                            );
                          })
                        : null}

                      {land ? (
                        <>
                          <circle cx={land.fx * 1000} cy={land.fy * 1000} r="20"
                            fill="none" stroke={g.colour} strokeWidth="3" opacity="0.9" />
                          <circle cx={land.fx * 1000} cy={land.fy * 1000} r="9"
                            fill={g.colour} fillOpacity="0.95" />
                        </>
                      ) : null}
                    </svg>
                    ) : (
                      <p className="unplaced">
                        Imported from screenshots — open a strat and place it on the radar
                        to draw it.
                      </p>
                    )}

                    <ol className="lineup-list">
                      {lineups.map(({ lineup, shots }, i) => (
                        <li key={lineup.id}>
                          <span className="lineup-n">{i + 1}</span>
                          <div className="lineup-body">
                            <div className="lineup-head">
                              {lineup.name ?? `lineup ${i + 1}`}
                              <span className="muted"> · {lineup.technique.replace("_", " ")}</span>
                              {lineup.throwX === null ? (
                                <span className="muted"> · no origin</span>
                              ) : null}
                            </div>
                            {lineup.note ? <div className="muted lineup-note">{lineup.note}</div> : null}
                            {shots.length ? (
                              <div className="shots">
                                {shots.map((s) => (
                                  <figure key={s.id}>
                                    <img src={`/api/shots/${s.id}`} alt={`${item.name} ${s.shotKind}`} />
                                    <figcaption>{s.shotKind}</figcaption>
                                  </figure>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        </li>
                      ))}
                      {lineups.length === 0 ? (
                        <li className="muted">No lineups yet — nobody has worked out how to throw it.</li>
                      ) : null}
                    </ol>

                    {item.note ? <p className="util-used">{item.note}</p> : null}
                    <p className="util-used">
                      used by <strong>{usedBy ?? 0}</strong> strat{(usedBy ?? 0) === 1 ? "" : "s"}
                    </p>
                  </article>
                );
              })}
            </div>
          </section>
        ))}
      </main>
    </>
  );
}
