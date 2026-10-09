import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Header from "@/components/Header";
import MobileNav from "@/components/MobileNav";
import ReportErrorLink from "@/components/ReportErrorLink";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased bg-neutral-950`}
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
        </footer>
        <MobileNav />
      </body>
    </html>
  );
}
