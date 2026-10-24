"use client";

import { useEffect, useState } from "react";

export function LineupGuide({ id, name, technique, steps, command, shots, note }: {
  id: string; name: string; technique: string; steps: string | null; command: string | null;
  shots: { id: string; shotKind: string }[]; note: string | null;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const followHash = () => {
      if (window.location.hash === `#lineup-${id}`) setOpen(true);
    };
    followHash();
    const followClick = (event: MouseEvent) => {
      const element = event.target instanceof Element ? event.target.closest("a") : null;
      if (element?.getAttribute("href") === `#lineup-${id}`) setOpen(true);
    };
    window.addEventListener("hashchange", followHash);
    document.addEventListener("click", followClick);
    return () => {
      window.removeEventListener("hashchange", followHash);
      document.removeEventListener("click", followClick);
    };
  }, [id]);
  return (
    <article id={`lineup-${id}`} className="card lineup-guide">
      <h4>{name}</h4>
      <button type="button" className="btn" aria-expanded={open} aria-controls={`guide-${id}`} onClick={() => setOpen(!open)}>{open ? "Hide instructions" : "Show how to throw"}</button>
      <div id={`guide-${id}`} hidden={!open}>
        <p>{technique}</p>
        {steps ? <p style={{ whiteSpace: "pre-line" }}>{steps}</p> : <p>No throw steps saved yet.</p>}
        {command ? <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{command}</pre> : null}
        {shots.map((shot) => <a key={shot.id} href={`/api/shots/${shot.id}`} target="_blank" rel="noreferrer"><img src={`/api/shots/${shot.id}`} alt={`${name}: ${shot.shotKind} reference`} loading="lazy" style={{ width: "100%", height: "auto", borderRadius: 8 }} /></a>)}
        {!shots.length ? <p className="muted">No screenshots saved yet.</p> : null}
        {note ? <p className="muted">{note}</p> : null}
      </div>
    </article>
  );
}
