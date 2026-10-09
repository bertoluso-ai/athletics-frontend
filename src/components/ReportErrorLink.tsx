"use client";

import { useState, useEffect } from "react";

// Discreet "report a data error" link, same treatment as PhotoCreditsToast:
// one small line, out of the way, never floating over content. No backend
// write path at all -- just opens the visitor's email client with the page
// URL pre-filled, like ProCyclingStats' own report-an-error link.
export default function ReportErrorLink() {
  const [pageUrl, setPageUrl] = useState("");

  useEffect(() => {
    setPageUrl(window.location.href);
  }, []);

  const href =
    "mailto:bertoluso@gmail.com?subject=" +
    encodeURIComponent("athleticsinforanking.com - data error report") +
    "&body=" +
    encodeURIComponent(`Page: ${pageUrl}\nWhat looks wrong: \n`);

  return (
    <a href={href} className="text-[11px] text-neutral-600 hover:text-neutral-400">
      Report a data error
    </a>
  );
}
