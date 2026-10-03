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
  title: "AthleticsInfoRanking",
  description: "Historical athletics statistics",
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
        <ReportErrorLink />
        <MobileNav />
      </body>
    </html>
  );
}
