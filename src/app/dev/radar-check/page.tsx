/**
 * Calibration check, not a feature.
 *
 * Plots real bomb plants from parsed demos onto each radar through the same
 * `worldToPixel` the editor will use. If the transform, the calibration or the image
 * disagree with each other, the markers land off the bombsites and it is obvious at a
 * glance — which a unit test asserting "inBounds" cannot tell you, since the whole
 * image is in bounds.
 *
 * Nuke is the interesting case: the A and B markers must appear on different images,
 * chosen by z alone.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { notFound } from "next/navigation";
import { hasMultipleLevels, levelForZ, radarFor, worldToPixel } from "@/lib/radar";

export const dynamic = "force-dynamic";

interface Plant {
  x: number;
  y: number;
  z: number;
}

async function loadPlants(): Promise<Record<string, Plant[]>> {
  try {
    const raw = await readFile(join(process.cwd(), "public/radars/_plants.json"), "utf8");
    return JSON.parse(raw) as Record<string, Plant[]>;
  } catch {
    return {};
  }
}

function Radar({ map, level, plants }: { map: string; level: string; plants: Plant[] }) {
  const cfg = radarFor(map)!;
  const onThisLevel = plants.filter((p) => levelForZ(map, p.z) === level);

  return (
    <figure style={{ margin: 0 }}>
      <figcaption
        style={{ fontFamily: "var(--mono)", fontSize: ".8rem", color: "var(--muted)", marginBottom: ".4rem" }}
      >
        {map} · {level} · {onThisLevel.length} plant{onThisLevel.length === 1 ? "" : "s"}{onThisLevel.length > 1 ? " (they stack on the sites — density is the point)" : ""}
      </figcaption>
      <svg
        viewBox="0 0 1000 1000"
        style={{ width: "100%", border: "1px solid var(--line)", borderRadius: "var(--radius)", background: "#000" }}
      >
        {/* Local files, deliberately. The R2 route is session-gated, so pointing this
            page at it makes a dev-only calibration check unusable in any browser that
            is not signed in — and a failed image load looks like a calibration fault
            rather than an auth one, which sent me chasing the wrong bug. The bytes are
            identical either way; the R2 path is verified separately. */}
        <image href={`/radars/${map}__${level}.png`} x="0" y="0" width="1000" height="1000" />
        {onThisLevel.map((p, i) => {
          const px = worldToPixel(map, p.x, p.y);
          if (!px) return null;
          return (
            // Small and translucent on purpose: plants pile up on the two sites, and
            // fat rings smear 40-odd of them into one blob that reads as noise rather
            // than as the tight cluster it actually is.
            <circle
              key={i}
              cx={px.fx * 1000}
              cy={px.fy * 1000}
              r="4"
              fill="#17a398"
              fillOpacity="0.55"
              stroke="#0b3d3a"
              strokeWidth="0.8"
            />
          );
        })}
      </svg>
    </figure>
  );
}

export default async function RadarCheck() {
  // A verification page has no business on a public URL.
  if (process.env.NODE_ENV === "production") notFound();

  const plants = await loadPlants();
  const maps = Object.keys(plants).filter((m) => radarFor(m)).sort();

  return (
    <main className="wrap">
      <h1>Radar calibration check</h1>
      <p className="muted">
        Real bomb plants from parsed demos, placed by <code>worldToPixel</code>. Every marker
        should sit on a bombsite. On Nuke the A and B plants must land on different images,
        chosen from z alone.
      </p>

      {maps.length === 0 ? (
        <div className="error">
          No plant data. Expected <code>public/radars/_plants.json</code>.
        </div>
      ) : null}

      {maps.map((map) => {
        const cfg = radarFor(map)!;
        const levels = hasMultipleLevels(map) ? cfg.levels.map((l) => l.id) : ["default"];
        return (
          <section key={map} style={{ marginTop: "2rem" }}>
            <h2>
              {map}{" "}
              <span className="muted" style={{ fontWeight: 400, fontSize: ".9rem" }}>
                pos=({cfg.posX}, {cfg.posY}) scale={cfg.scale}
              </span>
            </h2>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: `repeat(${Math.min(levels.length, 2)}, minmax(0, 1fr))`,
                gap: "1rem",
              }}
            >
              {levels.map((level) => (
                <Radar key={level} map={map} level={level} plants={plants[map] ?? []} />
              ))}
            </div>
          </section>
        );
      })}
    </main>
  );
}
