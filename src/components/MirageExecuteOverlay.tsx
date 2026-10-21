import { worldToPixel } from "@/lib/radar";
import { playerMarker } from "@/lib/player-markers";

/** Approximate tactical areas, deliberately separate from measured throw coordinates. */
const ZONES = [
  { name: "CT smoke", x: -1000, y: -2500, kind: "smoke" },
  { name: "Stairs smoke", x: -550, y: -1450, kind: "smoke" },
  { name: "Jungle smoke", x: -850, y: -1450, kind: "smoke" },
  { name: "Under Palace fire", x: 100, y: -2200, kind: "molotov" },
  { name: "Palace flash", x: 150, y: -1900, kind: "flash" },
];
export const CLEAR_TARGETS: Record<string, { label: string; x: number; y: number }> = {
  Entry: { label: "Clear under Palace", x: 100, y: -2200 },
  Trade: { label: "Clear triple", x: -450, y: -2100 },
  Palace: { label: "Clear site / sandwich", x: -350, y: -1750 },
};
export const HOLD_TARGETS: Record<string, { label: string; x: number; y: number }> = {
  Entry: { label: "Watch stairs / jungle approach", x: -750, y: -1300 },
  Trade: { label: "Watch CT spawn", x: -1100, y: -2600 },
  Support: { label: "Watch the ramp flank", x: 850, y: -1400 },
  Bomb: { label: "Watch CT from plant cover", x: -800, y: -2500 },
  Palace: { label: "Watch site / default", x: -300, y: -2100 },
};
const point = (x: number, y: number) => {
  const p = worldToPixel("de_mirage", x, y)!;
  return { x: p.fx * 1000, y: p.fy * 1000 };
};

export function MirageExecuteOverlay({ assignments, mode = "execute", guides = [] }: {
  assignments: { id: string; note: string | null; x: number | null; y: number | null }[];
  mode?: "planning" | "execute" | "hold";
  guides?: { name: string; lineupId: string; role?: string }[];
}) {
  return (
    <g pointerEvents="none">
      <defs>
        {[1,2,3,4,5].map((n) => <marker id={`clear-arrow-${mode}-${n}`} key={n} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill={playerMarker(`${["Entry","Trade","Support","Bomb","Palace"][n-1]}:`, "").colour} /></marker>)}
      </defs>
      {(mode === "planning" ? ZONES : []).map((zone) => {
        const p = point(zone.x, zone.y);
        const fire = zone.kind === "molotov";
        const flash = zone.kind === "flash";
        const prefix = fire ? "under palace" : flash ? "site flash" : zone.name.toLowerCase();
        const guide = guides.find((g) => g.name.toLowerCase().startsWith(prefix));
        const colour = guide?.role ? playerMarker(`${guide.role}:`, guide.role).colour : fire ? "#ff8a4c" : flash ? "#ffd257" : "#d8e4ec";
        return <a key={zone.name} href={guide ? `#lineup-${guide.lineupId}` : undefined} style={{ pointerEvents: guide ? "all" : "none" }} className="radar-utility-link" aria-label={`${zone.name}: show throw instructions`}>
          <title>{zone.name} — approximate target area, not a measured landing</title>
          <ellipse cx={p.x} cy={p.y} rx={fire ? 27 : 32} ry="25" fill={colour} fillOpacity=".23" stroke={colour} strokeWidth="2.5" strokeDasharray="5 4" />
          <text x={p.x} y={p.y+6} textAnchor="middle" fontSize="21" fill={colour}>{fire ? "♨" : flash ? "◎" : "☁"}</text>
          <text x={p.x} y={p.y-33} textAnchor="middle" fontSize="16" fontWeight="700" fill={colour} stroke="#101719" strokeWidth="5" paintOrder="stroke">{zone.name}{guide?.role ? ` · ${guide.role}` : ""}</text>
        </a>;
      })}
      {(mode === "planning" ? [] : assignments).map((assignment) => {
        const role = playerMarker(assignment.note, "");
        const target = (mode === "hold" ? HOLD_TARGETS : CLEAR_TARGETS)[role.label];
        if (!target || !role.number || assignment.x === null || assignment.y === null) return null;
        const from = point(assignment.x, assignment.y);
        const to = point(target.x, target.y);
        return <g key={assignment.id}>
          <title>{role.label}: {target.label}. Look direction, not a walking route.</title>
          <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke="#101719" strokeWidth="7" opacity=".8" />
          <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke={role.colour} strokeWidth="3" strokeDasharray="8 5" markerEnd={`url(#clear-arrow-${mode}-${role.number})`} />
        </g>;
      })}
    </g>
  );
}
