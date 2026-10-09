import NavIcon, { type NavIconName } from "./NavIcons";

// Page title: the same pale-blue bar as the section headers of the home. A
// fixed height (also used by the Meets bar, which carries the view switch) so
// every page header measures the same.
export default function PageBar({ title, icon, children }: { title: string; icon?: NavIconName; children?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 h-9 bg-tint text-neutral-100 px-3 sm:px-4 rounded-lg mb-3">
      <h1 className="flex items-center gap-2 text-[13px] font-extrabold uppercase tracking-wide">
        {icon && <NavIcon name={icon} className="w-4 h-4 shrink-0 text-neutral-400" />}
        {title}
      </h1>
      {children}
    </div>
  );
}
