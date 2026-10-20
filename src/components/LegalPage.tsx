import type { ReactNode } from "react";
import { LEGAL } from "@/lib/legal";

// Marco comun de las paginas legales/tecnicas: titulo, fecha de revision y tipografia de lectura.
export default function LegalPage({ title, intro, children }: { title: string; intro?: string; children: ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 sm:px-6 py-8 sm:py-12 text-neutral-300">
      <h1 className="text-2xl sm:text-3xl font-bold text-neutral-100 mb-2">{title}</h1>
      <p className="text-xs text-neutral-500 mb-6">Last updated: {LEGAL.lastUpdated}</p>
      {intro && <p className="text-base text-neutral-300 mb-6 leading-relaxed">{intro}</p>}
      <div
        className="text-sm leading-relaxed
          [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-neutral-100 [&_h2]:mt-8 [&_h2]:mb-2
          [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-neutral-200 [&_h3]:mt-4 [&_h3]:mb-1
          [&_p]:mb-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-3 [&_ul]:space-y-1
          [&_a]:text-orange-400 [&_a:hover]:underline
          [&_table]:w-full [&_table]:text-left [&_table]:text-xs [&_table]:mb-4 [&_th]:py-2 [&_th]:pr-3 [&_th]:text-neutral-400 [&_th]:font-medium
          [&_td]:py-2 [&_td]:pr-3 [&_td]:align-top [&_tr]:border-b [&_tr]:border-neutral-800"
      >
        {children}
      </div>
    </main>
  );
}

export function Contact() {
  return <a href={`mailto:${LEGAL.contactEmail}`}>{LEGAL.contactEmail}</a>;
}
