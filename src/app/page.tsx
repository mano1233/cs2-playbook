import Link from "next/link";
import { redirect } from "next/navigation";
import { TopBar } from "@/components/TopBar";
import { requirePlayer } from "@/lib/auth";
import { knownMaps, mapDisplayName } from "@/lib/radar";
import { stratCounts } from "@/lib/strats";

export const dynamic = "force-dynamic";

export default async function Home() {
  const auth = await requirePlayer();
  if (!auth.ok) redirect("/login");

  const counts = await stratCounts();
  const maps = knownMaps();

  return (
    <>
      <TopBar nickname={auth.player.nickname} />
      <main className="wrap">
        <h1>Maps</h1>
        <p className="muted">
          Pick a map and a side. T side holds execs and defaults; CT side holds setups,
          retakes and after-plant.
        </p>

        <div className="map-grid">
          {maps.map((map) => {
            const c = counts[map] ?? { t: 0, ct: 0 };
            return (
              <article key={map} className="map-card">
                <h2>{mapDisplayName(map)}</h2>
                <code className="muted">{map}</code>
                <div className="side-links">
                  <Link href={`/${map}/t`} className="side side-t">
                    <span className="side-name">T</span>
                    <span className="side-count">{c.t || "—"}</span>
                  </Link>
                  <Link href={`/${map}/ct`} className="side side-ct">
                    <span className="side-name">CT</span>
                    <span className="side-count">{c.ct || "—"}</span>
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      </main>
    </>
  );
}
