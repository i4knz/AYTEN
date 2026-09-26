"use client";

import { useActionState, useTransition } from "react";
import type { FormState } from "@/server/web";
import { couponAction, updateQuantityAction } from "../actions";

export function QuantityControl({ slug, variantId, quantity, max, name }: { slug: string; variantId: string; quantity: number; max: number; name: string }) {
  const [pending, start] = useTransition();
  const set = (q: number) => start(() => updateQuantityAction(slug, variantId, q));
  return (
    <div className="flex flex-col items-end justify-between gap-2">
      <div className="flex items-center rounded-full border border-line" aria-busy={pending}>
        <button type="button" disabled={pending || quantity >= Math.min(max, 99)} onClick={() => set(quantity + 1)} className="px-3 py-1 text-lg disabled:opacity-40" aria-label={`زيادة كمية ${name}`}>
          +
        </button>
        <span className="min-w-6 text-center text-sm" aria-live="polite">
          {quantity}
        </span>
        <button type="button" disabled={pending || quantity <= 1} onClick={() => set(quantity - 1)} className="px-3 py-1 text-lg disabled:opacity-40" aria-label={`تقليل كمية ${name}`}>
          −
        </button>
      </div>
      <button type="button" disabled={pending} onClick={() => set(0)} className="text-xs text-red-700" aria-label={`حذف ${name} من السلة`}>
        حذف
      </button>
    </div>
  );
}

export function CouponForm({ slug, code, message }: { slug: string; code: string | null; message: string | null }) {
  const [state, action, pending] = useActionState<FormState, FormData>(couponAction.bind(null, slug), {});
  if (code) {
    return (
      <form action={action} className="flex flex-col gap-1 text-sm">
        <input type="hidden" name="remove" value="1" />
        <div className="flex items-center justify-between rounded-(--radius) bg-muted px-3 py-2">
          <span>
            كوبون: <strong className="ltr">{code}</strong>
          </span>
          <button type="submit" disabled={pending} className="text-xs text-red-700">
            إزالة
          </button>
        </div>
        {message && <p className="text-xs text-amber-700">{message}</p>}
      </form>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-1">
      <div className="flex gap-2">
        <input name="code" placeholder="كود الخصم" aria-label="كود الخصم" dir="ltr" className="min-w-0 flex-1 rounded-(--radius) border border-line px-3 py-2 text-sm uppercase" />
        <button type="submit" disabled={pending} className="rounded-(--radius) border border-line px-3 py-2 text-sm">
          تطبيق
        </button>
      </div>
      {state.message && <p className={`text-xs ${state.ok ? "text-emerald-700" : "text-red-700"}`}>{state.message}</p>}
    </form>
  );
}
