"use client";

/**
 * The creator.
 *
 * Most team playbooks die because adding the *second* strat is too much work, so every
 * choice here trades fidelity for speed of capture: one page rather than a wizard, a
 * palette that stays armed so three smokes is three clicks, and phases that carry
 * player positions forward because players do not teleport between them.
 *
 * Two kinds of state live here and they are written differently on purpose:
 *
 *   - The strat — which throws are used, by whom, in which phase — autosaves on a
 *     debounce. It belongs to this strat alone.
 *   - A throw — geometry, technique, name, screenshots — is shared across every strat
 *     that references it, so it is written immediately through its own endpoint.
 *     Changing something shared should feel like a separate act, not a side effect of
 *     tweaking one exec.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DEFAULT_LEVEL, fractionToWorld, radarFor, worldToPixel } from "@/lib/radar";

export type UtilKind = "smoke" | "flash" | "he" | "molotov" | "decoy";
export type Technique = "stand" | "jump" | "run_jump" | "walk" | "run";
export type ActionKind = "hold" | "entry" | "trade" | "lurk" | "drop" | "throw" | "support";
export type ShotKind = "stand" | "crosshair" | "result";

export interface EditorPlayer {
  steamid64: string;
  nickname: string;
}

export interface EditorLineup {
  id: string;
  shotKind: ShotKind;
  idx: number;
}

/** The shared thing: one throw on one map, reused by any number of strats. */
export interface EditorThrow {
  id: string;
  name: string;
  kind: UtilKind;
  landX: number;
  landY: number;
  landZ: number | null;
  throwX: number | null;
  throwY: number | null;
  throwZ: number | null;
  level: string;
  technique: Technique;
  note: string | null;
  lineups: EditorLineup[];
  usedBy?: number;
}

/** The per-strat thing: this throw, in this phase, thrown by this player. */
export interface EditorUse {
  id: string;
  throwId: string;
  throwerSteamid64: string | null;
  note: string | null;
}

export interface EditorAssignment {
  id: string;
  playerSteamid64: string | null;
  x: number | null;
  y: number | null;
  z: number | null;
  level: string;
  action: ActionKind;
  note: string | null;
}

export interface EditorPhase {
  id: string;
  name: string;
  clockOffsetS: number;
  note: string | null;
  assignments: EditorAssignment[];
  utility: EditorUse[];
}

export interface EditorState {
  version: number;
  name: string;
  kind: string;
  target: string | null;
  status: string;
  description: string | null;
  phases: EditorPhase[];
}

const UTIL_META: Record<UtilKind, { label: string; glyph: string; colour: string; key: string }> = {
  smoke: { label: "Smoke", glyph: "●", colour: "#cfd8dc", key: "1" },
  flash: { label: "Flash", glyph: "◎", colour: "#ffd257", key: "2" },
  he: { label: "HE", glyph: "✳", colour: "#e57373", key: "3" },
  molotov: { label: "Molotov", glyph: "▲", colour: "#ff8a4c", key: "4" },
  decoy: { label: "Decoy", glyph: "◌", colour: "#90a4ae", key: "5" },
};

const TECHNIQUES: Technique[] = ["stand", "jump", "run_jump", "walk", "run"];
const ACTIONS: ActionKind[] = ["hold", "entry", "trade", "lurk", "drop", "throw", "support"];
const SHOT_KINDS: ShotKind[] = ["stand", "crosshair", "result"];

type Tool = UtilKind | "player" | null;
type Selection = { kind: "use" | "assignment"; id: string } | null;

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
/** CS2 rounds run 1:55, so an offset reads more naturally as the clock a caller says. */
const onClock = (s: number) => mmss(Math.max(0, 115 - s));

export function StratEditor({
  stratId,
  map,
  side,
  initial,
  library: initialLibrary,
  roster,
  csrf,
}: {
  stratId: string;
  map: string;
  side: string;
  initial: EditorState;
  library: EditorThrow[];
  roster: EditorPlayer[];
  csrf: string;
}) {
  const router = useRouter();
  const cfg = radarFor(map)!;

  const [state, setState] = useState<EditorState>(initial);
  const [library, setLibrary] = useState<EditorThrow[]>(initialLibrary);
  const [phaseIdx, setPhaseIdx] = useState(0);
  const [level, setLevel] = useState<string>(cfg.levels[0]?.id ?? DEFAULT_LEVEL);
  const [tool, setTool] = useState<Tool>(null);
  const [selected, setSelected] = useState<Selection>(null);
  const [placingThrow, setPlacingThrow] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const [saving, setSaving] = useState<"idle" | "saving" | "saved" | "conflict" | "error">("idle");
  const [busy, setBusy] = useState<string | null>(null);

  const svgRef = useRef<SVGSVGElement>(null);
  const dirty = useRef(false);

  const phase = state.phases[phaseIdx];
  const throwsById = useMemo(() => new Map(library.map((t) => [t.id, t])), [library]);
  const nameOf = useMemo(() => {
    const m = new Map(roster.map((p) => [p.steamid64, p.nickname]));
    return (id: string | null) => (id ? (m.get(id) ?? "?") : "unassigned");
  }, [roster]);

  const headers = useMemo(
    () => ({ "content-type": "application/json", "x-csrf-token": csrf }),
    [csrf],
  );

  // ---- strat autosave ----------------------------------------------------

  const save = useCallback(
    async (next: EditorState) => {
      setSaving("saving");
      try {
        const res = await fetch(`/api/strats/${stratId}`, {
          method: "PATCH",
          headers,
          body: JSON.stringify(next),
        });
        if (res.status === 409) {
          setSaving("conflict");
          return;
        }
        if (!res.ok) return setSaving("error");
        const json = (await res.json()) as { version: number };
        setState((s) => ({ ...s, version: json.version }));
        dirty.current = false;
        setSaving("saved");
      } catch {
        setSaving("error");
      }
    },
    [stratId, headers],
  );

  useEffect(() => {
    if (!dirty.current) return;
    const t = setTimeout(() => void save(state), 1000);
    return () => clearTimeout(t);
  }, [state, save]);

  const mutate = useCallback((fn: (s: EditorState) => EditorState) => {
    dirty.current = true;
    setState(fn);
  }, []);

  const patchPhase = useCallback(
    (fn: (p: EditorPhase) => EditorPhase) =>
      mutate((s) => ({ ...s, phases: s.phases.map((p, i) => (i === phaseIdx ? fn(p) : p)) })),
    [mutate, phaseIdx],
  );

  // ---- throws: written immediately, because they are shared ---------------

  const patchThrow = useCallback(
    async (id: string, patch: Partial<EditorThrow>) => {
      setLibrary((lib) => lib.map((t) => (t.id === id ? { ...t, ...patch } : t)));
      setBusy(id);
      try {
        const res = await fetch(`/api/throws/${id}`, {
          method: "PATCH",
          headers,
          body: JSON.stringify(patch),
        });
        if (!res.ok) {
          // Put the server's version back rather than leaving the screen showing an
          // edit that did not land.
          const fresh = await fetch(`/api/throws?map=${map}`).then((r) => r.json());
          setLibrary(fresh.throws as EditorThrow[]);
        }
      } finally {
        setBusy(null);
      }
    },
    [headers, map],
  );

  async function createThrowAt(kind: UtilKind, x: number, y: number) {
    const res = await fetch("/api/throws", {
      method: "POST",
      headers,
      body: JSON.stringify({ map, kind, landX: x, landY: y, level }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { throw: EditorThrow };
    const created = { ...json.throw, lineups: json.throw.lineups ?? [] };
    setLibrary((lib) => [...lib, created]);
    return created;
  }

  function useThrow(throwId: string) {
    const id = crypto.randomUUID();
    patchPhase((p) => ({
      ...p,
      utility: [...p.utility, { id, throwId, throwerSteamid64: null, note: null }],
    }));
    setSelected({ kind: "use", id });
    return id;
  }

  // ---- placing -----------------------------------------------------------

  async function onRadarClick(e: React.MouseEvent<SVGSVGElement>) {
    if (!phase) return;
    const rect = svgRef.current!.getBoundingClientRect();
    const world = fractionToWorld(
      map,
      (e.clientX - rect.left) / rect.width,
      (e.clientY - rect.top) / rect.height,
    );
    if (!world) return;

    if (placingThrow && selected?.kind === "use") {
      const use = phase.utility.find((u) => u.id === selected.id);
      if (use) void patchThrow(use.throwId, { throwX: world.x, throwY: world.y, throwZ: null });
      setPlacingThrow(false);
      return;
    }

    if (!tool) return;

    if (tool === "player") {
      const id = crypto.randomUUID();
      patchPhase((p) => ({
        ...p,
        assignments: [
          ...p.assignments,
          { id, playerSteamid64: null, x: world.x, y: world.y, z: null, level, action: "hold", note: null },
        ],
      }));
      setSelected({ kind: "assignment", id });
      return;
    }

    // Placing utility creates a throw in the map's library and references it. The name
    // is auto-assigned so nothing stops to ask before the marker lands.
    const created = await createThrowAt(tool, world.x, world.y);
    if (created) useThrow(created.id);
  }

  // ---- keyboard ----------------------------------------------------------

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement;
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;

      if (e.key === "Escape") {
        setPlacingThrow(false);
        setShowLibrary(false);
        return setTool(null);
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        if (!selected) return;
        e.preventDefault();
        patchPhase((p) =>
          selected.kind === "use"
            ? { ...p, utility: p.utility.filter((u) => u.id !== selected.id) }
            : { ...p, assignments: p.assignments.filter((a) => a.id !== selected.id) },
        );
        setSelected(null);
        return;
      }
      const hit = (Object.keys(UTIL_META) as UtilKind[]).find((k) => UTIL_META[k].key === e.key);
      if (hit) setTool(hit);
      if (e.key.toLowerCase() === "p") setTool("player");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, patchPhase]);

  // ---- lineups -----------------------------------------------------------

  const uploadLineup = useCallback(
    async (throwId: string, file: File, shotKind: ShotKind) => {
      setBusy(throwId);
      try {
        const form = new FormData();
        form.set("file", file);
        form.set("shotKind", shotKind);
        const res = await fetch(`/api/throws/${throwId}/lineups`, {
          method: "POST",
          headers: { "x-csrf-token": csrf },
          body: form,
        });
        if (!res.ok) return;
        const json = (await res.json()) as { lineup: EditorLineup };
        setLibrary((lib) =>
          lib.map((t) => (t.id === throwId ? { ...t, lineups: [...t.lineups, json.lineup] } : t)),
        );
      } finally {
        setBusy(null);
      }
    },
    [csrf],
  );

  const deleteLineup = useCallback(
    async (throwId: string, lineupId: string) => {
      await fetch(`/api/lineups/${lineupId}`, { method: "DELETE", headers });
      setLibrary((lib) =>
        lib.map((t) =>
          t.id === throwId ? { ...t, lineups: t.lineups.filter((l) => l.id !== lineupId) } : t,
        ),
      );
    },
    [headers],
  );

  // ---- selection helpers -------------------------------------------------

  const selectedUse =
    selected?.kind === "use" ? phase?.utility.find((u) => u.id === selected.id) : undefined;
  const selectedThrow = selectedUse ? throwsById.get(selectedUse.throwId) : undefined;
  const selectedAssignment =
    selected?.kind === "assignment"
      ? phase?.assignments.find((a) => a.id === selected.id)
      : undefined;

  const updateUse = (id: string, patch: Partial<EditorUse>) =>
    patchPhase((p) => ({ ...p, utility: p.utility.map((u) => (u.id === id ? { ...u, ...patch } : u)) }));
  const updateAssignment = (id: string, patch: Partial<EditorAssignment>) =>
    patchPhase((p) => ({
      ...p,
      assignments: p.assignments.map((a) => (a.id === id ? { ...a, ...patch } : a)),
    }));

  function addPhase() {
    const last = state.phases[state.phases.length - 1];
    mutate((s) => ({
      ...s,
      phases: [
        ...s.phases,
        {
          id: crypto.randomUUID(),
          name: `Phase ${s.phases.length + 1}`,
          clockOffsetS: Math.min(115, (last?.clockOffsetS ?? 0) + 10),
          note: null,
          // Player positions carry forward; utility does not. Players do not teleport
          // between phases, and a grenade is thrown once.
          assignments: (last?.assignments ?? []).map((a) => ({ ...a, id: crypto.randomUUID() })),
          utility: [],
        },
      ],
    }));
    setPhaseIdx(state.phases.length);
  }

  function removePhase(idx: number) {
    if (state.phases.length <= 1) return;
    mutate((s) => ({ ...s, phases: s.phases.filter((_, i) => i !== idx) }));
    setPhaseIdx((i) => Math.max(0, i - (idx <= i ? 1 : 0)));
  }

  const usesOnLevel = (phase?.utility ?? []).filter(
    (u) => throwsById.get(u.throwId)?.level === level,
  );
  const alreadyUsed = new Set((phase?.utility ?? []).map((u) => u.throwId));

  return (
    <div className="editor">
      {saving === "conflict" ? (
        <div className="error">
          Someone else saved this strat while you were editing. Reload to pick up their
          version — saving now would discard it.{" "}
          <button className="btn" onClick={() => router.refresh()}>Reload</button>
        </div>
      ) : null}

      <div className="editor-head card">
        <label className="grow">
          <span>Name</span>
          <input value={state.name} onChange={(e) => mutate((s) => ({ ...s, name: e.target.value }))} />
        </label>
        <label>
          <span>Target</span>
          <input
            value={state.target ?? ""}
            placeholder="A / B / mid"
            onChange={(e) => mutate((s) => ({ ...s, target: e.target.value || null }))}
          />
        </label>
        <label>
          <span>Status</span>
          <select value={state.status} onChange={(e) => mutate((s) => ({ ...s, status: e.target.value }))}>
            <option value="experimental">Experimental</option>
            <option value="drilled">Drilled</option>
            <option value="retired">Retired</option>
          </select>
        </label>
        <div className="save-state" data-state={saving}>
          {saving === "saving" ? "saving…" : saving === "saved" ? "saved" : saving === "error" ? "save failed" : ""}
        </div>
      </div>

      <div className="editor-body">
        <aside className="palette">
          <h3>Place</h3>
          {(Object.keys(UTIL_META) as UtilKind[]).map((k) => (
            <button
              key={k}
              className={`tool ${tool === k ? "armed" : ""}`}
              onClick={() => setTool(tool === k ? null : k)}
              style={{ ["--tool-colour" as string]: UTIL_META[k].colour }}
            >
              <span className="tool-key">{UTIL_META[k].key}</span>
              <span className="tool-glyph">{UTIL_META[k].glyph}</span>
              <span>{UTIL_META[k].label}</span>
            </button>
          ))}
          <button
            className={`tool ${tool === "player" ? "armed" : ""}`}
            onClick={() => setTool(tool === "player" ? null : "player")}
            style={{ ["--tool-colour" as string]: "#17a398" }}
          >
            <span className="tool-key">P</span>
            <span className="tool-glyph">▲</span>
            <span>Player</span>
          </button>

          <p className="hint">
            {placingThrow
              ? "Click where it is thrown from."
              : tool
                ? "Armed — click the radar. It stays armed; Esc to stop."
                : "Pick a tool, then click the radar."}
          </p>

          <h3>Library</h3>
          <button className="btn" style={{ width: "100%" }} onClick={() => setShowLibrary((v) => !v)}>
            {showLibrary ? "Hide" : `Add existing (${library.length})`}
          </button>
          {showLibrary ? (
            <ul className="lib-list">
              {library.length === 0 ? <li className="hint">Nothing on this map yet.</li> : null}
              {library.map((t) => (
                <li key={t.id}>
                  <button
                    className="lib-item"
                    disabled={alreadyUsed.has(t.id)}
                    onClick={() => { useThrow(t.id); setShowLibrary(false); }}
                  >
                    <span style={{ color: UTIL_META[t.kind].colour }}>{UTIL_META[t.kind].glyph}</span>
                    <span className="lib-name">{t.name}</span>
                    {t.lineups.length ? <span className="lib-shots">{t.lineups.length}📷</span> : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          {cfg.levels.length > 1 ? (
            <>
              <h3>Level</h3>
              <div className="levels">
                {cfg.levels.map((l) => (
                  <button
                    key={l.id}
                    className={`btn ${level === l.id ? "btn-primary" : ""}`}
                    onClick={() => setLevel(l.id)}
                  >
                    {l.id}
                  </button>
                ))}
              </div>
            </>
          ) : null}
        </aside>

        <div className="radar-wrap">
          <svg
            ref={svgRef}
            viewBox="0 0 1000 1000"
            className={`radar ${tool || placingThrow ? "armed" : ""}`}
            onClick={(e) => void onRadarClick(e)}
          >
            <image href={`/api/radars/${map}/${level}`} x="0" y="0" width="1000" height="1000" />

            {usesOnLevel.map((use) => {
              const t = throwsById.get(use.throwId)!;
              const land = worldToPixel(map, t.landX, t.landY)!;
              const from =
                t.throwX !== null && t.throwY !== null ? worldToPixel(map, t.throwX, t.throwY) : null;
              const meta = UTIL_META[t.kind];
              const isSel = selected?.kind === "use" && selected.id === use.id;
              return (
                <g key={use.id} onClick={(e) => { e.stopPropagation(); setSelected({ kind: "use", id: use.id }); }}>
                  {from ? (
                    <>
                      <line
                        x1={from.fx * 1000}
                        y1={from.fy * 1000}
                        x2={land.fx * 1000}
                        y2={land.fy * 1000}
                        stroke={meta.colour}
                        strokeWidth="2"
                        strokeDasharray="6 5"
                        opacity="0.7"
                      />
                      <circle
                        cx={from.fx * 1000}
                        cy={from.fy * 1000}
                        r="7"
                        fill="none"
                        stroke={meta.colour}
                        strokeWidth="2.5"
                      />
                    </>
                  ) : null}
                  <circle
                    cx={land.fx * 1000}
                    cy={land.fy * 1000}
                    r="14"
                    fill={meta.colour}
                    fillOpacity="0.85"
                    stroke={isSel ? "#fff" : "#00000088"}
                    strokeWidth={isSel ? 3 : 1.5}
                  />
                  <text x={land.fx * 1000} y={land.fy * 1000 + 5} textAnchor="middle" fontSize="15" fill="#0d1416">
                    {meta.glyph}
                  </text>
                </g>
              );
            })}

            {(phase?.assignments ?? [])
              .filter((a) => a.level === level && a.x !== null && a.y !== null)
              .map((a) => {
                const p = worldToPixel(map, a.x!, a.y!)!;
                const isSel = selected?.kind === "assignment" && selected.id === a.id;
                return (
                  <g key={a.id} onClick={(e) => { e.stopPropagation(); setSelected({ kind: "assignment", id: a.id }); }}>
                    <circle
                      cx={p.fx * 1000}
                      cy={p.fy * 1000}
                      r="13"
                      fill="#17a398"
                      stroke={isSel ? "#fff" : "#00000088"}
                      strokeWidth={isSel ? 3 : 1.5}
                    />
                    <text x={p.fx * 1000} y={p.fy * 1000 + 26} textAnchor="middle" fontSize="20" fill="#e6ecea">
                      {nameOf(a.playerSteamid64)}
                    </text>
                  </g>
                );
              })}
          </svg>
        </div>

        <aside className="inspector">
          {selectedUse && selectedThrow ? (
            <ThrowInspector
              use={selectedUse}
              item={selectedThrow}
              roster={roster}
              busy={busy === selectedThrow.id}
              placingThrow={placingThrow}
              onUse={(patch) => updateUse(selectedUse.id, patch)}
              onThrow={(patch) => void patchThrow(selectedThrow.id, patch)}
              onPlaceOrigin={() => setPlacingThrow((v) => !v)}
              onUpload={(f, k) => void uploadLineup(selectedThrow.id, f, k)}
              onDeleteLineup={(lid) => void deleteLineup(selectedThrow.id, lid)}
              onRemove={() => {
                patchPhase((p) => ({ ...p, utility: p.utility.filter((u) => u.id !== selectedUse.id) }));
                setSelected(null);
              }}
            />
          ) : selectedAssignment ? (
            <>
              <h3>Player</h3>
              <label>
                <span>Who</span>
                <select
                  value={selectedAssignment.playerSteamid64 ?? ""}
                  onChange={(e) => updateAssignment(selectedAssignment.id, { playerSteamid64: e.target.value || null })}
                >
                  <option value="">unassigned</option>
                  {roster.map((p) => <option key={p.steamid64} value={p.steamid64}>{p.nickname}</option>)}
                </select>
              </label>
              <label>
                <span>Job</span>
                <select
                  value={selectedAssignment.action}
                  onChange={(e) => updateAssignment(selectedAssignment.id, { action: e.target.value as ActionKind })}
                >
                  {ACTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
              </label>
              <label>
                <span>Note</span>
                <textarea
                  rows={3}
                  value={selectedAssignment.note ?? ""}
                  onChange={(e) => updateAssignment(selectedAssignment.id, { note: e.target.value || null })}
                />
              </label>
              <button
                className="btn"
                onClick={() => {
                  patchPhase((p) => ({ ...p, assignments: p.assignments.filter((a) => a.id !== selectedAssignment.id) }));
                  setSelected(null);
                }}
              >
                Delete
              </button>
            </>
          ) : (
            <>
              <h3>Phase</h3>
              {phase ? (
                <>
                  <label>
                    <span>Name</span>
                    <input value={phase.name} onChange={(e) => patchPhase((p) => ({ ...p, name: e.target.value }))} />
                  </label>
                  <label>
                    <span>At (seconds after freeze end)</span>
                    <input
                      type="number"
                      min={0}
                      max={115}
                      value={phase.clockOffsetS}
                      onChange={(e) => patchPhase((p) => ({ ...p, clockOffsetS: Number(e.target.value) || 0 }))}
                    />
                  </label>
                  <p className="hint">
                    +{mmss(phase.clockOffsetS)} · <strong>{onClock(phase.clockOffsetS)}</strong> on the clock
                  </p>
                </>
              ) : null}
              <p className="hint">Select a marker to edit it.</p>
            </>
          )}
        </aside>
      </div>

      <div className="timeline">
        {state.phases.map((p, i) => (
          <button
            key={p.id}
            className={`phase-chip ${i === phaseIdx ? "active" : ""}`}
            onClick={() => { setPhaseIdx(i); setSelected(null); }}
          >
            <span className="phase-name">{p.name}</span>
            <span className="phase-clock">{mmss(p.clockOffsetS)}</span>
            {state.phases.length > 1 ? (
              <span className="phase-x" role="button" aria-label="remove phase"
                onClick={(e) => { e.stopPropagation(); removePhase(i); }}>×</span>
            ) : null}
          </button>
        ))}
        <button className="btn" onClick={addPhase}>+ add phase</button>
        <div className="spacer" />
        <a className="btn" href={`/strat/${stratId}`}>View</a>
        <a className="btn" href={`/${map}/${side}`}>Done</a>
      </div>
    </div>
  );
}

/**
 * Split out because it holds the one thing in this editor that is easy to get wrong:
 * the fields above the divider belong to the shared throw and change every strat that
 * uses it, and the fields below belong to this strat alone.
 */
function ThrowInspector({
  use,
  item,
  roster,
  busy,
  placingThrow,
  onUse,
  onThrow,
  onPlaceOrigin,
  onUpload,
  onDeleteLineup,
  onRemove,
}: {
  use: EditorUse;
  item: EditorThrow;
  roster: EditorPlayer[];
  busy: boolean;
  placingThrow: boolean;
  onUse: (patch: Partial<EditorUse>) => void;
  onThrow: (patch: Partial<EditorThrow>) => void;
  onPlaceOrigin: () => void;
  onUpload: (file: File, shotKind: ShotKind) => void;
  onDeleteLineup: (lineupId: string) => void;
  onRemove: () => void;
}) {
  const [shotKind, setShotKind] = useState<ShotKind>("stand");
  const [name, setName] = useState(item.name);
  useEffect(() => setName(item.name), [item.id, item.name]);

  const take = (files: FileList | File[] | null) => {
    if (!files) return;
    for (const f of Array.from(files)) if (f.type.startsWith("image/")) onUpload(f, shotKind);
  };

  return (
    <>
      <h3>
        {UTIL_META[item.kind].label} {busy ? <span className="hint">saving…</span> : null}
      </h3>

      <p className="shared-note">
        Shared — used by {item.usedBy ?? 1} strat{(item.usedBy ?? 1) === 1 ? "" : "s"}. Edits
        below apply everywhere.
      </p>

      <label>
        <span>Name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name.trim() && name !== item.name && onThrow({ name: name.trim() })}
        />
      </label>
      <label>
        <span>Technique</span>
        <select value={item.technique} onChange={(e) => onThrow({ technique: e.target.value as Technique })}>
          {TECHNIQUES.map((t) => <option key={t} value={t}>{t.replace("_", " ")}</option>)}
        </select>
      </label>

      <div className="throw-from">
        <span className="field-label">Throw from</span>
        <p className="hint">
          {item.throwX !== null ? "set — dashed line runs origin to landing." : "not set yet."}
        </p>
        <div className="throw-buttons">
          <button className={`btn ${placingThrow ? "btn-primary" : ""}`} onClick={onPlaceOrigin}>
            {placingThrow ? "click the radar…" : "Set origin"}
          </button>
          {item.throwX !== null ? (
            <button className="btn" onClick={() => onThrow({ throwX: null, throwY: null, throwZ: null })}>
              Clear
            </button>
          ) : null}
        </div>
      </div>

      <div className="lineups">
        <span className="field-label">Lineup shots</span>
        <div className="shot-kinds">
          {SHOT_KINDS.map((k) => (
            <button key={k} className={`btn ${shotKind === k ? "btn-primary" : ""}`} onClick={() => setShotKind(k)}>
              {k}
            </button>
          ))}
        </div>
        <div
          className="dropzone"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); take(e.dataTransfer.files); }}
          onPaste={(e) => take(Array.from(e.clipboardData.files))}
          tabIndex={0}
        >
          Drop, paste or{" "}
          <label className="pick">
            choose
            <input type="file" accept="image/png,image/jpeg,image/webp" multiple
              onChange={(e) => { take(e.target.files); e.target.value = ""; }} />
          </label>
          <br />
          <span className="hint">CS2 screenshots paste straight in.</span>
        </div>
        {item.lineups.length ? (
          <div className="shots">
            {item.lineups.map((l) => (
              <figure key={l.id}>
                <img src={`/api/lineups/${l.id}`} alt={l.shotKind} />
                <figcaption>
                  {l.shotKind}
                  <button className="shot-x" onClick={() => onDeleteLineup(l.id)} aria-label="delete shot">×</button>
                </figcaption>
              </figure>
            ))}
          </div>
        ) : null}
      </div>

      <hr className="divider" />
      <p className="shared-note this-strat">This strat only.</p>

      <label>
        <span>Thrower</span>
        <select
          value={use.throwerSteamid64 ?? ""}
          onChange={(e) => onUse({ throwerSteamid64: e.target.value || null })}
        >
          <option value="">unassigned</option>
          {roster.map((p) => <option key={p.steamid64} value={p.steamid64}>{p.nickname}</option>)}
        </select>
      </label>
      <label>
        <span>Note</span>
        <textarea rows={2} value={use.note ?? ""} onChange={(e) => onUse({ note: e.target.value || null })} />
      </label>

      <button className="btn" onClick={onRemove}>Remove from this phase</button>
    </>
  );
}
