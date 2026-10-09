// Page title: the same pale-blue bar as the section headers of the home.
export default function PageBar({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 bg-tint text-neutral-100 px-3 sm:px-4 py-2 rounded-lg mb-3">
      <h1 className="text-[13px] font-extrabold uppercase tracking-wide">{title}</h1>
      {children}
    </div>
  );
}
