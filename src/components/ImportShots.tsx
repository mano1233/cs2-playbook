"use client";

/**
 * Bulk import: drop a folder of screenshots, get throws.
 *
 * The names do the grouping, so the job here is to show what was inferred and let it be
 * corrected before anything is written. Nothing is uploaded until the plan is confirmed
 * — importing thirty files and *then* discovering every grenade was guessed as a smoke
 * would be worse than not having the feature.
 */

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { convertScreenshot, formatBytes } from "@/lib/convert-image";
import {
  type ImportGroup,
  type ShotKind,
  type UtilKind,
  planImport,
} from "@/lib/import-names";

const UTIL_KINDS: UtilKind[] = ["smoke", "flash", "he", "molotov", "decoy"];
const SHOT_KINDS: ShotKind[] = ["stand", "crosshair", "result"];

const GLYPH: Record<UtilKind, string> = {
  smoke: "●", flash: "◎", he: "✳", molotov: "▲", decoy: "◌",
};

interface Result {
  created: { name: string; throwId: string; shots: number }[];
  problems: { file: string; reason: string }[];
}

export function ImportShots({ map, csrf }: { map: string; csrf: string }) {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [groups, setGroups] = useState<ImportGroup[]>([]);
  const [skipped, setSkipped] = useState<{ file: string; reason: string }[]>([]);
  const [stage, setStage] = useState<"pick" | "review" | "working" | "done">("pick");
  const [progress, setProgress] = useState("");
  const [result, setResult] = useState<Result | null>(null);

  const take = useCallback((incoming: FileList | File[] | null) => {
    if (!incoming) return;
    const images = Array.from(incoming).filter((f) => f.type.startsWith("image/"));
    if (images.length === 0) return;
    const plan = planImport(images.map((f) => f.name));
    setFiles(images);
    setGroups(plan.groups);
    setSkipped(plan.skipped);
    setStage("review");
  }, []);

  const totalBytes = useMemo(() => files.reduce((n, f) => n + f.size, 0), [files]);
  const shotCount = useMemo(() => groups.reduce((n, g) => n + g.shots.length, 0), [groups]);

  function patchGroup(i: number, patch: Partial<ImportGroup>) {
    setGroups((gs) => gs.map((g, j) => (j === i ? { ...g, ...patch } : g)));
  }

  function patchShot(gi: number, si: number, shotKind: ShotKind) {
    setGroups((gs) =>
      gs.map((g, j) =>
        j === gi ? { ...g, shots: g.shots.map((s, k) => (k === si ? { ...s, shotKind } : s)) } : g,
      ),
    );
  }

  async function run() {
    setStage("working");
    const byName = new Map(files.map((f) => [f.name, f]));
    const form = new FormData();
    form.set("map", map);

    const plan: { file: string; name: string; kind: string; shotKind: string }[] = [];
    let done = 0;
    let saved = 0;

    for (const g of groups) {
      for (const shot of g.shots) {
        const original = byName.get(shot.file);
        if (!original) continue;
        // Converted here rather than on the server: the bytes would otherwise be sent
        // at full PNG size only to be shrunk on arrival.
        const { file, before, after } = await convertScreenshot(original);
        saved += before - after;
        form.append("file", file);
        plan.push({ file: file.name, name: g.name, kind: g.kind, shotKind: shot.shotKind });
        done += 1;
        setProgress(`converting ${done}/${shotCount} · saved ${formatBytes(saved)}`);
      }
    }

    form.set("plan", JSON.stringify(plan));
    setProgress(`uploading ${done} shot${done === 1 ? "" : "s"}…`);

    const res = await fetch("/api/throws/import", {
      method: "POST",
      headers: { "x-csrf-token": csrf },
      body: form,
    });

    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setResult({ created: [], problems: [{ file: "—", reason: body.error ?? `HTTP ${res.status}` }] });
    } else {
      setResult((await res.json()) as Result);
    }
    setStage("done");
  }

  if (stage === "done" && result) {
    return (
      <div className="card">
        <h2>Imported</h2>
        {result.created.length ? (
          <ul className="import-results">
            {result.created.map((c) => (
              <li key={c.throwId}>
                <strong>{c.name}</strong> · {c.shots} shot{c.shots === 1 ? "" : "s"}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">Nothing was created.</p>
        )}

        {result.problems.length ? (
          <>
            <p className="field-label">Problems</p>
            <ul className="import-results">
              {result.problems.map((p, i) => (
                <li key={i} className="muted">{p.file} — {p.reason}</li>
              ))}
            </ul>
          </>
        ) : null}

        <p className="unplaced">
          These have their screenshots but no position — a filename cannot say where a
          grenade lands. Open a strat, and each one appears under “Not placed” to put on
          the radar.
        </p>

        <div className="throw-buttons">
          <button className="btn btn-primary" onClick={() => router.push(`/${map}/util`)}>
            See the library
          </button>
          <button
            className="btn"
            onClick={() => { setStage("pick"); setFiles([]); setGroups([]); setResult(null); }}
          >
            Import more
          </button>
        </div>
      </div>
    );
  }

  if (stage === "working") {
    return (
      <div className="card">
        <h2>Importing…</h2>
        <p className="muted">{progress}</p>
      </div>
    );
  }

  if (stage === "review") {
    return (
      <>
        <div className="card">
          <h2>
            {groups.length} throw{groups.length === 1 ? "" : "s"} from {files.length} file
            {files.length === 1 ? "" : "s"}
          </h2>
          <p className="muted">
            Grouped by name. Correct anything that reads wrong before importing —
            afterwards it is edits in the library instead of one dropdown here.
            {totalBytes > 0 ? ` ${formatBytes(totalBytes)} will be re-encoded on the way up.` : ""}
          </p>
          <div className="throw-buttons">
            <button className="btn btn-primary" onClick={() => void run()}>
              Import {shotCount} shot{shotCount === 1 ? "" : "s"}
            </button>
            <button className="btn" onClick={() => { setStage("pick"); setFiles([]); setGroups([]); }}>
              Start over
            </button>
          </div>
        </div>

        {skipped.length ? (
          <div className="error">
            {skipped.length} file{skipped.length === 1 ? "" : "s"} had no usable name and
            will be left out: {skipped.map((s) => s.file).join(", ")}
          </div>
        ) : null}

        <div className="util-grid">
          {groups.map((g, gi) => (
            <article key={g.name} className="util-card">
              <div className="lineup-row">
                <span style={{ fontSize: "1.1rem" }}>{GLYPH[g.kind]}</span>
                <input
                  className="lineup-name"
                  value={g.name}
                  onChange={(e) => patchGroup(gi, { name: e.target.value })}
                />
                <select
                  value={g.kind}
                  onChange={(e) => patchGroup(gi, { kind: e.target.value as UtilKind, kindFromName: true })}
                >
                  {UTIL_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
                </select>
              </div>
              {!g.kindFromName ? (
                <p className="hint">Grenade not stated in the filename — guessed smoke.</p>
              ) : null}

              <ul className="import-shots">
                {g.shots.map((s, si) => (
                  <li key={s.file}>
                    <span className="import-file">{s.file}</span>
                    <select
                      value={s.shotKind}
                      onChange={(e) => patchShot(gi, si, e.target.value as ShotKind)}
                    >
                      {SHOT_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
                    </select>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </>
    );
  }

  return (
    <div
      className="dropzone big"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.preventDefault(); take(e.dataTransfer.files); }}
      onPaste={(e) => take(Array.from(e.clipboardData.files))}
      tabIndex={0}
    >
      <p>Drop a folder of screenshots here, or paste them.</p>
      <label className="btn btn-primary">
        Choose files
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          onChange={(e) => { take(e.target.files); e.target.value = ""; }}
        />
      </label>
      <p className="hint">
        Names are read as <code>&lt;throw&gt; THROW</code> and{" "}
        <code>&lt;throw&gt; LOCATION</code>, so <code>B CHURCH THROW</code> and{" "}
        <code>B CHURCH LOCATION</code> become one throw with two shots. Nothing is
        uploaded until you have seen the grouping.
      </p>
    </div>
  );
}
