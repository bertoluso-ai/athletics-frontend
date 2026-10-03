// Shown while this (data-heavy, fully dynamic) page's server render is
// in flight, so navigation here doesn't show a blank gap.
export default function Loading() {
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <main className="mx-auto max-w-7xl px-3 sm:px-6 py-6 animate-pulse">
        <div className="h-7 w-48 bg-neutral-800 rounded mb-4" />
        <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 mb-8">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="aspect-[3/4] bg-neutral-900/60 rounded-md border border-neutral-800" />
          ))}
        </div>
        <div className="h-64 bg-neutral-900/60 rounded-lg border border-neutral-800" />
      </main>
    </div>
  );
}
