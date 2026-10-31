import { flagUrl } from "@/lib/flags";

export default function Flag({ code, className = "" }: { code: string | null | undefined; className?: string }) {
  const url = flagUrl(code);
  if (!url) return <span className={`inline-block w-4 h-3 rounded-sm bg-neutral-700 ${className}`} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      aria-hidden="true"
      title={code ?? ""}
      width={16}
      height={12}
      loading="lazy"
      decoding="async"
      className={`inline-block w-4 h-3 rounded-sm object-cover object-left ${className}`}
    />
  );
}
