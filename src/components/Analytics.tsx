"use client";

import Script from "next/script";
import { useEffect, useState } from "react";

// Google Analytics 4 con consentimiento previo (RGPD/ePrivacy):
//  * Sin NEXT_PUBLIC_GA_ID no hace nada (ni script, ni aviso): se activa solo al definir la variable en Vercel.
//  * El script de Google NO se carga hasta que la persona pulsa "Accept". Con "Decline" no se carga nunca ni se guarda nada salvo la eleccion (localStorage).
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

  if (!GA_ID || !ready) return null;

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
      {choice === "granted" && (
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
          className="fixed z-50 left-2 right-2 bottom-20 sm:left-auto sm:right-4 sm:bottom-4 sm:max-w-sm rounded-lg border border-neutral-700 bg-neutral-900 p-3 shadow-lg text-xs text-neutral-300"
        >
          <p className="mb-2">We use Google Analytics to understand how the site is used. It only loads if you accept; no other tracking.</p>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => decide("denied")} className="px-3 py-1.5 rounded bg-neutral-800 text-neutral-300 hover:bg-neutral-700">
              Decline
            </button>
            <button type="button" onClick={() => decide("granted")} className="px-3 py-1.5 rounded bg-orange-500 text-black font-semibold hover:bg-orange-400">
              Accept
            </button>
          </div>
        </div>
      )}
    </>
  );
}
