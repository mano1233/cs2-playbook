"use client";

/**
 * The map explorer: one radar, every landing spot, drill down to a lineup.
 *
 *   nothing selected   every landing spot that passes the filters, by kind
 *   a throw            the rest dim; its origins appear, numbered, dashed to it
 *   a lineup           the pictures, the steps, how to throw it, a setpos
 *
 * The selection and the filters live in the URL, so "this one" can be pasted into
 * Discord and opens on the same lineup.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { convertScreenshot } from "@/lib/convert-image";
import {
  CLICKS,
  CLICK_LABEL,
  MOVEMENTS,
  MOVEMENT_LABEL,
  PRECISIONS,
  PRECISION_LABEL,
  SIDE_LABEL,
  describeThrow,
  parseGetpos,
  setposCommand,
  stepsOf,
} from "@/lib/lineup-meta";
import type { CalloutLabel } from "@/lib/callouts";
import { worldToPixel } from "@/lib/radar";
import {
  type EditorLineup,
  type EditorThrow,
  type ShotKind,
  UTIL_META,
  type UtilKind,
} from "./editor-types";

export interface ExplorerThrow extends EditorThrow {
  uses: { stratId: string; name: string; side: string; status: string }[];
}

type Side = "all" | "t" | "ct";

const KINDS = Object.keys(UTIL_META) as UtilKind[];
const SHOT_ORDER: ShotKind[] = ["stand", "crosshair", "result"];
/** "stand" is what the column says; "location" is what the team calls it. */
const SHOT_LABEL: Record<ShotKind, string> = { stand: "location", crosshair: "crosshair", result: "result" };

const placed = (t: EditorThrow) => t.landX !== null && t.landY !== null;
/** A lineup with no side is thrown by either team. */
const sideMatches = (l: EditorLineup, side: Side) => side === "all" || l.side === null || l.side === side;
const lineupTitle = (l: EditorLineup, n: number) => l.fromCallout ?? l.name ?? `lineup ${n}`;

export function UtilExplorer({
  map,
  levels,
  callouts,
  throws: initialThrows,
  csrf,
  initial,
}: {
  map: string;
  levels: string[];
  /** Empty for a map no demo has covered yet. */
  callouts: CalloutLabel[];
  throws: ExplorerThrow[];
  csrf: string;
  initial: {
    throwId: string | null;
    lineupId: string | null;
    kind: string | null;
    side: string | null;
    level: string | null;
  };
}) {
  const [throws, setThrows] = useState(initialThrows);
  const [kind, setKind] = useState<UtilKind | null>(
    KINDS.includes(initial.kind as UtilKind) ? (initial.kind as UtilKind) : null,
  );
  const [side, setSide] = useState<Side>(initial.side === "t" || initial.side === "ct" ? initial.side : "all");
  const [usedOnly, setUsedOnly] = useState(false);
  const [q, setQ] = useState("");
  const [showCallouts, setShowCallouts] = useState(true);
  const [throwId, setThrowId] = useState(initial.throwId);
  const [lineupId, setLineupId] = useState(initial.lineupId);

  const selectedThrow = throws.find((t) => t.id === throwId) ?? null;
  const [level, setLevel] = useState(
    selectedThrow?.level ?? (levels.includes(initial.level ?? "") ? initial.level! : levels[0]!),
  );

  // ---- filtering ---------------------------------------------------------

  const matches = useCallback(
    (t: ExplorerThrow, ignoreKind = false) => {
      if (!ignoreKind && kind && t.kind !== kind) return false;
      if (usedOnly && t.uses.length === 0) return false;
      // A throw nobody has worked out a lineup for yet still belongs to both sides.
      if (side !== "all" && t.lineups.length && !t.lineups.some((l) => sideMatches(l, side))) return false;
      const needle = q.trim().toLowerCase();
      if (needle) {
        const hay = [t.name, t.note, ...t.lineups.flatMap((l) => [l.fromCallout, l.name])]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    },
    [kind, side, usedOnly, q],
  );

  const visible = useMemo(() => throws.filter((t) => matches(t)), [throws, matches]);
  const counts = useMemo(() => {
    const c: Partial<Record<UtilKind, number>> = {};
    for (const t of throws) if (matches(t, true)) c[t.kind] = (c[t.kind] ?? 0) + 1;
    return c;
  }, [throws, matches]);
  const onRadar = visible.filter((t) => placed(t) && t.level === level);
  const unplaced = visible.filter((t) => !placed(t));
  const perLevel = (lid: string) => visible.filter((t) => placed(t) && t.level === lid).length;

  const shownLineups = selectedThrow ? selectedThrow.lineups.filter((l) => sideMatches(l, side)) : [];
  const selectedLineup = selectedThrow?.lineups.find((l) => l.id === lineupId) ?? null;

  // ---- selection -----------------------------------------------------------

  const selectThrow = useCallback(
    (t: ExplorerThrow | null) => {
      setThrowId(t?.id ?? null);
      // One way to throw it means there is nothing to choose between.
      const only = t && t.lineups.filter((l) => sideMatches(l, side));
      setLineupId(only && only.length === 1 ? only[0]!.id : null);
      if (t && placed(t)) setLevel(t.level);
    },
    [side],
  );

  // The URL follows the state, replaced rather than pushed: clicking around the radar
  // should not make the back button walk through every spot you looked at.
  useEffect(() => {
    const p = new URLSearchParams();
    if (throwId) p.set("throw", throwId);
    if (lineupId) p.set("lineup", lineupId);
    if (kind) p.set("kind", kind);
    if (side !== "all") p.set("side", side);
    if (levels.length > 1 && level !== levels[0]) p.set("level", level);
    const qs = p.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }, [throwId, lineupId, kind, side, level, levels]);

  const [lightbox, setLightbox] = useState<{ shots: EditorLineup["shots"]; i: number } | null>(null);
  const [editing, setEditing] = useState(false);
  useEffect(() => setEditing(false), [lineupId]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (/^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement)?.tagName ?? "")) return;
      if (e.key !== "Escape" || lightbox) return;
      // Up one level at a time, the way you drilled in.
      if (editing) setEditing(false);
      else if (lineupId && shownLineups.length > 1) setLineupId(null);
      else selectThrow(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox, editing, lineupId, shownLineups.length, selectThrow]);

  // ---- writes --------------------------------------------------------------

  const replaceLineup = (tid: string, lineup: EditorLineup) =>
    setThrows((all) =>
      all.map((t) =>
        t.id === tid
          ? {
              ...t,
              lineups: t.lineups.some((l) => l.id === lineup.id)
                ? t.lineups.map((l) => (l.id === lineup.id ? lineup : l))
                : [...t.lineups, lineup],
            }
          : t,
      ),
    );

  async function saveLineup(t: ExplorerThrow, l: EditorLineup, patch: Record<string, unknown>) {
    const res = await fetch(`/api/lineups/${l.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", "x-csrf-token": csrf },
      body: JSON.stringify(patch),
    });
    const body = (await res.json().catch(() => ({}))) as { lineup?: EditorLineup; error?: string };
    if (!res.ok || !body.lineup) return body.error ?? `save failed (${res.status})`;
    replaceLineup(t.id, { ...body.lineup, shots: l.shots });
    return null;
  }

  async function addLineup(t: ExplorerThrow, patch: Record<string, unknown>) {
    const res = await fetch(`/api/throws/${t.id}/lineups`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-csrf-token": csrf },
      body: JSON.stringify(patch),
    });
    const body = (await res.json().catch(() => ({}))) as { lineup?: EditorLineup; error?: string };
    if (!res.ok || !body.lineup) return body.error ?? `could not add (${res.status})`;
    replaceLineup(t.id, body.lineup);
    setLineupId(body.lineup.id);
    setEditing(true);
    return null;
  }

  async function uploadShot(t: ExplorerThrow, l: EditorLineup, file: File, shotKind: ShotKind) {
    const { file: sending } = await convertScreenshot(file);
    const form = new FormData();
    form.set("file", sending);
    form.set("shotKind", shotKind);
    const res = await fetch(`/api/lineups/${l.id}/shots`, {
      method: "POST",
      headers: { "x-csrf-token": csrf },
      body: form,
    });
    if (!res.ok) return false;
    const { shot } = (await res.json()) as { shot: EditorLineup["shots"][number] };
    // Read back from state, not the closure: several shots can be uploading at once.
    setThrows((all) =>
      all.map((x) =>
        x.id === t.id
          ? { ...x, lineups: x.lineups.map((y) => (y.id === l.id ? { ...y, shots: [...y.shots, shot] } : y)) }
          : x,
      ),
    );
    return true;
  }

  // ---- render --------------------------------------------------------------

  return (
    <div className="ux">
      <aside className="ux-rail">
        <input
          className="ux-search"
          type="search"
          placeholder="Search callouts…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />

        <div className="ux-group">
          <span className="field-label">Grenade</span>
          <div className="ux-chips">
            <button className={`ux-chip ${kind === null ? "on" : ""}`} onClick={() => setKind(null)}>
              All <span className="ux-n">{Object.values(counts).reduce((a, b) => a + (b ?? 0), 0)}</span>
            </button>
            {KINDS.filter((k) => counts[k] || kind === k).map((k) => (
              <button
                key={k}
                className={`ux-chip ${kind === k ? "on" : ""}`}
                style={{ "--tool-colour": UTIL_META[k].colour } as React.CSSProperties}
                onClick={() => setKind(kind === k ? null : k)}
              >
                <span style={{ color: UTIL_META[k].colour }}>{UTIL_META[k].glyph}</span>
                {UTIL_META[k].label}
                <span className="ux-n">{counts[k] ?? 0}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="ux-group">
          <span className="field-label">Side</span>
          <div className="ux-seg">
            {(["all", "t", "ct"] as Side[]).map((s) => (
              <button key={s} className={side === s ? "on" : ""} onClick={() => setSide(s)}>
                {s === "all" ? "Any" : SIDE_LABEL[s]}
              </button>
            ))}
          </div>
        </div>

        <label className="ux-toggle">
          <input type="checkbox" checked={usedOnly} onChange={(e) => setUsedOnly(e.target.checked)} />
          Only ones our strats use
        </label>

        {callouts.length ? (
          <label className="ux-toggle">
            <input type="checkbox" checked={showCallouts} onChange={(e) => setShowCallouts(e.target.checked)} />
            Callouts
          </label>
        ) : null}

        {levels.length > 1 ? (
          <div className="ux-group">
            <span className="field-label">Level</span>
            <div className="ux-seg">
              {levels.map((lid) => (
                <button key={lid} className={level === lid ? "on" : ""} onClick={() => setLevel(lid)}>
                  {lid === "default" ? "Upper" : "Lower"} <span className="ux-n">{perLevel(lid)}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </aside>

      <section className="ux-map">
        <svg
          viewBox="0 0 1000 1000"
          className="radar ux-radar"
          onClick={(e) => e.target === e.currentTarget && selectThrow(null)}
        >
          <image
            href={`/api/radars/${map}/${level}`}
            x="0" y="0" width="1000" height="1000"
            onClick={() => selectThrow(null)}
          />

          {/* Names first, so every marker draws over them and stays clickable. */}
          {showCallouts
            ? callouts
                .filter((c) => c.level === level)
                .map((c) => {
                  const p = worldToPixel(map, c.x, c.y)!;
                  return (
                    <text key={c.name} x={p.fx * 1000} y={p.fy * 1000} className="ux-callout" textAnchor="middle">
                      {c.name}
                    </text>
                  );
                })
            : null}

          {/* The selected throw's origins sit under every landing marker, so a busy
              site stays clickable. */}
          {selectedThrow && placed(selectedThrow)
            ? (() => {
                const land = worldToPixel(map, selectedThrow.landX!, selectedThrow.landY!)!;
                const g = UTIL_META[selectedThrow.kind];
                return shownLineups
                  .filter((l) => l.throwX !== null && l.throwY !== null)
                  .map((l) => {
                    const n = selectedThrow.lineups.indexOf(l) + 1;
                    const from = worldToPixel(map, l.throwX!, l.throwY!)!;
                    const on = l.id === lineupId;
                    return (
                      <g
                        key={l.id}
                        className="ux-origin"
                        onClick={() => setLineupId(l.id)}
                      >
                        <title>{lineupTitle(l, n)}</title>
                        <line
                          x1={from.fx * 1000} y1={from.fy * 1000}
                          x2={land.fx * 1000} y2={land.fy * 1000}
                          stroke={g.colour} strokeWidth={on ? 4 : 2.5}
                          strokeDasharray="9 7" opacity={on ? 0.95 : 0.6}
                        />
                        <circle
                          cx={from.fx * 1000} cy={from.fy * 1000} r={on ? 17 : 14}
                          fill={on ? g.colour : "#0d1416"} stroke={g.colour} strokeWidth="3"
                        />
                        <text
                          x={from.fx * 1000} y={from.fy * 1000 + 6}
                          textAnchor="middle" fontSize="17" fontWeight="700"
                          fill={on ? "#0d1416" : g.colour}
                        >
                          {n}
                        </text>
                      </g>
                    );
                  });
              })()
            : null}

          {onRadar.map((t) => {
            const p = worldToPixel(map, t.landX!, t.landY!)!;
            const g = UTIL_META[t.kind];
            const on = t.id === throwId;
            const n = t.lineups.filter((l) => sideMatches(l, side)).length;
            return (
              <g
                key={t.id}
                className={`ux-land ${on ? "on" : ""} ${throwId && !on ? "dim" : ""}`}
                transform={`translate(${p.fx * 1000} ${p.fy * 1000})`}
                onClick={() => selectThrow(on ? null : t)}
              >
                <title>{t.name}</title>
                {on ? <circle r="30" fill="none" stroke={g.colour} strokeWidth="3" opacity="0.9" /> : null}
                <circle r="19" fill="#0d1416" fillOpacity="0.85" stroke={g.colour} strokeWidth="3" />
                <text y="7" textAnchor="middle" fontSize="20" fill={g.colour}>{g.glyph}</text>
                {n > 1 ? (
                  <g transform="translate(15 -15)">
                    <circle r="10" fill={g.colour} />
                    <text y="4.5" textAnchor="middle" fontSize="13" fontWeight="700" fill="#0d1416">{n}</text>
                  </g>
                ) : null}
                {on ? (
                  <text y="-38" textAnchor="middle" fontSize="22" fontWeight="600" className="ux-land-name">
                    {t.name}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
        {onRadar.length === 0 ? (
          <p className="muted ux-empty">
            {throws.length === 0
              ? "No utility on this map yet — place some while editing a strat, or import screenshots."
              : "Nothing on this level matches the filters."}
          </p>
        ) : null}
      </section>

      <aside className="ux-panel">
        {!selectedThrow ? (
          <Overview
            onRadar={onRadar}
            unplaced={unplaced}
            side={side}
            onPick={selectThrow}
          />
        ) : !selectedLineup ? (
          <ThrowPanel
            t={selectedThrow}
            lineups={shownLineups}
            onBack={() => selectThrow(null)}
            onPick={(l) => setLineupId(l.id)}
            onAdd={(patch) => addLineup(selectedThrow, patch)}
          />
        ) : (
          <LineupPanel
            t={selectedThrow}
            l={selectedLineup}
            n={selectedThrow.lineups.indexOf(selectedLineup) + 1}
            siblings={shownLineups.length}
            editing={editing}
            onEdit={setEditing}
            onBack={() => (shownLineups.length > 1 ? setLineupId(null) : selectThrow(null))}
            onZoom={(i) => setLightbox({ shots: selectedLineup.shots, i })}
            onSave={(patch) => saveLineup(selectedThrow, selectedLineup, patch)}
            onUpload={(f, k) => uploadShot(selectedThrow, selectedLineup, f, k)}
          />
        )}
      </aside>

      {lightbox ? <Lightbox {...lightbox} onClose={() => setLightbox(null)} /> : null}
    </div>
  );
}

// ---- panels ----------------------------------------------------------------

function Overview({
  onRadar,
  unplaced,
  side,
  onPick,
}: {
  onRadar: ExplorerThrow[];
  unplaced: ExplorerThrow[];
  side: Side;
  onPick: (t: ExplorerThrow) => void;
}) {
  const row = (t: ExplorerThrow) => {
    const g = UTIL_META[t.kind];
    const n = t.lineups.filter((l) => sideMatches(l, side)).length;
    return (
      <li key={t.id}>
        <button className="ux-row" onClick={() => onPick(t)}>
          <span style={{ color: g.colour }}>{g.glyph}</span>
          <span className="ux-row-name">{t.name}</span>
          <span className="ux-n">{n}</span>
        </button>
      </li>
    );
  };

  return (
    <>
      <p className="muted ux-hint">
        Pick where you want it to land — on the radar or here — then how to throw it.
      </p>
      <ul className="ux-list">{onRadar.map(row)}</ul>
      {unplaced.length ? (
        <>
          <h3 className="ux-sub">Not on the radar yet · {unplaced.length}</h3>
          <p className="hint">
            Imported from screenshots, so nobody has said where they land. Place them from
            a strat&apos;s editor.
          </p>
          <ul className="ux-list">{unplaced.map(row)}</ul>
        </>
      ) : null}
    </>
  );
}

function ThrowPanel({
  t,
  lineups,
  onBack,
  onPick,
  onAdd,
}: {
  t: ExplorerThrow;
  lineups: EditorLineup[];
  onBack: () => void;
  onPick: (l: EditorLineup) => void;
  onAdd: (patch: Record<string, unknown>) => Promise<string | null>;
}) {
  const g = UTIL_META[t.kind];
  const [adding, setAdding] = useState(false);
  const [getpos, setGetpos] = useState("");
  const [from, setFrom] = useState("");
  const [error, setError] = useState<string | null>(null);
  const gp = getpos.trim() ? parseGetpos(getpos) : null;

  return (
    <>
      <button className="ux-back" onClick={onBack}>← all utility</button>
      <h2 className="ux-title">
        <span style={{ color: g.colour }}>{g.glyph}</span> {t.name}
      </h2>
      <p className="ux-meta">
        {g.label}
        {t.level !== "default" ? " · lower" : ""}
        {!placed(t) ? " · not placed" : ""}
      </p>
      {t.note ? <p className="ux-note">{t.note}</p> : null}

      <h3 className="ux-sub">Thrown from · {lineups.length}</h3>
      <ul className="ux-list">
        {lineups.map((l) => {
          const n = t.lineups.indexOf(l) + 1;
          const thumb = l.shots.find((s) => s.shotKind === "stand") ?? l.shots[0];
          return (
            <li key={l.id}>
              <button className="ux-lineup" onClick={() => onPick(l)}>
                <span className="lineup-n">{n}</span>
                <span className="ux-lineup-body">
                  <span className="ux-row-name">{lineupTitle(l, n)}</span>
                  <span className="ux-meta">
                    {l.side ? `${SIDE_LABEL[l.side]} · ` : ""}
                    {describeThrow(l)} · {MOVEMENT_LABEL[l.movement].toLowerCase()}
                    {l.throwX === null ? " · no spot" : ""}
                  </span>
                </span>
                {thumb ? <img className="ux-thumb" src={`/api/shots/${thumb.id}`} alt="" /> : null}
              </button>
            </li>
          );
        })}
        {lineups.length === 0 ? (
          <li className="muted">
            {t.lineups.length ? "None for this side." : "Nobody has worked out how to throw it yet."}
          </li>
        ) : null}
      </ul>

      {adding ? (
        <div className="ux-form">
          <label>
            <span>Thrown from</span>
            <input value={from} placeholder="from the getpos, if left blank" onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label>
            <span>getpos</span>
            <input
              className="getpos-input"
              value={getpos}
              placeholder="setpos … ;setang …"
              onChange={(e) => setGetpos(e.target.value)}
            />
          </label>
          <p className="hint">
            Stand on the spot, aim at the lineup, run <code>getpos</code> in the console
            and paste the line. It is the exact spot and angle — and fixed once saved.
          </p>
          {error ? <p className="hint bad">{error}</p> : null}
          <div className="throw-buttons">
            <button
              className="btn btn-primary"
              disabled={!gp}
              onClick={async () => {
                // Left blank, the server names it from the callout the getpos is in.
                setError(await onAdd({ getpos, ...(from.trim() ? { fromCallout: from } : {}) }));
              }}
            >
              Add lineup
            </button>
            <button className="btn" onClick={() => setAdding(false)}>Cancel</button>
          </div>
        </div>
      ) : (
        <button className="btn ux-add" onClick={() => setAdding(true)}>+ Another way to throw it</button>
      )}

      <UsedIn uses={t.uses} />
    </>
  );
}

function LineupPanel({
  t,
  l,
  n,
  siblings,
  editing,
  onEdit,
  onBack,
  onZoom,
  onSave,
  onUpload,
}: {
  t: ExplorerThrow;
  l: EditorLineup;
  n: number;
  siblings: number;
  editing: boolean;
  onEdit: (v: boolean) => void;
  onBack: () => void;
  onZoom: (i: number) => void;
  onSave: (patch: Record<string, unknown>) => Promise<string | null>;
  onUpload: (file: File, kind: ShotKind) => Promise<boolean>;
}) {
  const g = UTIL_META[t.kind];
  const shots = [...l.shots].sort(
    (a, b) => SHOT_ORDER.indexOf(a.shotKind) - SHOT_ORDER.indexOf(b.shotKind) || a.idx - b.idx,
  );
  const [shotIdx, setShotIdx] = useState(0);
  useEffect(() => setShotIdx(0), [l.id]);
  const shot = shots[Math.min(shotIdx, shots.length - 1)];
  const steps = stepsOf(l.steps);
  const setpos = setposCommand(l);

  return (
    <>
      <button className="ux-back" onClick={onBack}>
        ← {siblings > 1 ? `every way to ${t.name}` : "all utility"}
      </button>
      <h2 className="ux-title">
        <span style={{ color: g.colour }}>{g.glyph}</span> {t.name}
      </h2>
      <p className="ux-from">
        from <strong>{lineupTitle(l, n)}</strong>
      </p>

      <div className="ux-tags">
        {l.side ? <span className={`ux-tag side-${l.side}`}>{SIDE_LABEL[l.side]}</span> : null}
        <span className="ux-tag">{describeThrow(l)}</span>
        <span className="ux-tag">{MOVEMENT_LABEL[l.movement]}</span>
        {l.precision ? <span className="ux-tag">{PRECISION_LABEL[l.precision]}</span> : null}
      </div>

      {shots.length ? (
        <div className="ux-shots">
          <div className="ux-shot-tabs">
            {shots.map((s, i) => (
              <button key={s.id} className={s === shot ? "on" : ""} onClick={() => setShotIdx(i)}>
                {SHOT_LABEL[s.shotKind]}
              </button>
            ))}
          </div>
          <button className="ux-shot" onClick={() => onZoom(shots.indexOf(shot!))}>
            <img src={`/api/shots/${shot!.id}`} alt={`${t.name} ${SHOT_LABEL[shot!.shotKind]}`} />
          </button>
        </div>
      ) : (
        <p className="unplaced">No screenshots yet.</p>
      )}

      {steps.length ? (
        <ol className="ux-steps">
          {steps.map((s, i) => <li key={i}>{s}</li>)}
        </ol>
      ) : null}
      {l.note ? <p className="ux-note"><Linkified text={l.note} /></p> : null}

      {setpos ? <CopySetpos command={setpos} /> : null}

      {editing ? (
        <LineupForm l={l} onSave={onSave} onUpload={onUpload} onDone={() => onEdit(false)} />
      ) : (
        <button className="btn ux-add" onClick={() => onEdit(true)}>Edit lineup</button>
      )}

      <UsedIn uses={t.uses} />
    </>
  );
}

/** Notes often carry a source ("csnades.gg/inferno/smokes/…"); make it a link. */
function Linkified({ text }: { text: string }) {
  const parts = text.split(/((?:https?:\/\/)?[a-z0-9-]+(?:\.[a-z0-9-]+)+\/\S+)/i);
  return (
    <>
      {parts.map((p, i) =>
        i % 2 ? (
          <a key={i} href={p.startsWith("http") ? p : `https://${p}`} target="_blank" rel="noreferrer">
            {p}
          </a>
        ) : (
          p
        ),
      )}
    </>
  );
}

function CopySetpos({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="ux-setpos">
      <button
        className="btn"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(command);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {
            // Clipboard is refused outside a secure context; the text is selectable.
          }
        }}
      >
        {copied ? "Copied" : "Copy setpos"}
      </button>
      <code title="needs sv_cheats 1">{command}</code>
    </div>
  );
}

function UsedIn({ uses }: { uses: ExplorerThrow["uses"] }) {
  if (!uses.length) return <p className="util-used">Not used in any strat yet.</p>;
  return (
    <div className="util-used">
      Used in{" "}
      {uses.map((u, i) => (
        <span key={u.stratId}>
          {i ? ", " : ""}
          <Link href={`/strat/${u.stratId}`}>{u.name}</Link>
          <span className="muted"> ({u.side.toUpperCase()})</span>
        </span>
      ))}
    </div>
  );
}

function LineupForm({
  l,
  onSave,
  onUpload,
  onDone,
}: {
  l: EditorLineup;
  onSave: (patch: Record<string, unknown>) => Promise<string | null>;
  onUpload: (file: File, kind: ShotKind) => Promise<boolean>;
  onDone: () => void;
}) {
  const [form, setForm] = useState({
    fromCallout: l.fromCallout ?? "",
    side: l.side ?? "",
    click: l.click,
    jump: l.jump,
    movement: l.movement,
    precision: l.precision ?? "",
    steps: l.steps ?? "",
    note: l.note ?? "",
    getpos: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<ShotKind | null>(null);
  const exact = l.pitch !== null && l.yaw !== null;
  const gpBad = form.getpos.trim() !== "" && !parseGetpos(form.getpos);
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  async function upload(kind: ShotKind, files: FileList | File[] | null) {
    const file = files && Array.from(files).find((f) => f.type.startsWith("image/"));
    if (!file) return;
    setUploading(kind);
    try {
      if (!(await onUpload(file, kind))) setError("upload failed");
    } finally {
      setUploading(null);
    }
  }

  return (
    <div
      className="ux-form"
      onPaste={(e) => {
        // Paste fills the first empty slot, the same order the editor uses.
        const next = SHOT_ORDER.find((k) => !l.shots.some((s) => s.shotKind === k)) ?? "result";
        const files = Array.from(e.clipboardData.files);
        if (files.length) void upload(next, files);
      }}
    >
      <label>
        <span>Thrown from</span>
        <input value={form.fromCallout} placeholder="T Roof" onChange={(e) => set({ fromCallout: e.target.value })} />
      </label>

      <div className="ux-form-row">
        <label>
          <span>Side</span>
          <select value={form.side} onChange={(e) => set({ side: e.target.value })}>
            <option value="">Either</option>
            <option value="t">T</option>
            <option value="ct">CT</option>
          </select>
        </label>
        <label>
          <span>Precision</span>
          <select value={form.precision} onChange={(e) => set({ precision: e.target.value })}>
            <option value="">—</option>
            {PRECISIONS.map((p) => <option key={p} value={p}>{PRECISION_LABEL[p]}</option>)}
          </select>
        </label>
      </div>

      <div className="ux-form-row">
        <label>
          <span>Click</span>
          <select value={form.click} onChange={(e) => set({ click: e.target.value as typeof form.click })}>
            {CLICKS.map((c) => <option key={c} value={c}>{CLICK_LABEL[c]}</option>)}
          </select>
        </label>
        <label>
          <span>Movement</span>
          <select value={form.movement} onChange={(e) => set({ movement: e.target.value as typeof form.movement })}>
            {MOVEMENTS.map((m) => <option key={m} value={m}>{MOVEMENT_LABEL[m]}</option>)}
          </select>
        </label>
      </div>
      <label className="check">
        <input type="checkbox" checked={form.jump} onChange={(e) => set({ jump: e.target.checked })} />
        jump throw
      </label>

      <label>
        <span>Steps — one per line</span>
        <textarea
          rows={4}
          value={form.steps}
          placeholder={"Stand in the corner of the pipe\nAim at the left edge of the antenna\nJump + left click"}
          onChange={(e) => set({ steps: e.target.value })}
        />
      </label>
      <label>
        <span>Note</span>
        <textarea rows={2} value={form.note} onChange={(e) => set({ note: e.target.value })} />
      </label>

      {!exact ? (
        <label>
          <span>{l.throwX === null ? "getpos" : "getpos — makes the spot exact"}</span>
          <input
            className="getpos-input"
            value={form.getpos}
            placeholder="setpos … ;setang …"
            onChange={(e) => set({ getpos: e.target.value })}
          />
        </label>
      ) : null}
      {gpBad ? <p className="hint bad">Not getpos output — copy the whole setpos … ;setang … line.</p> : null}

      <span className="field-label">Screenshots — drop, paste or choose</span>
      <div className="shot-slots">
        {SHOT_ORDER.map((k) => {
          const have = l.shots.filter((s) => s.shotKind === k).length;
          return (
            <div
              key={k}
              className={`shot-slot ${have ? "filled" : ""}`}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); void upload(k, e.dataTransfer.files); }}
            >
              <span className="slot-name">
                {SHOT_LABEL[k]}
                {k === "result" ? <em> optional</em> : null}
              </span>
              <span className="slot-file">{uploading === k ? "uploading…" : have ? `${have} ✓` : ""}</span>
              <label className="pick">
                {have ? "add" : "choose"}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => { void upload(k, e.target.files); e.target.value = ""; }}
                />
              </label>
            </div>
          );
        })}
      </div>

      {error ? <p className="hint bad">{error}</p> : null}
      <div className="throw-buttons">
        <button
          className="btn btn-primary"
          disabled={saving || gpBad}
          onClick={async () => {
            setSaving(true);
            const err = await onSave({
              // Blank plus a getpos means "work it out"; blank alone means clear it.
              ...(form.fromCallout.trim() || !form.getpos.trim() ? { fromCallout: form.fromCallout } : {}),
              side: form.side || null,
              click: form.click,
              jump: form.jump,
              movement: form.movement,
              precision: form.precision || null,
              steps: form.steps,
              note: form.note,
              ...(form.getpos.trim() ? { getpos: form.getpos } : {}),
            });
            setSaving(false);
            setError(err);
            if (!err) onDone();
          }}
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button className="btn" onClick={onDone}>Cancel</button>
      </div>
      <p className="hint">Shared: this changes the lineup in every strat that uses it.</p>
    </div>
  );
}

function Lightbox({
  shots,
  i: start,
  onClose,
}: {
  shots: EditorLineup["shots"];
  i: number;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [i, setI] = useState(start);
  const sorted = [...shots].sort((a, b) => SHOT_ORDER.indexOf(a.shotKind) - SHOT_ORDER.indexOf(b.shotKind));
  const shot = sorted[i];

  useEffect(() => {
    ref.current?.showModal();
  }, []);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight") setI((x) => (x + 1) % sorted.length);
      if (e.key === "ArrowLeft") setI((x) => (x - 1 + sorted.length) % sorted.length);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sorted.length]);

  if (!shot) return null;
  return (
    // Escape closes a modal dialog natively; onClose keeps React's state in step.
    <dialog ref={ref} className="ux-lightbox" onClose={onClose} onClick={onClose}>
      <img src={`/api/shots/${shot.id}`} alt={SHOT_LABEL[shot.shotKind]} />
      <p>
        {SHOT_LABEL[shot.shotKind]} · {i + 1}/{sorted.length}
        {sorted.length > 1 ? " · ← → to flip, tap to close" : " · tap to close"}
      </p>
    </dialog>
  );
}
