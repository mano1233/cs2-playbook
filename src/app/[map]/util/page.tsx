/**
 * The throw library for one map, managed on its own.
 *
 * This is the point of splitting throws out of strats: a smoke exists because it is a
 * throw on Nuke, not because some exec happens to reference it. You can build and
 * photograph the whole A-site set here before a single strat exists, and a teammate can
 * learn the throws without opening one.
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
  for (const r of rows) {
    byKind.set(r.item.kind, [...(byKind.get(r.item.kind) ?? []), r]);
  }

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

        <h1>{mapDisplayName(map)} · utility</h1>
        <p className="muted">
          Every throw on this map. They belong to the map, not to a strat — a strat
          references them, so the screenshots are taken once and a fixed lineup is fixed
          everywhere.
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
              <span className="muted" style={{ fontWeight: 400, fontSize: ".85rem" }}>
                {" "}· {items.length}
              </span>
            </h2>
            <div className="util-grid">
              {items.map(({ item, lineups, usedBy }) => {
                const land = worldToPixel(map, item.landX, item.landY);
                const from =
                  item.throwX !== null && item.throwY !== null
                    ? worldToPixel(map, item.throwX, item.throwY)
                    : null;
                const g = GLYPH[item.kind] ?? GLYPH.smoke!;
                return (
                  <article key={item.id} className="util-card">
                    <h3>{item.name}</h3>
                    <div className="util-meta">
                      {item.technique.replace("_", " ")}
                      {cfg.levels.length > 1 ? ` · ${item.level}` : ""}
                      {from ? " · origin set" : " · no origin"}
                    </div>

                    <svg viewBox="0 0 1000 1000" className="radar" style={{ marginTop: ".5rem" }}>
                      <image href={`/api/radars/${map}/${item.level}`} x="0" y="0" width="1000" height="1000" />
                      {from && land ? (
                        <>
                          <line
                            x1={from.fx * 1000} y1={from.fy * 1000}
                            x2={land.fx * 1000} y2={land.fy * 1000}
                            stroke={g.colour} strokeWidth="3" strokeDasharray="8 6" opacity="0.8"
                          />
                          <circle cx={from.fx * 1000} cy={from.fy * 1000} r="9"
                            fill="none" stroke={g.colour} strokeWidth="3" />
                        </>
                      ) : null}
                      {land ? (
                        <circle cx={land.fx * 1000} cy={land.fy * 1000} r="16"
                          fill={g.colour} fillOpacity="0.9" stroke="#00000088" strokeWidth="2" />
                      ) : null}
                    </svg>

                    {lineups.length ? (
                      <div className="shots">
                        {lineups.map((l) => (
                          <figure key={l.id}>
                            <img src={`/api/lineups/${l.id}`} alt={`${item.name} ${l.shotKind}`} />
                            <figcaption>{l.shotKind}</figcaption>
                          </figure>
                        ))}
                      </div>
                    ) : (
                      <p className="util-used">No lineup shots yet.</p>
                    )}

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
