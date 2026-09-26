"use client";

import { useActionState, useState, useTransition } from "react";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Button } from "@/components/ui";
import type { FormState } from "@/server/web";
import { cancelRenewalAction, requestInvoiceAction } from "./actions";

export type PlanCard = {
  id: string;
  name: string;
  description: string;
  monthly: string;
  yearly: string;
  yearlySaving: string | null;
  lines: string[];
  current: boolean;
  free: boolean;
};

export function PlanPicker({ storeId, plans, canManage, hasOpenInvoice }: { storeId: string; plans: PlanCard[]; canManage: boolean; hasOpenInvoice: boolean }) {
  const [interval, setInterval] = useState<"monthly" | "yearly">("monthly");
  const [state, action] = useActionState<FormState, FormData>(requestInvoiceAction.bind(null, storeId), {});
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">الباقات</h2>
        <div role="radiogroup" aria-label="مدة الاشتراك" className="flex rounded-full border border-line bg-surface p-1 text-sm">
          {(["monthly", "yearly"] as const).map((v) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={interval === v}
              onClick={() => setInterval(v)}
              className="rounded-full px-4 py-1.5 aria-checked:bg-ink aria-checked:text-white"
            >
              {v === "monthly" ? "شهري" : "سنوي"}
            </button>
          ))}
        </div>
      </div>
      {state.message && <Alert tone={state.ok ? "success" : "error"}>{state.message}</Alert>}
      <div className="grid gap-4 md:grid-cols-3">
        {plans.map((p) => (
          <form key={p.id} action={action} className={`flex flex-col gap-3 rounded-2xl border bg-surface p-5 ${p.current ? "border-brand ring-2 ring-brand/20" : "border-line"}`}>
            <input type="hidden" name="planId" value={p.id} />
            <input type="hidden" name="interval" value={interval} />
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-bold">{p.name}</h3>
              {p.current && <span className="rounded-full bg-brand-soft px-2 py-0.5 text-xs text-brand-strong">باقتك الحالية</span>}
            </div>
            <p className="min-h-10 text-sm text-ink-soft">{p.description}</p>
            <p className="text-2xl font-bold">
              {p.free ? "مجانية" : interval === "monthly" ? p.monthly : p.yearly}
              {!p.free && <span className="text-sm font-normal text-ink-soft"> / {interval === "monthly" ? "شهر" : "سنة"}</span>}
            </p>
            {interval === "yearly" && p.yearlySaving && <p className="text-xs text-emerald-700">توفّر {p.yearlySaving} مقارنة بالدفع الشهري</p>}
            <ul className="flex flex-1 flex-col gap-1.5 text-sm">
              {p.lines.map((l) => (
                <li key={l} className="flex gap-2">
                  <span aria-hidden className="text-brand">✓</span>
                  {l}
                </li>
              ))}
            </ul>
            {!p.free && canManage && !hasOpenInvoice && (
              <SubmitButton tone={p.current ? "secondary" : "primary"} pendingText="جارٍ إصدار الفاتورة…">
                {p.current ? "تجديد الباقة" : "الترقية لهذه الباقة"}
              </SubmitButton>
            )}
          </form>
        ))}
      </div>
      {hasOpenInvoice && <p className="text-sm text-ink-soft">لديك فاتورة بانتظار الدفع؛ ادفعها أولاً قبل طلب فاتورة أخرى.</p>}
      {!canManage && <p className="text-sm text-ink-soft">تغيير الباقة متاح لمالك المتجر فقط.</p>}
    </div>
  );
}

export function RenewalToggle({ storeId, cancelAtPeriodEnd }: { storeId: string; cancelAtPeriodEnd: boolean }) {
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      tone={cancelAtPeriodEnd ? "primary" : "secondary"}
      disabled={pending}
      onClick={() => {
        if (!cancelAtPeriodEnd && !confirm("إلغاء التجديد؟ يبقى اشتراكك فعالاً حتى نهاية الفترة المدفوعة.")) return;
        start(() => cancelRenewalAction(storeId, !cancelAtPeriodEnd));
      }}
    >
      {cancelAtPeriodEnd ? "استئناف التجديد" : "إلغاء التجديد"}
    </Button>
  );
}
