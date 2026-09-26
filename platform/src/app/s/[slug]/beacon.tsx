"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

/** Sends one anonymous page-view beacon per navigation (first-party, no cookies). */
export function PageViewBeacon() {
  const pathname = usePathname();
  const first = useRef(true);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const payload = JSON.stringify({
      path: pathname,
      // The external referrer only matters on the landing page.
      referrer: first.current ? document.referrer : null,
      utmSource: params.get("utm_source"),
      utmCampaign: params.get("utm_campaign"),
    });
    first.current = false;
    try {
      if (!navigator.sendBeacon?.("/t", new Blob([payload], { type: "application/json" }))) {
        void fetch("/t", { method: "POST", body: payload, keepalive: true, headers: { "content-type": "application/json" } });
      }
    } catch {
      /* ignore */
    }
  }, [pathname]);
  return null;
}
