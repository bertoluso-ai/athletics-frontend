"use client";

import Script from "next/script";
import Link from "next/link";
import { useEffect, useState } from "react";

// Aviso de cookies + Google Analytics 4 con consentimiento previo (RGPD/ePrivacy):
//  * Barra a todo el ancho hasta que la persona elige: "Accept all" o "Cookie settings" (panel con categorias, "Reject all" y "Save choices").
//  * La eleccion se guarda en localStorage y se puede cambiar despues desde el enlace "Cookie settings" del pie (CookieSettingsLink).
//  * El script de Google solo se carga si la categoria Analytics esta aceptada Y existe NEXT_PUBLIC_GA_ID (se define en Vercel).
const GA_ID = process.env.NEXT_PUBLIC_GA_ID;
const KEY = "air-analytics-consent";
const OPEN_EVENT = "air-open-cookie-settings";

type Choice = "granted" | "denied" | null;

function readChoice(): Choice {
  try {
    const v = localStorage.getItem(KEY);
    return v === "granted" || v === "denied" ? v : null;
  } catch {
    return null;
  }
}

export function CookieSettingsLink({ className }: { className?: string }) {
  return (
    <button type="button" className={className} onClick={() => window.dispatchEvent(new Event(OPEN_EVENT))}>
      Cookie settings
    </button>
  );
}

export default function Analytics() {
  const [choice, setChoice] = useState<Choice>(null);
  const [ready, setReady] = useState(false);
  const [panel, setPanel] = useState(false);
  const [analyticsOn, setAnalyticsOn] = useState(false);

  useEffect(() => {
    const c = readChoice();
    setChoice(c);
    setAnalyticsOn(c === "granted");
    setReady(true);
    const open = () => {
      setAnalyticsOn(readChoice() === "granted");
      setPanel(true);
    };
    window.addEventListener(OPEN_EVENT, open);
    return () => window.removeEventListener(OPEN_EVENT, open);
  }, []);

  if (!ready) return null;

  const decide = (v: "granted" | "denied") => {
    try {
      localStorage.setItem(KEY, v);
    } catch {
      /* sin almacenamiento: la eleccion vale solo para esta visita */
    }
    setChoice(v);
    setAnalyticsOn(v === "granted");
    setPanel(false);
  };

  return (
    <>
      {GA_ID && choice === "granted" && (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" />
          <Script id="ga-init" strategy="afterInteractive">
            {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${GA_ID}', { anonymize_ip: true });`}
          </Script>
        </>
      )}

      {choice === null && !panel && (
        <div role="dialog" aria-label="Cookie consent" className="fixed z-50 inset-x-0 bottom-0 border-t border-neutral-700 bg-neutral-900 shadow-[0_-8px_30px_rgba(0,0,0,0.5)]">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 py-5 sm:py-4 pb-24 sm:pb-4 flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-8">
            <div className="flex-1 min-w-0">
              <p className="text-sm sm:text-base font-semibold text-neutral-100 mb-1">🍪 Help us make AthleticsInfoRanking better</p>
              <p className="text-xs sm:text-sm text-neutral-400 leading-relaxed">
                We use cookies to measure how the site is used and improve it. They are anonymous and you stay in control: you can fine-tune or change your choice at any time.{" "}
                <Link href="/cookies" className="underline underline-offset-2 hover:text-neutral-200">Cookie policy</Link>
              </p>
            </div>
            <div className="flex flex-col-reverse sm:flex-row sm:items-center gap-3 sm:gap-4 shrink-0">
              <button type="button" onClick={() => setPanel(true)} className="px-2 py-2 text-sm text-neutral-400 underline underline-offset-4 hover:text-neutral-200">
                Cookie settings
              </button>
              <button type="button" onClick={() => decide("granted")} className="px-8 py-3 sm:py-2.5 rounded-lg bg-orange-500 text-black text-sm font-bold hover:bg-orange-400">
                Accept all
              </button>
            </div>
          </div>
        </div>
      )}

      {panel && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/70 p-0 sm:p-4" role="dialog" aria-modal="true" aria-label="Cookie settings">
          <div className="w-full sm:max-w-lg max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl border border-neutral-700 bg-neutral-900 p-5 sm:p-6 text-neutral-200">
            <h2 className="text-base font-semibold mb-1">Cookie settings</h2>
            <p className="text-xs text-neutral-400 mb-4">Choose which cookies you allow. You can change this at any time from the footer.</p>

            <div className="rounded-lg border border-neutral-800 p-3 mb-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium">Strictly necessary</span>
                <span className="text-xs text-neutral-500">Always on</span>
              </div>
              <p className="text-xs text-neutral-500 mt-1">Needed for the site to work (for example, remembering this choice). They do not track you.</p>
            </div>

            <div className="rounded-lg border border-neutral-800 p-3 mb-5">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium">Analytics</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={analyticsOn}
                  aria-label="Analytics cookies"
                  onClick={() => setAnalyticsOn((v) => !v)}
                  className={`relative h-6 w-11 rounded-full transition-colors ${analyticsOn ? "bg-orange-500" : "bg-neutral-700"}`}
                >
                  <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${analyticsOn ? "left-[1.375rem]" : "left-0.5"}`} />
                </button>
              </div>
              <p className="text-xs text-neutral-500 mt-1">Google Analytics: anonymous statistics on which pages are visited, to improve the site.</p>
            </div>

            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
              <button type="button" onClick={() => decide("denied")} className="px-4 py-2.5 rounded-lg bg-neutral-800 text-sm text-neutral-200 hover:bg-neutral-700">
                Reject all
              </button>
              <button type="button" onClick={() => decide(analyticsOn ? "granted" : "denied")} className="px-4 py-2.5 rounded-lg bg-neutral-800 text-sm text-neutral-200 hover:bg-neutral-700">
                Save choices
              </button>
              <button type="button" onClick={() => decide("granted")} className="px-5 py-2.5 rounded-lg bg-orange-500 text-sm font-bold text-black hover:bg-orange-400">
                Accept all
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
