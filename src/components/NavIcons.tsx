// The five navigation icons, shared by the bottom mobile bar and the page
// header bars so a section looks the same everywhere.
export type NavIconName = "home" | "meets" | "rankings" | "countries" | "disciplines";

const PATHS: Record<NavIconName, React.ReactNode> = {
  home: <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1v-9.5Z" />,
  meets: <path d="M7 2v2H6a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-1V2h-2v2H9V2H7Zm-1 6h12v11H6V8Z" />,
  rankings: <path d="M4 20V10h4v10H4Zm6 0V4h4v16h-4Zm6 0v-7h4v7h-4Z" />,
  countries: <path d="M5 21V4h1.5v1H19l-2.5 4.5L19 14H6.5v7H5Z" />,
  disciplines: <path d="M4 4h7v7H4V4Zm9 0h7v7h-7V4ZM4 13h7v7H4v-7Zm9 0h7v7h-7v-7Z" />,
};

export default function NavIcon({ name, className = "w-4 h-4" }: { name: NavIconName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      {PATHS[name]}
    </svg>
  );
}
