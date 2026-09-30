"use client";

import { useState } from "react";

// Global "report a data error" widget -- a small floating button on every
// page (mounted once in the root layout). Pre-fills the current page URL
// so a report is always traceable to where the visitor saw the problem.
export default function ReportErrorButton() {
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function submit() {
    if (description.trim().length < 5) return;
    setStatus("sending");
    try {
      const res = await fetch("/api/report-error", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageUrl: window.location.href, description }),
      });
      if (!res.ok) throw new Error("failed");
      setStatus("sent");
      setDescription("");
      setTimeout(() => {
        setOpen(false);
        setStatus("idle");
      }, 1500);
    } catch {
      setStatus("error");
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-20 sm:bottom-4 right-4 z-40 text-[11px] px-3 py-1.5 rounded-full bg-neutral-800 text-neutral-300 border border-neutral-700 hover:bg-neutral-700 hover:text-neutral-100 shadow-lg"
        title="Report a data error on this page"
      >
        ⚠ Report an error
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 px-3 pb-3 sm:p-3">
          <div className="w-full sm:max-w-md bg-neutral-900 border border-neutral-700 rounded-xl p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Report a data error</h2>
              <button onClick={() => setOpen(false)} className="text-neutral-500 hover:text-neutral-200 text-sm">
                ✕
              </button>
            </div>
            <p className="text-xs text-neutral-500">
              Describe what looks wrong on this page (wrong mark, wrong athlete, duplicate, missing result...).
              We&apos;ll review it against the source.
            </p>
            <textarea
              autoFocus
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              placeholder="What's wrong, and where on this page?"
              className="w-full bg-neutral-950 text-sm rounded px-3 py-2 border border-neutral-700 focus:outline-none focus:border-orange-500 resize-none"
            />
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] text-neutral-600">
                {status === "sent" ? "Thanks — sent." : status === "error" ? "Couldn't send, try again." : ""}
              </span>
              <button
                onClick={submit}
                disabled={status === "sending" || description.trim().length < 5}
                className="text-xs px-3 py-1.5 rounded bg-orange-500 text-black font-semibold disabled:opacity-40"
              >
                {status === "sending" ? "Sending…" : "Send report"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
