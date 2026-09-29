import { redirect } from "next/navigation";

// /events/[slug] moved to /disciplines/[slug] -- kept as a redirect so
// old links (search results, external bookmarks) still land somewhere.
export default async function EventPageRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === "string") q.set(k, v);
  }
  const qs = q.toString();
  redirect(`/disciplines/${slug}${qs ? `?${qs}` : ""}`);
}
