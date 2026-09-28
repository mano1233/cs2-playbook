"use client";

/**
 * The creator.
 *
 * Most team playbooks die because adding the *second* strat is too much work, so every
 * choice here trades fidelity for speed of capture: one page rather than a wizard, a
 * palette that stays armed so three smokes is three clicks, and phases that carry
 * player positions forward because players do not teleport between them.
 *
 * Two kinds of state, written differently on purpose:
 *
 *   - The strat — which throws are used, by whom, in which phase — autosaves on a
 *     debounce. It belongs to this strat alone.
 *   - Throws and their lineups are shared across every strat that references them, so
 *     they are written immediately through their own endpoints. Changing something
 *     shared should be a deliberate act, not a side effect of tweaking one exec.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DEFAULT_LEVEL, fractionToWorld, radarFor, worldToPixel } from "@/lib/radar";
import { convertScreenshot, formatBytes } from "@/lib/convert-image";
import { MOVEMENTS, MOVEMENT_LABEL, type Movement, parseGetpos } from "@/lib/lineup-meta";
import { ThrowInspector } from "./ThrowInspector";
import {
  ACTIONS,
  type ActionKind,
  type EditorLineup,
  type EditorPhase,
  type EditorPlayer,
  type EditorState,
  type EditorAssignment,
  type EditorThrow,
  type EditorUse,
  type ShotKind,
  UTIL_META,
  type UtilKind,
} from "./editor-types";

export type {
  EditorLineup,
  EditorPhase,
  EditorPlayer,
  EditorState,
  EditorThrow,
} from "./editor-types";

type Tool = UtilKind | "player" | null;

/**
 * What a piece of utility is made of, in the order it is captured: the kind, the two
 * positions, then the three screenshots. `result` is the one optional part — it shows
 * what the grenade did, which is nice to have, while the other two are what a player
 * actually needs to reproduce the throw.
 */
type PendingUtil = {
  kind: UtilKind;
  name: string;
  landX: number;
  landY: number;
  /** Undefined until the second radar click. */
  throwX?: number;
  throwY?: number;
  /**
   * Pasted getpos output, when the spot came from the game rather than a click. Sent
   * as-is: the server parses it too, and it carries the view angles a click cannot.
   */
  getpos?: string;
  movement: Movement;
  jump: boolean;
  shots: Partial<Record<ShotKind, File>>;
};

const SHOT_LABEL: Record<ShotKind, string> = {
  stand: "location",
  crosshair: "crosshair",
  result: "result",
};
/** Held back until the end so pasting fills location, then crosshair, then result. */
const SHOT_ORDER: ShotKind[] = ["stand", "crosshair", "result"];
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
  /** Which lineup is waiting for a radar click to set its spot. */
  const [placingFor, setPlacingFor] = useState<string | null>(null);
  /**
   * Which throw is waiting for a click to set where it *lands*. Imported throws arrive
   * with screenshots and no position, so without this they could never be drawn.
   */
  const [placingLanding, setPlacingLanding] = useState<string | null>(null);
  const [showLibrary, setShowLibrary] = useState(false);
  /**
   * A util being built. Both positions are write-once, so they are gathered before
   * anything is created rather than saved half-formed and corrected after — there is no
   * correcting them.
   */
  const [pending, setPending] = useState<PendingUtil | null>(null);
  const [saving, setSaving] = useState<"idle" | "saving" | "saved" | "conflict" | "error">("idle");
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

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
        if (res.status === 409) return setSaving("conflict");
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

  // ---- shared writes: immediate ------------------------------------------

  const refreshLibrary = useCallback(async () => {
    const res = await fetch(`/api/throws?map=${map}`);
    if (res.ok) setLibrary(((await res.json()) as { throws: EditorThrow[] }).throws);
  }, [map]);

  const patchThrow = useCallback(
    async (id: string, patch: Partial<EditorThrow>) => {
      setLibrary((lib) => lib.map((t) => (t.id === id ? { ...t, ...patch } : t)));
      setBusy(id);
      try {
        const res = await fetch(`/api/throws/${id}`, { method: "PATCH", headers, body: JSON.stringify(patch) });
        // Put the server's version back rather than leaving an edit on screen that
        // never landed.
        if (!res.ok) await refreshLibrary();
      } finally {
        setBusy(null);
      }
    },
    [headers, refreshLibrary],
  );

  const patchLineup = useCallback(
    async (throwId: string, lineupId: string, patch: Partial<EditorLineup>) => {
      setLibrary((lib) =>
        lib.map((t) =>
          t.id === throwId
            ? { ...t, lineups: t.lineups.map((l) => (l.id === lineupId ? { ...l, ...patch } : l)) }
            : t,
        ),
      );
      setBusy(throwId);
      try {
        const res = await fetch(`/api/lineups/${lineupId}`, {
          method: "PATCH",
          headers,
          body: JSON.stringify(patch),
        });
        // A getpos is parsed on the server, so the position it sets only exists once
        // the library is read back.
        if (!res.ok || "getpos" in patch) await refreshLibrary();
      } finally {
        setBusy(null);
      }
    },
    [headers, refreshLibrary],
  );

  const addLineup = useCallback(
    async (throwId: string) => {
      setBusy(throwId);
      try {
        const res = await fetch(`/api/throws/${throwId}/lineups`, { method: "POST", headers, body: "{}" });
        if (!res.ok) return;
        const { lineup } = (await res.json()) as { lineup: EditorLineup };
        setLibrary((lib) =>
          lib.map((t) =>
            t.id === throwId ? { ...t, lineups: [...t.lineups, { ...lineup, shots: [] }] } : t,
          ),
        );
        // Arm placement straight away: a lineup without a spot draws nothing, so the
        // next thing anyone wants is to say where it is thrown from.
        setPlacingFor(lineup.id);
      } finally {
        setBusy(null);
      }
    },
    [headers],
  );

  const removeLineup = useCallback(
    async (throwId: string, lineupId: string) => {
      setLibrary((lib) =>
        lib.map((t) =>
          t.id === throwId ? { ...t, lineups: t.lineups.filter((l) => l.id !== lineupId) } : t,
        ),
      );
      if (placingFor === lineupId) setPlacingFor(null);
      await fetch(`/api/lineups/${lineupId}`, { method: "DELETE", headers });
    },
    [headers, placingFor],
  );

  const uploadShot = useCallback(
    async (throwId: string, lineupId: string, file: File, shotKind: ShotKind) => {
      setBusy(throwId);
      try {
        // Re-encoded in the browser first: a CS2 PNG is ~3 MB and the same picture as
        // WebP is a tenth of that, which is the difference between a lineup opening
        // instantly on a phone and not.
        const { file: sending, before, after, converted } = await convertScreenshot(file);
        if (converted) {
          setNote(`${formatBytes(before)} → ${formatBytes(after)}`);
          setTimeout(() => setNote(null), 4000);
        }
        const form = new FormData();
        form.set("file", sending);
        form.set("shotKind", shotKind);
        const res = await fetch(`/api/lineups/${lineupId}/shots`, {
          method: "POST",
          headers: { "x-csrf-token": csrf },
          body: form,
        });
        if (!res.ok) return;
        const { shot } = (await res.json()) as { shot: EditorLineup["shots"][number] };
        setLibrary((lib) =>
          lib.map((t) =>
            t.id === throwId
              ? {
                  ...t,
                  lineups: t.lineups.map((l) =>
                    l.id === lineupId ? { ...l, shots: [...l.shots, shot] } : l,
                  ),
                }
              : t,
          ),
        );
      } finally {
        setBusy(null);
      }
    },
    [csrf],
  );

  const deleteShot = useCallback(
    async (throwId: string, lineupId: string, shotId: string) => {
      setLibrary((lib) =>
        lib.map((t) =>
          t.id === throwId
            ? {
                ...t,
                lineups: t.lineups.map((l) =>
                  l.id === lineupId ? { ...l, shots: l.shots.filter((s) => s.id !== shotId) } : l,
                ),
              }
            : t,
        ),
      );
      await fetch(`/api/shots/${shotId}`, { method: "DELETE", headers });
    },
    [headers],
  );

  // ---- placing -----------------------------------------------------------

  function useThrow(throwId: string) {
    const id = crypto.randomUUID();
    patchPhase((p) => ({
      ...p,
      utility: [...p.utility, { id, throwId, throwerSteamid64: null, note: null }],
    }));
    setSelected({ kind: "use", id });
  }

  async function onRadarClick(e: React.MouseEvent<SVGSVGElement>) {
    if (!phase) return;
    const rect = svgRef.current!.getBoundingClientRect();
    const world = fractionToWorld(
      map,
      (e.clientX - rect.left) / rect.width,
      (e.clientY - rect.top) / rect.height,
    );
    if (!world) return;

    if (placingLanding) {
      void patchThrow(placingLanding, { landX: world.x, landY: world.y, level });
      setPlacingLanding(null);
      return;
    }

    if (placingFor && selected?.kind === "use") {
      const use = phase.utility.find((u) => u.id === selected.id);
      if (use) void patchLineup(use.throwId, placingFor, { throwX: world.x, throwY: world.y, throwZ: null });
      setPlacingFor(null);
      return;
    }

    // Second click of a creation: the spot it is thrown from.
    if (pending && pending.throwX === undefined) {
      setPending({ ...pending, throwX: world.x, throwY: world.y });
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

    // First click of a creation: where it lands. Nothing is written yet.
    setPending({
      kind: tool,
      name: "",
      landX: world.x,
      landY: world.y,
      movement: "stationary",
      jump: false,
      shots: {},
    });
  }

  async function commitPending(p: PendingUtil) {
    const res = await fetch("/api/throws", {
      method: "POST",
      headers,
      body: JSON.stringify({
        map,
        kind: p.kind,
        name: p.name.trim() || undefined,
        landX: p.landX,
        landY: p.landY,
        level,
        lineup:
          p.getpos
            ? { getpos: p.getpos, movement: p.movement, jump: p.jump }
            : p.throwX !== undefined
              ? { throwX: p.throwX, throwY: p.throwY, movement: p.movement, jump: p.jump }
              : undefined,
      }),
    });
    if (!res.ok) return;
    const { throw: created } = (await res.json()) as { throw: EditorThrow };
    const withLineups = { ...created, lineups: created.lineups ?? [] };
    setLibrary((lib) => [...lib, withLineups]);
    useThrow(withLineups.id);
    setPending(null);
    setTool(null);

    // The screenshots are uploaded after the row exists, since they hang off the
    // lineup's id. Sequentially: three CS2 PNGs re-encoding in parallel makes the
    // radar stutter, and nothing is waiting on them.
    const lineupId = withLineups.lineups[0]?.id;
    if (!lineupId) return;
    for (const kind of SHOT_ORDER) {
      const file = p.shots[kind];
      if (file) await uploadShot(withLineups.id, lineupId, file, kind);
    }
  }

  /** Pasting into the creation panel fills the slots in order. */
  function takePendingShot(p: PendingUtil, file: File, kind?: ShotKind) {
    const slot = kind ?? SHOT_ORDER.find((k) => !p.shots[k]);
    if (!slot) return;
    setPending({ ...p, shots: { ...p.shots, [slot]: file } });
  }

  // ---- keyboard ----------------------------------------------------------

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement;
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;

      if (e.key === "Escape") {
        setPending(null);
        setPlacingFor(null);
        setPlacingLanding(null);
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

  // ---- phases ------------------------------------------------------------

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

  // ---- derived -----------------------------------------------------------

  const selectedUse =
    selected?.kind === "use" ? phase?.utility.find((u) => u.id === selected.id) : undefined;
  const selectedThrow = selectedUse ? throwsById.get(selectedUse.throwId) : undefined;
  const selectedAssignment =
    selected?.kind === "assignment" ? phase?.assignments.find((a) => a.id === selected.id) : undefined;

  const updateUse = (id: string, patch: Partial<EditorUse>) =>
    patchPhase((p) => ({ ...p, utility: p.utility.map((u) => (u.id === id ? { ...u, ...patch } : u)) }));
  const updateAssignment = (id: string, patch: Partial<EditorAssignment>) =>
    patchPhase((p) => ({
      ...p,
      assignments: p.assignments.map((a) => (a.id === id ? { ...a, ...patch } : a)),
    }));

  const usesOnLevel = (phase?.utility ?? []).filter((u) => {
    const t = throwsById.get(u.throwId);
    return t?.level === level && t.landX !== null && t.landY !== null;
  });
  /** Used in this phase but not placed anywhere — surfaced rather than silently absent. */
  const unplaced = (phase?.utility ?? []).filter((u) => {
    const t = throwsById.get(u.throwId);
    return t && (t.landX === null || t.landY === null);
  });
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
          {note ?? (saving === "saving" ? "saving…" : saving === "saved" ? "saved" : saving === "error" ? "save failed" : "")}
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
            {placingLanding
              ? "Click where it lands."
              : placingFor
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
                    {t.lineups.length ? <span className="lib-shots">{t.lineups.length}×</span> : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          {unplaced.length ? (
            <>
              <h3>Not placed</h3>
              <p className="hint">Imported from screenshots. Say where each one lands.</p>
              {unplaced.map((u) => {
                const t = throwsById.get(u.throwId)!;
                return (
                  <button
                    key={u.id}
                    className={`tool ${placingLanding === t.id ? "armed" : ""}`}
                    style={{ ["--tool-colour" as string]: UTIL_META[t.kind].colour }}
                    onClick={() => setPlacingLanding(placingLanding === t.id ? null : t.id)}
                  >
                    <span className="tool-glyph">{UTIL_META[t.kind].glyph}</span>
                    <span className="lib-name">{t.name}</span>
                  </button>
                );
              })}
            </>
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
            className={`radar ${tool || placingFor || placingLanding || pending ? "armed" : ""}`}
            onClick={(e) => void onRadarClick(e)}
          >
            <image href={`/api/radars/${map}/${level}`} x="0" y="0" width="1000" height="1000" />

            {usesOnLevel.map((use) => {
              const t = throwsById.get(use.throwId)!;
              const land = worldToPixel(map, t.landX!, t.landY!)!;
              const meta = UTIL_META[t.kind];
              const isSel = selected?.kind === "use" && selected.id === use.id;
              const positioned = t.lineups.filter((l) => l.throwX !== null);

              return (
                <g key={use.id} onClick={(e) => { e.stopPropagation(); setSelected({ kind: "use", id: use.id }); }}>
                  {/* Every lineup's spot, each dashed back to the same landing point. */}
                  {positioned.map((l, i) => {
                    const from = worldToPixel(map, l.throwX!, l.throwY!)!;
                    return (
                      <g key={l.id}>
                        <line
                          x1={from.fx * 1000} y1={from.fy * 1000}
                          x2={land.fx * 1000} y2={land.fy * 1000}
                          stroke={meta.colour} strokeWidth="2"
                          strokeDasharray="6 5" opacity={isSel ? 0.9 : 0.45}
                        />
                        <circle
                          cx={from.fx * 1000} cy={from.fy * 1000} r="11"
                          fill={meta.colour} fillOpacity={isSel ? 0.9 : 0.55}
                          stroke={placingFor === l.id ? "#fff" : "#00000088"}
                          strokeWidth={placingFor === l.id ? 3 : 1.5}
                        />
                        <text
                          x={from.fx * 1000} y={from.fy * 1000 + 5}
                          textAnchor="middle" fontSize="14" fill="#0d1416" fontWeight="700"
                        >
                          {i + 1}
                        </text>
                      </g>
                    );
                  })}

                  <circle
                    cx={land.fx * 1000} cy={land.fy * 1000} r="14"
                    fill={meta.colour} fillOpacity="0.85"
                    stroke={isSel ? "#fff" : "#00000088"} strokeWidth={isSel ? 3 : 1.5}
                  />
                  <text x={land.fx * 1000} y={land.fy * 1000 + 5} textAnchor="middle" fontSize="15" fill="#0d1416">
                    {meta.glyph}
                  </text>
                </g>
              );
            })}

            {pending ? (() => {
              const land = worldToPixel(map, pending.landX, pending.landY)!;
              const from =
                pending.throwX !== undefined
                  ? worldToPixel(map, pending.throwX, pending.throwY!)
                  : null;
              const meta = UTIL_META[pending.kind];
              return (
                <g className="ghost">
                  {from ? (
                    <>
                      <line
                        x1={from.fx * 1000} y1={from.fy * 1000}
                        x2={land.fx * 1000} y2={land.fy * 1000}
                        stroke={meta.colour} strokeWidth="2" strokeDasharray="6 5" opacity="0.8"
                      />
                      <circle cx={from.fx * 1000} cy={from.fy * 1000} r="11"
                        fill="none" stroke={meta.colour} strokeWidth="3" />
                    </>
                  ) : null}
                  <circle cx={land.fx * 1000} cy={land.fy * 1000} r="14"
                    fill={meta.colour} fillOpacity="0.5" stroke="#fff" strokeWidth="2" strokeDasharray="4 3" />
                </g>
              );
            })() : null}

            {(phase?.assignments ?? [])
              .filter((a) => a.level === level && a.x !== null && a.y !== null)
              .map((a) => {
                const p = worldToPixel(map, a.x!, a.y!)!;
                const isSel = selected?.kind === "assignment" && selected.id === a.id;
                return (
                  <g key={a.id} onClick={(e) => { e.stopPropagation(); setSelected({ kind: "assignment", id: a.id }); }}>
                    <circle
                      cx={p.fx * 1000} cy={p.fy * 1000} r="13" fill="#17a398"
                      stroke={isSel ? "#fff" : "#00000088"} strokeWidth={isSel ? 3 : 1.5}
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
          {pending ? (() => {
            const placed = pending.throwX !== undefined;
            const missing = (["stand", "crosshair"] as ShotKind[]).filter((k) => !pending.shots[k]);
            return (
              <div
                className="pending-panel"
                onPaste={(e) => {
                  const f = Array.from(e.clipboardData.files).find((x) => x.type.startsWith("image/"));
                  if (f) takePendingShot(pending, f);
                }}
              >
                <h3>New {UTIL_META[pending.kind].label.toLowerCase()}</h3>
                <p className="shared-note">
                  Both positions are fixed once saved. Get them right now — to change one
                  later you make another throw, or another lineup.
                </p>

                <ol className="pending-steps">
                  <li className="done">where it lands</li>
                  <li className={placed ? "done" : "now"}>
                    {placed
                      ? pending.getpos ? "where it is thrown from · exact, from getpos" : "where it is thrown from"
                      : "click where it is thrown from, or paste getpos"}
                  </li>
                </ol>

                <label>
                  <span>Name</span>
                  <input
                    autoFocus
                    value={pending.name}
                    placeholder="heaven smoke"
                    onChange={(e) => setPending({ ...pending, name: e.target.value })}
                    onKeyDown={(e) => e.key === "Enter" && placed && void commitPending(pending)}
                  />
                </label>

                <label>
                  <span>Or paste getpos</span>
                  <input
                    className="getpos-input"
                    value={pending.getpos ?? ""}
                    placeholder="setpos … ;setang …"
                    onChange={(e) => {
                      const gp = parseGetpos(e.target.value);
                      // Exact beats a click: a getpos replaces whatever was clicked.
                      setPending(
                        gp
                          ? { ...pending, getpos: e.target.value, throwX: gp.x, throwY: gp.y }
                          : { ...pending, getpos: e.target.value || undefined },
                      );
                    }}
                  />
                </label>
                {pending.getpos && !parseGetpos(pending.getpos) ? (
                  <p className="hint bad">Not getpos output — run <code>getpos</code> in the console and copy the whole line.</p>
                ) : null}

                <div className="lineup-row">
                  <select
                    value={pending.movement}
                    onChange={(e) => setPending({ ...pending, movement: e.target.value as Movement })}
                  >
                    {MOVEMENTS.map((m) => (
                      <option key={m} value={m}>{MOVEMENT_LABEL[m]}</option>
                    ))}
                  </select>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={pending.jump}
                      onChange={(e) => setPending({ ...pending, jump: e.target.checked })}
                    />
                    jump
                  </label>
                </div>

                <span className="field-label">Screenshots</span>
                <p className="hint">
                  Where you stand and what you aim at — a lineup is not reproducible
                  without both. Paste to fill them in order.
                </p>
                <div className="shot-slots">
                  {SHOT_ORDER.map((k) => {
                    const file = pending.shots[k];
                    return (
                      <div key={k} className={`shot-slot ${file ? "filled" : ""}`}>
                        <span className="slot-name">
                          {SHOT_LABEL[k]}
                          {k === "result" ? <em> optional</em> : null}
                        </span>
                        {file ? (
                          <>
                            <span className="slot-file">{formatBytes(file.size)}</span>
                            <button
                              className="shot-x"
                              aria-label={`remove ${SHOT_LABEL[k]}`}
                              onClick={() => {
                                const { [k]: _drop, ...rest } = pending.shots;
                                setPending({ ...pending, shots: rest });
                              }}
                            >
                              ×
                            </button>
                          </>
                        ) : (
                          <label className="pick">
                            choose
                            <input
                              type="file"
                              accept="image/png,image/jpeg,image/webp"
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) takePendingShot(pending, f, k);
                                e.target.value = "";
                              }}
                            />
                          </label>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="throw-buttons">
                  <button
                    className="btn btn-primary"
                    disabled={!placed}
                    onClick={() => void commitPending(pending)}
                  >
                    {missing.length ? "Create anyway" : "Create"}
                  </button>
                  <button className="btn" onClick={() => setPending(null)}>Cancel</button>
                </div>
                {!placed ? (
                  <p className="hint">Click the radar once more to say where it is thrown from, or paste <code>getpos</code> from the game.</p>
                ) : missing.length ? (
                  <p className="hint">
                    No {missing.map((k) => SHOT_LABEL[k]).join(" or ")} shot yet. Screenshots
                    can be added later, unlike the positions.
                  </p>
                ) : null}
              </div>
            );
          })() : selectedUse && selectedThrow ? (
            <ThrowInspector
              use={selectedUse}
              item={selectedThrow}
              roster={roster}
              busy={busy === selectedThrow.id}
              placingFor={placingFor}
              onUse={(patch) => updateUse(selectedUse.id, patch)}
              onThrow={(patch) => void patchThrow(selectedThrow.id, patch)}
              onLineup={(lid, patch) => void patchLineup(selectedThrow.id, lid, patch)}
              onAddLineup={() => void addLineup(selectedThrow.id)}
              onDeleteLineup={(lid) => void removeLineup(selectedThrow.id, lid)}
              onPlaceOrigin={(lid) => setPlacingFor(lid)}
              onUpload={(lid, f, k) => void uploadShot(selectedThrow.id, lid, f, k)}
              onDeleteShot={(lid, sid) => void deleteShot(selectedThrow.id, lid, sid)}
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
                      type="number" min={0} max={115} value={phase.clockOffsetS}
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
