"use client";

/**
 * The inspector for one piece of utility in a strat.
 *
 * It shows three things that belong to three different owners, and the whole point of
 * the layout is to make that obvious:
 *
 *   the throw    where it lands. Shared across every strat that uses it.
 *   its lineups  the ways to land it — where you stand, how you throw, screenshots.
 *                Also shared, and there are several: the same smoke goes from spawn or
 *                from ramp, standing or jump-thrown.
 *   this use     who throws it here, and a note. Belongs to this strat alone.
 *
 * Editing anything in the first two changes every strat that references the throw, so
 * those are written immediately through their own endpoints rather than riding along in
 * the strat's debounced autosave.
 */

import { useEffect, useState } from "react";
import type {
  EditorLineup,
  EditorPlayer,
  EditorThrow,
  EditorUse,
  ShotKind,
  Technique,
  UtilKind,
} from "./editor-types";

const TECHNIQUES: Technique[] = ["stand", "jump", "run_jump", "walk", "run"];
const SHOT_KINDS: ShotKind[] = ["stand", "crosshair", "result"];
/** "stand" is what the column says; "location" is what the team calls it. */
const SHOT_LABEL: Record<ShotKind, string> = {
  stand: "location",
  crosshair: "crosshair",
  result: "result",
};

const UTIL_LABEL: Record<UtilKind, string> = {
  smoke: "Smoke",
  flash: "Flash",
  he: "HE",
  molotov: "Molotov",
  decoy: "Decoy",
};

export function ThrowInspector({
  use,
  item,
  roster,
  busy,
  placingFor,
  onUse,
  onThrow,
  onLineup,
  onAddLineup,
  onDeleteLineup,
  onPlaceOrigin,
  onUpload,
  onDeleteShot,
  onRemove,
}: {
  use: EditorUse;
  item: EditorThrow;
  roster: EditorPlayer[];
  busy: boolean;
  /** Which lineup is waiting for a radar click, if any. */
  placingFor: string | null;
  onUse: (patch: Partial<EditorUse>) => void;
  onThrow: (patch: Partial<EditorThrow>) => void;
  onLineup: (lineupId: string, patch: Partial<EditorLineup>) => void;
  onAddLineup: () => void;
  onDeleteLineup: (lineupId: string) => void;
  onPlaceOrigin: (lineupId: string | null) => void;
  onUpload: (lineupId: string, file: File, shotKind: ShotKind) => void;
  onDeleteShot: (lineupId: string, shotId: string) => void;
  onRemove: () => void;
}) {
  const [name, setName] = useState(item.name);
  useEffect(() => setName(item.name), [item.id, item.name]);

  return (
    <>
      <h3>
        {UTIL_LABEL[item.kind]} {busy ? <span className="hint">saving…</span> : null}
      </h3>

      <p className="shared-note">
        Shared — used by {item.usedBy ?? 1} strat{(item.usedBy ?? 1) === 1 ? "" : "s"}.
        Everything above the divider applies everywhere.
      </p>

      <label>
        <span>Name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name.trim() && name !== item.name && onThrow({ name: name.trim() })}
        />
      </label>

      <div className="lineups">
        <div className="lineups-head">
          <span className="field-label">
            Lineups ({item.lineups.length})
          </span>
          <button className="btn tiny" onClick={onAddLineup}>+ add</button>
        </div>
        <p className="hint">
          Ways to land the same grenade. Each has its own spot and its own shots.
        </p>

        {item.lineups.length === 0 ? (
          <p className="hint">None yet — add one and set where it is thrown from.</p>
        ) : null}

        {item.lineups.map((l, i) => (
          <LineupCard
            key={l.id}
            n={i + 1}
            lineup={l}
            placing={placingFor === l.id}
            onPatch={(patch) => onLineup(l.id, patch)}
            onPlaceOrigin={() => onPlaceOrigin(placingFor === l.id ? null : l.id)}
            onUpload={(f, k) => onUpload(l.id, f, k)}
            onDeleteShot={(shotId) => onDeleteShot(l.id, shotId)}
            onDelete={() => onDeleteLineup(l.id)}
          />
        ))}
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
          {roster.map((p) => (
            <option key={p.steamid64} value={p.steamid64}>{p.nickname}</option>
          ))}
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

function LineupCard({
  n,
  lineup,
  placing,
  onPatch,
  onPlaceOrigin,
  onUpload,
  onDeleteShot,
  onDelete,
}: {
  n: number;
  lineup: EditorLineup;
  placing: boolean;
  onPatch: (patch: Partial<EditorLineup>) => void;
  onPlaceOrigin: () => void;
  onUpload: (file: File, shotKind: ShotKind) => void;
  onDeleteShot: (shotId: string) => void;
  onDelete: () => void;
}) {
  const [shotKind, setShotKind] = useState<ShotKind>("stand");
  const [name, setName] = useState(lineup.name ?? "");
  useEffect(() => setName(lineup.name ?? ""), [lineup.id, lineup.name]);

  const take = (files: FileList | File[] | null) => {
    if (!files) return;
    for (const f of Array.from(files)) if (f.type.startsWith("image/")) onUpload(f, shotKind);
  };

  return (
    <div className={`lineup-card ${placing ? "placing" : ""}`}>
      <div className="lineup-card-head">
        <span className="lineup-n">{n}</span>
        <input
          className="lineup-name"
          value={name}
          placeholder={`lineup ${n}`}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name !== (lineup.name ?? "") && onPatch({ name: name || null })}
        />
        <button className="shot-x" onClick={onDelete} aria-label="delete lineup">×</button>
      </div>

      <div className="lineup-row">
        <select
          value={lineup.technique}
          onChange={(e) => onPatch({ technique: e.target.value as Technique })}
        >
          {TECHNIQUES.map((t) => <option key={t} value={t}>{t.replace("_", " ")}</option>)}
        </select>
        {lineup.throwX === null ? (
          <button className={`btn tiny ${placing ? "btn-primary" : ""}`} onClick={onPlaceOrigin}>
            {placing ? "click radar…" : "set spot"}
          </button>
        ) : (
          <span className="fixed-note">spot fixed</span>
        )}
      </div>

      {lineup.throwX === null ? (
        <p className="hint">
          No spot yet. Set it once — a lineup is the spot, so moving it later would leave
          the screenshots showing somewhere else.
        </p>
      ) : null}

      <div
        className="dropzone tiny"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); take(e.dataTransfer.files); }}
        onPaste={(e) => take(Array.from(e.clipboardData.files))}
        tabIndex={0}
      >
        <div className="shot-kinds">
          {SHOT_KINDS.map((k) => (
            <button
              key={k}
              className={`btn tiny ${shotKind === k ? "btn-primary" : ""}`}
              onClick={() => setShotKind(k)}
            >
              {SHOT_LABEL[k]}
            </button>
          ))}
        </div>
        drop, paste or{" "}
        <label className="pick">
          choose
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple
            onChange={(e) => { take(e.target.files); e.target.value = ""; }}
          />
        </label>
      </div>

      {lineup.shots.length ? (
        <div className="shots">
          {lineup.shots.map((s) => (
            <figure key={s.id}>
              <img src={`/api/shots/${s.id}`} alt={s.shotKind} />
              <figcaption>
                {SHOT_LABEL[s.shotKind]}
                <button className="shot-x" onClick={() => onDeleteShot(s.id)} aria-label="delete shot">×</button>
              </figcaption>
            </figure>
          ))}
        </div>
      ) : null}

      <textarea
        rows={2}
        placeholder="note — e.g. line up on the left edge of the doorframe"
        value={lineup.note ?? ""}
        onChange={(e) => onPatch({ note: e.target.value || null })}
      />
    </div>
  );
}
