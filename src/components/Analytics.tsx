"use client";

import Link from "next/link";
import Script from "next/script";
import { useEffect, useState } from "react";

// Aviso de cookies + analitica (GTM/GA4) + publicidad (AdSense), siempre con consentimiento previo (RGPD/ePrivacy):
//  * Barra a todo el ancho hasta que la persona elige: "Accept all", "Reject all" o "Cookie settings" (panel por categorias).
//  * Categorias: Strictly necessary (siempre), Analytics, y Advertising (solo si hay publicidad activada: NEXT_PUBLIC_ADSENSE_PUB definido).
//  * La eleccion se guarda en localStorage y se cambia despues desde "Cookie settings" del pie (CookieSettingsLink).
//  * Nada de Google se carga sin consentimiento de la categoria correspondiente. GTM se carga si hay Analytics O Advertising aceptado y recibe
//    el estado en Consent Mode (analytics_storage / ad_storage / ad_user_data / ad_personalization).
//  * OJO UE/Reino Unido: para servir anuncios en el EEE, Google exige un CMP certificado (TCF v2.2). Este aviso a medida NO lo es: antes de abrir
//    la publicidad al publico hay que sustituirlo por Funding Choices (CMP gratuito de AdSense) u otro CMP certificado. Ver ADS_PUBLICIDAD.md.
const GA_ID = process.env.NEXT_PUBLIC_GA_ID;
const GTM_ID = process.env.NEXT_PUBLIC_GTM_ID;
// "pub-1234567890123456" (con o sin el prefijo "ca-")
const ADS_PUB = process.env.NEXT_PUBLIC_ADSENSE_PUB?.trim().replace(/^ca-/, "");
const ADS_ON = !!ADS_PUB;

const KEY = "air-consent-v2";
const LEGACY_KEY = "air-analytics-consent"; // v1: "granted" | "denied" (solo analitica)
const OPEN_EVENT = "air-open-cookie-settings";

type Consent = { analytics: boolean; advertising: boolean };

function readConsent(): Consent | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const v = JSON.parse(raw);
      return { analytics: v.analytics === true, advertising: ADS_ON && v.advertising === true };
    }
    const old = localStorage.getItem(LEGACY_KEY);
    if (old === "granted" || old === "denied") return { analytics: old === "granted", advertising: false };
  } catch {
    /* sin almacenamiento */
  }
  return null;
}

export function CookieSettingsLink({ className }: { className?: string }) {
  return (
    <button type="button" className={className} onClick={() => window.dispatchEvent(new Event(OPEN_EVENT))}>
      Cookie settings
    </button>
  );
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onChange}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${on ? "bg-orange-500" : "bg-neutral-700"}`}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${on ? "left-[1.375rem]" : "left-0.5"}`} />
    </button>
  );
}

export default function Analytics() {
  const [consent, setConsent] = useState<Consent | null>(null);
  const [ready, setReady] = useState(false);
  const [panel, setPanel] = useState(false);
  const [draft, setDraft] = useState<Consent>({ analytics: false, advertising: false });

  useEffect(() => {
    const c = readConsent();
    setConsent(c);
    setDraft(c ?? { analytics: false, advertising: false });
    setReady(true);
    const open = () => {
      const cur = readConsent();
      setDraft(cur ?? { analytics: false, advertising: false });
      setPanel(true);
    };
    window.addEventListener(OPEN_EVENT, open);
    return () => window.removeEventListener(OPEN_EVENT, open);
  }, []);

  if (!ready) return null;

  const decide = (c: Consent) => {
    const final = { analytics: c.analytics, advertising: ADS_ON && c.advertising };
    try {
      localStorage.setItem(KEY, JSON.stringify(final));
    } catch {
      /* sin almacenamiento: la eleccion vale solo para esta visita */
    }
    setConsent(final);
    setDraft(final);
    setPanel(false);
  };
  const acceptAll = () => decide({ analytics: true, advertising: true });
  const rejectAll = () => decide({ analytics: false, advertising: false });

  const anyGranted = !!consent && (consent.analytics || consent.advertising);
  const g = (v: boolean) => (v ? "granted" : "denied");

  return (
    <>
      {/* Con GTM (preferido) las etiquetas se gestionan en el contenedor; el consentimiento se informa en Consent Mode antes de cargarlo. */}
      {GTM_ID && anyGranted && consent && (
        <Script id="gtm-init" strategy="afterInteractive">
          {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('consent', 'default', { analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
gtag('consent', 'update', { analytics_storage: '${g(consent.analytics)}', ad_storage: '${g(consent.advertising)}', ad_user_data: '${g(consent.advertising)}', ad_personalization: '${g(consent.advertising)}' });
(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${GTM_ID}');`}
        </Script>
      )}
      {/* Sin GTM, alternativa directa con gtag (solo si no hay GTM_ID, para no contar dos veces). */}
      {!GTM_ID && GA_ID && consent?.analytics && (
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
      {/* Publicidad: AdSense (anuncios automaticos configurados en la consola de AdSense). Solo con la categoria Advertising aceptada. */}
      {ADS_ON && consent?.advertising && (
        <Script
          id="adsense"
          src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-${ADS_PUB}`}
          strategy="afterInteractive"
          crossOrigin="anonymous"
          async
        />
      )}

      {consent === null && !panel && (
        <div role="dialog" aria-label="Cookie consent" className="fixed z-50 inset-x-0 bottom-0 border-t border-neutral-700 bg-neutral-900 shadow-[0_-8px_30px_rgba(0,0,0,0.5)]">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 py-5 sm:py-4 pb-24 sm:pb-4 flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-8">
            <div className="flex-1 min-w-0">
              <p className="text-sm sm:text-base font-semibold text-neutral-100 mb-1">🍪 Help us make AthleticsInfoRanking better</p>
              <p className="text-xs sm:text-sm text-neutral-400 leading-relaxed">
                {ADS_ON
                  ? "We use cookies to measure how the site is used and to show ads that help keep it free. "
                  : "We use cookies to measure how the site is used and improve it. "}
                They are optional and you stay in control: you can fine-tune or change your choice at any time.{" "}
                <Link href="/cookies" className="underline underline-offset-2 hover:text-neutral-200">Cookie policy</Link>
              </p>
            </div>
            <div className="flex flex-col-reverse sm:flex-row sm:items-center gap-3 sm:gap-4 shrink-0">
              <button type="button" onClick={() => setPanel(true)} className="px-2 py-2 text-sm text-neutral-400 underline underline-offset-4 hover:text-neutral-200">
                Cookie settings
              </button>
              <button type="button" onClick={rejectAll} className="px-6 py-3 sm:py-2.5 rounded-lg border border-neutral-600 bg-neutral-800 text-neutral-200 text-sm font-semibold hover:bg-neutral-700">
                Reject all
              </button>
              <button type="button" onClick={acceptAll} className="px-8 py-3 sm:py-2.5 rounded-lg bg-orange-500 text-black text-sm font-bold hover:bg-orange-400">
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

            <div className={`rounded-lg border border-neutral-800 p-3 ${ADS_ON ? "mb-3" : "mb-5"}`}>
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium">Analytics</span>
                <Toggle on={draft.analytics} onChange={() => setDraft((d) => ({ ...d, analytics: !d.analytics }))} label="Analytics cookies" />
              </div>
              <p className="text-xs text-neutral-500 mt-1">Google Analytics: anonymous statistics on which pages are visited, to improve the site.</p>
            </div>

            {ADS_ON && (
              <div className="rounded-lg border border-neutral-800 p-3 mb-5">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium">Advertising</span>
                  <Toggle on={draft.advertising} onChange={() => setDraft((d) => ({ ...d, advertising: !d.advertising }))} label="Advertising cookies" />
                </div>
                <p className="text-xs text-neutral-500 mt-1">Google AdSense: shows ads that help keep the site free, and may personalise them based on your browsing. If you decline, no ads are loaded.</p>
              </div>
            )}

            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
              <button type="button" onClick={rejectAll} className="px-4 py-2.5 rounded-lg bg-neutral-800 text-sm text-neutral-200 hover:bg-neutral-700">
                Reject all
              </button>
              <button type="button" onClick={() => decide(draft)} className="px-4 py-2.5 rounded-lg bg-neutral-800 text-sm text-neutral-200 hover:bg-neutral-700">
                Save choices
              </button>
              <button type="button" onClick={acceptAll} className="px-5 py-2.5 rounded-lg bg-orange-500 text-sm font-bold text-black hover:bg-orange-400">
                Accept all
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
