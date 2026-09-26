"use client";

import { useState, useTransition } from "react";
import { remindCartAction } from "../campaign-actions";

export function RemindButtons({ storeId, cartId, hasEmail, reminded, whatsappUrl }: { storeId: string; cartId: string; hasEmail: boolean; reminded: boolean; whatsappUrl: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <a
        href={whatsappUrl}
        target="_blank"
        rel="noopener"
        onClick={() => start(async () => void (await remindCartAction(storeId, cartId, "whatsapp")))}
        className="rounded-lg bg-[#25D366] px-3 py-1.5 text-white"
      >
        تذكير عبر واتساب
      </a>
      {hasEmail && (
        <button type="button" disabled={pending} onClick={() => start(async () => setMsg((await remindCartAction(storeId, cartId, "email")).message ?? null))} className="rounded-lg border border-line px-3 py-1.5">
          تذكير بالبريد
        </button>
      )}
      {reminded && <span className="text-xs text-ink-soft">تم التذكير سابقاً</span>}
      {msg && <span className="text-xs text-emerald-700">{msg}</span>}
    </div>
  );
}
