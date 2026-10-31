import type { Metadata } from "next";
import Link from "next/link";
import { Geist_Mono } from "next/font/google";
import Header from "@/components/Header";
import MobileNav from "@/components/MobileNav";
import ReportErrorLink from "@/components/ReportErrorLink";
import Analytics, { CookieSettingsLink } from "@/components/Analytics";
import "./globals.css";

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AthleticsInfoRanking - Athletics results, rankings and records",
  description: "Athletics results, rankings and records: track & field, road running and race walking, from Diamond League to national championships.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistMono.variable} h-full antialiased bg-neutral-950`}
    >
      <body className="min-h-full flex flex-col pb-24 sm:pb-0 bg-neutral-950">
        <Header />
        {children}
        <footer className="mx-auto w-full max-w-7xl px-2 sm:px-6 pb-6">
          {/* starts where the text inside the tables starts (card border + cell padding) */}
          <div className="pl-[13px] flex flex-wrap items-start gap-x-10 gap-y-2">
            <div id="photo-credits-slot" className="contents" />
            <ReportErrorLink />
          </div>
          <nav aria-label="Legal and information" className="pl-[13px] mt-4 pt-3 border-t border-neutral-900 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-neutral-500">
            <span className="text-neutral-500">&copy; {new Date().getFullYear()} AthleticsInfoRanking</span>
            <Link href="/about" className="hover:text-neutral-300">About &amp; data</Link>
            <Link href="/privacy" className="hover:text-neutral-300">Privacy</Link>
            <Link href="/cookies" className="hover:text-neutral-300">Cookies</Link>
            <Link href="/terms" className="hover:text-neutral-300">Terms</Link>
            <Link href="/legal-notice" className="hover:text-neutral-300">Legal notice</Link>
            <CookieSettingsLink className="hover:text-neutral-300" />
          </nav>
        </footer>
        <MobileNav />
        <Analytics />
      </body>
    </html>
  );
}
