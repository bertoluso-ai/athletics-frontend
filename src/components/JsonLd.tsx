// Datos estructurados (schema.org) para buscadores. Se serializa como JSON dentro de un <script type="application/ld+json">.
// Se escapa "<" para que ningun texto (nombres de atletas, reuniones) pueda cerrar la etiqueta <script>.
export default function JsonLd({ data }: { data: Record<string, unknown> | Record<string, unknown>[] }) {
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}

export const SITE_URL = "https://athleticsinforanking.com";

export function breadcrumbs(items: { name: string; path: string }[]): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: `${SITE_URL}${it.path}` })),
  };
}
