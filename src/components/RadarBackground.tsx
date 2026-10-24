/** Styling affects only the background; world-to-radar geometry stays unchanged. */
export function RadarBackground({ map, level }: { map: string; level: string }) {
  return (
    <g pointerEvents="none" aria-hidden="true">
      <rect width="1000" height="1000" fill="#101719" />
      <image
        href={`/api/radars/${map}/${level}`}
        x="0" y="0" width="1000" height="1000"
        className={map === "de_mirage" ? "radar-background-simple" : undefined}
      />
      {map === "de_mirage" ? (
        <g className="radar-callouts">
          {/* Display labels only, not measured grenade landing positions. */}
          <text x="540" y="730" className="radar-site-label">A</text>
          <text x="230" y="290" className="radar-site-label">B</text>
          <text x="730" y="685">A RAMP</text>
          <text x="770" y="820">PALACE</text>
          <text x="610" y="620">STAIRS</text>
          <text x="445" y="590">JUNGLE</text>
          <text x="380" y="840">CT</text>
          <text x="580" y="420">MID</text>
        </g>
      ) : null}
    </g>
  );
}
