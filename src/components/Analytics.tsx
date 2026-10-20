"use client";

import Script from "next/script";
import { useEffect, useState } from "react";

// Google Analytics 4 con consentimiento previo (RGPD/ePrivacy):
//  * El aviso de cookies se muestra siempre hasta que la persona elige; la eleccion se guarda en localStorage.
//  * El script de Google solo se carga si la persona pulsa "Accept" Y existe NEXT_PUBLIC_GA_ID (se define en Vercel). Con "Decline" no se carga nunca.
//  * Las vistas de pagina entre rutas las registra GA4 por si mismo (medicion mejorada: cambios de historial).
const GA_ID = process.env.NEXT_PUBLIC_GA_ID;
const KEY = "air-analytics-consent";

type Choice = "granted" | "denied" | null;

function readChoice(): Choice {
  try {
    const v = localStorage.getItem(KEY);
    return v === "granted" || v === "denied" ? v : null;
  } catch {
    return null;
  }
}

export default function Analytics() {
  const [choice, setChoice] = useState<Choice>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setChoice(readChoice());
    setReady(true);
  }, []);

  if (!ready) return null;

  const decide = (v: "granted" | "denied") => {
    try {
      localStorage.setItem(KEY, v);
    } catch {
      /* sin almacenamiento: la eleccion vale solo para esta visita */
    }
    setChoice(v);
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
      {choice === null && (
        <div
          role="dialog"
          aria-label="Cookie consent"
          className="fixed z-50 left-3 right-3 bottom-[5.25rem] sm:left-4 sm:right-auto sm:bottom-4 sm:max-w-md flex items-center gap-3 rounded-full border border-neutral-800 bg-neutral-900/95 backdrop-blur pl-4 pr-1.5 py-1.5 shadow-lg text-xs text-neutral-300"
        >
          <p className="flex-1 min-w-0 leading-snug">
            <span aria-hidden>🍪</span> Help us improve: allow anonymous usage stats?
          </p>
          <button type="button" onClick={() => decide("denied")} className="shrink-0 px-1.5 py-1 text-neutral-500 hover:text-neutral-300">
            No thanks
          </button>
          <button type="button" onClick={() => decide("granted")} className="shrink-0 px-4 py-1.5 rounded-full bg-orange-500 text-black font-semibold hover:bg-orange-400">
            Accept
          </button>
        </div>
      )}
    </>
  );
}
