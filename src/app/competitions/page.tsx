import Header from "@/components/Header";
import CompetitionsExplorer from "@/components/CompetitionsExplorer";

export default function CompetitionsPage() {
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <Header />
      <main className="mx-auto max-w-7xl px-3 sm:px-6 py-6">
        <h1 className="text-2xl font-bold mb-1">Competitions</h1>
        <p className="text-sm text-neutral-500 mb-6">
          Browse every raw competition name as scraped, filtered by gender, tier, year and discipline.
          The line below a name (if any) shows which series it's grouped under.
        </p>
        <CompetitionsExplorer />
      </main>
    </div>
  );
}
