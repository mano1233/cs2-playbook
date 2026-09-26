"use client";

import { useEffect, useState } from "react";

interface KeyRow {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

const when = (v: string | null) => (v ? new Date(v).toLocaleDateString() : "never");

export function ApiKeys({ csrf }: { csrf: string }) {
  const [keys, setKeys] = useState<KeyRow[]>([]);
  const [name, setName] = useState("");
  const [fresh, setFresh] = useState<{ name: string; token: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const headers = { "content-type": "application/json", "x-csrf-token": csrf };

  async function load() {
    const res = await fetch("/api/keys");
    if (res.ok) setKeys(((await res.json()) as { keys: KeyRow[] }).keys);
  }
  useEffect(() => { void load(); }, []);

  async function create() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/keys", {
        method: "POST",
        headers,
        body: JSON.stringify({ name }),
      });
      if (!res.ok) return;
      const { key } = (await res.json()) as { key: { name: string; token: string } };
      setFresh(key);
      setName("");
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    await fetch(`/api/keys/${id}`, { method: "DELETE", headers });
    await load();
  }

  return (
    <>
      {fresh ? (
        <div className="card fresh-key">
          <h2>{fresh.name}</h2>
          <p className="unplaced">
            Copy this now. It is stored hashed, so this is the only time it can be shown —
            if you lose it, revoke it and make another.
          </p>
          <code className="token">{fresh.token}</code>
          <div className="throw-buttons">
            <button className="btn" onClick={() => void navigator.clipboard.writeText(fresh.token)}>
              Copy
            </button>
            <button className="btn" onClick={() => setFresh(null)}>Done</button>
          </div>
        </div>
      ) : null}

      <div className="card">
        <h2>New key</h2>
        <div className="new-strat-form">
          <label className="grow">
            <span>What is it for</span>
            <input
              value={name}
              placeholder="import script"
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void create()}
            />
          </label>
          <button className="btn btn-primary" disabled={busy || !name.trim()} onClick={() => void create()}>
            Create
          </button>
        </div>
      </div>

      {keys.length ? (
        <ul className="strat-list">
          {keys.map((k) => (
            <li key={k.id}>
              <div className="strat-row">
                <span className="strat-name">{k.name}</span>
                {k.revokedAt ? <span className="tag tag-retired">revoked</span> : null}
                <span className="muted strat-meta">
                  made {when(k.createdAt)} · last used {when(k.lastUsedAt)}
                </span>
                {k.revokedAt ? null : (
                  <button className="btn" onClick={() => void revoke(k.id)}>Revoke</button>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">No keys yet.</p>
      )}
    </>
  );
}
