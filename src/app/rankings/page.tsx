import { Suspense } from "react";
import Header from "@/components/Header";
import RankingsExplorer from "@/components/RankingsExplorer";

export default function RankingsPage() {
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <Header />
      <main className="mx-auto max-w-4xl px-6 py-6">
        <h1 className="text-2xl font-bold mb-6">Rankings</h1>
        <Suspense fallback={<div className="text-sm text-neutral-500">Loading…</div>}>
          <RankingsExplorer />
        </Suspense>
      </main>
    </div>
  );
}
