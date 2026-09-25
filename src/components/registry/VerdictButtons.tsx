"use client";

import { useState } from "react";

// ✓ / ✗ on one registry-vs-production difference. In production the write
// needs the admin token; it's asked once and kept in localStorage.
export default function VerdictButtons({
  diffId,
  kind,
  competitionIds,
  rawNames,
  initial,
  initialNote,
}: {
  diffId: string;
  kind: string;
  competitionIds: string[];
  rawNames: string[];
  initial: string | null;
  initialNote: string | null;
}) {
  const [verdict, setVerdict] = useState<string | null>(initial);
  const [note, setNote] = useState(initialNote ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(v: "ok" | "wrong") {
    setBusy(true);
    setError(null);
    let token = "";
    try {
      token = localStorage.getItem("adminToken") ?? "";
    } catch {}
    const send = (t: string) =>
      fetch("/api/registry/verdict", {
        method: "POST",
        headers: { "content-type": "application/json", "x-admin-token": t },
        body: JSON.stringify({ diff_id: diffId, kind, verdict: v, note, competition_ids: competitionIds, raw_names: rawNames }),
      });
    let res = await send(token);
    if (res.status === 403) {
      const t = window.prompt("Admin token") ?? "";
      try {
        localStorage.setItem("adminToken", t);
      } catch {}
      res = await send(t);
    }
    setBusy(false);
    if (res.ok) setVerdict(v);
    else setError(`Error ${res.status}`);
  }

  return (
    <div className="flex flex-col gap-1.5 items-end shrink-0">
      <div className="flex gap-1">
        <button
          disabled={busy}
          onClick={() => save("ok")}
          title="The registry is right"
          className={`text-xs px-2 py-1 rounded border ${
            verdict === "ok" ? "bg-green-500/25 border-green-500/60 text-green-300" : "border-neutral-700 text-neutral-400 hover:text-green-300"
          }`}
        >
          ✓ Correct
        </button>
        <button
          disabled={busy}
          onClick={() => save("wrong")}
          title="The registry got this wrong -- add a note on what it should be"
          className={`text-xs px-2 py-1 rounded border ${
            verdict === "wrong" ? "bg-red-500/25 border-red-500/60 text-red-300" : "border-neutral-700 text-neutral-400 hover:text-red-300"
          }`}
        >
          ✗ Wrong
        </button>
      </div>
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="note (optional)"
        className="w-44 bg-neutral-900 text-[11px] rounded px-1.5 py-1 border border-neutral-800 focus:outline-none focus:border-neutral-600"
      />
      {error && <span className="text-[11px] text-red-400">{error}</span>}
    </div>
  );
}
