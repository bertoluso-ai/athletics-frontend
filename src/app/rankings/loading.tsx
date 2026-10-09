// Shown while this (data-heavy, fully dynamic) page's server render is
// in flight, so navigation here doesn't show a blank gap.
export default function Loading() {
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <main className="mx-auto max-w-7xl px-2 sm:px-6 py-6 animate-pulse">
        <div className="h-7 w-32 bg-neutral-800 rounded mb-4" />
        <div className="flex gap-2 mb-6">
          <div className="h-8 w-20 bg-neutral-800 rounded" />
          <div className="h-8 w-24 bg-neutral-800 rounded" />
        </div>
        <div className="h-64 bg-neutral-900/60 rounded-lg border border-neutral-800" />
      </main>
    </div>
  );
}
