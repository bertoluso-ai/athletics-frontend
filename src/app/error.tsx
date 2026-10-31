"use client";

import Link from "next/link";
import ReportErrorLink from "@/components/ReportErrorLink";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 sm:px-6 py-16 text-neutral-100">
      <p className="text-xs uppercase tracking-wider text-neutral-500">Something went wrong</p>
      <h1 className="mt-1 text-2xl font-semibold">This page failed to load</h1>
      <p className="mt-2 text-sm text-neutral-400">
        It is usually temporary (the data service was slow or unavailable). Try again in a moment.
      </p>
      <div className="mt-5 flex flex-wrap items-center gap-3 text-sm">
        <button type="button" onClick={reset} className="px-4 py-2 rounded bg-orange-500 text-black font-semibold hover:bg-orange-600">
          Try again
        </button>
        <Link href="/" className="px-3 py-2 rounded border border-neutral-700 text-neutral-300 hover:bg-neutral-800">
          Go to the home page
        </Link>
        <ReportErrorLink />
      </div>
    </main>
  );
}
