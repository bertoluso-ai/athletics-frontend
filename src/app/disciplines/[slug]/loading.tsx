import Header from "@/components/Header";

// Shown by Next.js while the page's (data-heavy) server render is in
// flight -- without this, navigating here showed a brief blank gap under
// Header where the page content hadn't painted yet but ReportErrorLink
// (rendered in the root layout, after {children}) already had, making it
// look like it had jumped to the very top of an otherwise empty page.
export default function Loading() {
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <Header />
      <main className="mx-auto max-w-7xl px-3 sm:px-6 py-6 animate-pulse">
        <div className="h-7 w-40 bg-neutral-800 rounded mb-4" />
        <div className="flex gap-2 mb-6">
          <div className="h-8 w-20 bg-neutral-800 rounded" />
          <div className="h-8 w-24 bg-neutral-800 rounded" />
          <div className="h-8 w-28 bg-neutral-800 rounded" />
        </div>
        <div className="h-64 bg-neutral-900/60 rounded-lg border border-neutral-800" />
      </main>
    </div>
  );
}
