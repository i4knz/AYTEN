"use client";

import Script from "next/script";
import { useEffect, useState } from "react";

type Tracking = { ga4?: string; gtm?: string; metaPixel?: string; tiktokPixel?: string; snapPixel?: string };
const KEY = "ayten_consent";

function readConsent(): "all" | "essential" | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === "all" || v === "essential" ? v : null;
  } catch {
    return null;
  }
}

/**
 * Loads marketing pixels only after the shopper accepts marketing cookies.
 * IDs are validated server-side (format only), and the snippets are the
 * providers' standard loaders with the ID JSON-encoded.
 */
export function StoreTracking({ tracking }: { tracking: Tracking }) {
  const [consent, setConsent] = useState<"all" | "essential" | null | "unknown">("unknown");
  useEffect(() => {
    // Reading localStorage must happen after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setConsent(readConsent());
  }, []);
  const hasAny = Object.values(tracking).some(Boolean);

  if (!hasAny) return null;
  const j = (v: string) => JSON.stringify(v);
  const choose = (v: "all" | "essential") => {
    try {
      localStorage.setItem(KEY, v);
    } catch {
      /* private mode: consent applies to this page view only */
    }
    setConsent(v);
  };

  return (
    <>
      {consent === null && (
        <div role="dialog" aria-label="ملفات تعريف الارتباط" className="fixed inset-x-3 bottom-3 z-50 mx-auto flex max-w-xl flex-col gap-3 rounded-(--radius) border border-line bg-surface p-4 text-sm shadow-xl sm:flex-row sm:items-center">
          <p className="flex-1">نستخدم ملفات تعريف الارتباط لقياس الزيارات وتحسين الإعلانات. يمكنك قبولها أو الاكتفاء بالضروري منها.</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => choose("all")} className="rounded-(--radius) bg-(--store) px-4 py-2 text-(--on-store)">قبول</button>
            <button type="button" onClick={() => choose("essential")} className="rounded-(--radius) border border-line px-4 py-2">الضروري فقط</button>
          </div>
        </div>
      )}
      {consent === "all" && (
        <>
          {tracking.ga4 && (
            <>
              <Script src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(tracking.ga4)}`} strategy="afterInteractive" />
              <Script id="ga4" strategy="afterInteractive">{`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}window.gtag=gtag;gtag('js',new Date());gtag('config',${j(tracking.ga4)});`}</Script>
            </>
          )}
          {tracking.gtm && (
            <Script id="gtm" strategy="afterInteractive">{`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer',${j(tracking.gtm)});`}</Script>
          )}
          {tracking.metaPixel && (
            <Script id="meta-pixel" strategy="afterInteractive">{`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init',${j(tracking.metaPixel)});fbq('track','PageView');`}</Script>
          )}
          {tracking.tiktokPixel && (
            <Script id="tiktok-pixel" strategy="afterInteractive">{`!function(w,d,t){w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie"],ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.load=function(e,n){var i="https://analytics.tiktok.com/i18n/pixel/events.js";ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=i,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};var o=d.createElement("script");o.type="text/javascript",o.async=!0,o.src=i+"?sdkid="+e+"&lib="+t;var a=d.getElementsByTagName("script")[0];a.parentNode.insertBefore(o,a)};ttq.load(${j(tracking.tiktokPixel)});ttq.page();}(window,document,'ttq');`}</Script>
          )}
          {tracking.snapPixel && (
            <Script id="snap-pixel" strategy="afterInteractive">{`(function(e,t,n){if(e.snaptr)return;var a=e.snaptr=function(){a.handleRequest?a.handleRequest.apply(a,arguments):a.queue.push(arguments)};a.queue=[];var s='script';var r=t.createElement(s);r.async=!0;r.src=n;var u=t.getElementsByTagName(s)[0];u.parentNode.insertBefore(r,u);})(window,document,'https://sc-static.net/scevent.min.js');snaptr('init',${j(tracking.snapPixel)});snaptr('track','PAGE_VIEW');`}</Script>
          )}
        </>
      )}
    </>
  );
}

/** Fires purchase conversion events once, only if the shopper consented and pixels are loaded. */
export function PurchaseEvent({ id, value, currency }: { id: string; value: number; currency: string }) {
  useEffect(() => {
    if (readConsent() !== "all") return;
    const w = window as unknown as { gtag?: (...a: unknown[]) => void; fbq?: (...a: unknown[]) => void; ttq?: { track: (...a: unknown[]) => void }; snaptr?: (...a: unknown[]) => void };
    const amount = value / 100;
    const sentKey = `ayten_purchase_${id}`;
    try {
      if (sessionStorage.getItem(sentKey)) return;
      sessionStorage.setItem(sentKey, "1");
    } catch {
      /* ignore */
    }
    const t = setTimeout(() => {
      w.gtag?.("event", "purchase", { transaction_id: id, value: amount, currency });
      w.fbq?.("track", "Purchase", { value: amount, currency });
      w.ttq?.track("CompletePayment", { value: amount, currency });
      w.snaptr?.("track", "PURCHASE", { price: amount, currency, transaction_id: id });
    }, 1500);
    return () => clearTimeout(t);
  }, [id, value, currency]);
  return null;
}
