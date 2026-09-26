"use client";

import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Card, Input } from "@/components/ui";
import type { FormState } from "@/server/web";
import { orderAction } from "../actions";

type OrderInfo = {
  id: string;
  status: "open" | "completed" | "cancelled";
  paymentStatus: string;
  paymentMethod: "cod" | "bank_transfer" | "online";
  fulfillmentStatus: string;
  remaining: number;
  pickup: boolean;
};

function ActionForm({ storeId, orderId, action, children, label, tone, pendingText }: { storeId: string; orderId: string; action: Parameters<typeof orderAction>[2]; children?: React.ReactNode; label: string; tone?: "primary" | "secondary" | "danger"; pendingText?: string }) {
  const [state, run] = useActionState<FormState, FormData>(orderAction.bind(null, storeId, orderId, action), {});
  return (
    <form action={run} className="flex flex-col gap-2">
      {children}
      <SubmitButton tone={tone} pendingText={pendingText ?? "…"}>
        {label}
      </SubmitButton>
      {state.message && !state.ok && <Alert>{state.message}</Alert>}
    </form>
  );
}

export function OrderActions({ storeId, order }: { storeId: string; order: OrderInfo }) {
  const [panel, setPanel] = useState<"ship" | "cancel" | "refund" | null>(null);
  const open = order.status === "open";
  const f = order.fulfillmentStatus;
  const canMarkPaid = open && order.paymentMethod !== "online" && ["pending", "awaiting_transfer"].includes(order.paymentStatus);
  const canRefund = ["paid", "partially_refunded"].includes(order.paymentStatus) && order.remaining > 0;
  const awaitingOnline = order.paymentMethod === "online" && order.paymentStatus !== "paid";

  if (!open && !canRefund) return null;
  return (
    <Card className="flex flex-col gap-4">
      <h2 className="font-semibold">إجراءات الطلب</h2>
      {awaitingOnline && open && <Alert tone="info">بانتظار اكتمال الدفع الإلكتروني. يُحدَّث تلقائياً من بوابة الدفع.</Alert>}
      <div className="flex flex-wrap gap-2">
        {open && f === "unfulfilled" && <ActionForm storeId={storeId} orderId={order.id} action="processing" label="بدء التجهيز" />}
        {open && (f === "unfulfilled" || f === "processing") && <ActionForm storeId={storeId} orderId={order.id} action="ready" label="جاهز للشحن" tone="secondary" />}
        {open && ["unfulfilled", "processing", "ready"].includes(f) && !awaitingOnline && (
          <button type="button" onClick={() => setPanel(panel === "ship" ? null : "ship")} className="rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white">
            {order.pickup ? "جاهز للاستلام" : "شحن الطلب"}
          </button>
        )}
        {open && f === "shipped" && <ActionForm storeId={storeId} orderId={order.id} action="delivered" label={order.pickup ? "تم الاستلام" : "تم التسليم"} />}
        {canMarkPaid && (
          <ActionForm storeId={storeId} orderId={order.id} action="paid" label={order.paymentMethod === "cod" ? "تم تحصيل المبلغ" : "تأكيد استلام التحويل"} tone="secondary" />
        )}
        {canRefund && (
          <button type="button" onClick={() => setPanel(panel === "refund" ? null : "refund")} className="rounded-xl border border-line px-4 py-2.5 text-sm">
            تسجيل استرداد
          </button>
        )}
        {open && f !== "delivered" && (
          <button type="button" onClick={() => setPanel(panel === "cancel" ? null : "cancel")} className="rounded-xl px-4 py-2.5 text-sm text-red-700 hover:bg-red-50">
            إلغاء الطلب
          </button>
        )}
      </div>

      {panel === "ship" && (
        <ActionForm storeId={storeId} orderId={order.id} action="ship" label="تأكيد الشحن" pendingText="جارٍ الحفظ…">
          {!order.pickup && (
            <div className="grid gap-2 sm:grid-cols-3">
              <Input name="carrier" placeholder="شركة الشحن (مثل سمسا)" aria-label="شركة الشحن" />
              <Input name="trackingNumber" placeholder="رقم التتبع" aria-label="رقم التتبع" dir="ltr" />
              <Input name="trackingUrl" placeholder="https://… رابط التتبع" aria-label="رابط التتبع" dir="ltr" />
            </div>
          )}
          <p className="text-xs text-ink-soft">يُخصم المخزون المحجوز عند الشحن.</p>
        </ActionForm>
      )}
      {panel === "cancel" && (
        <ActionForm storeId={storeId} orderId={order.id} action="cancel" label="تأكيد الإلغاء" tone="danger">
          <Input name="reason" required placeholder="سبب الإلغاء" aria-label="سبب الإلغاء" />
          {f === "shipped" && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="restock" defaultChecked className="accent-brand" /> أعِد الكميات للمخزون (وصلت البضاعة المرتجعة)
            </label>
          )}
          {f !== "shipped" && <input type="hidden" name="restock" value="on" />}
          {["paid", "partially_refunded"].includes(order.paymentStatus) && <p className="text-xs text-amber-800">الطلب مدفوع. سجّل الاسترداد بعد الإلغاء.</p>}
        </ActionForm>
      )}
      {panel === "refund" && (
        <ActionForm storeId={storeId} orderId={order.id} action="refund" label="تسجيل الاسترداد" tone="secondary">
          <div className="grid gap-2 sm:grid-cols-2">
            <Input name="amount" inputMode="decimal" dir="ltr" required placeholder={`حتى ${(order.remaining / 100).toFixed(2)}`} aria-label="المبلغ المسترد" />
            <Input name="reason" placeholder="السبب (اختياري)" aria-label="سبب الاسترداد" />
          </div>
          <p className="text-xs text-ink-soft">سجّل المبلغ بعد إعادته للعميل (نقداً أو تحويلاً).</p>
        </ActionForm>
      )}
    </Card>
  );
}

export function NoteForm({ storeId, orderId }: { storeId: string; orderId: string }) {
  const [state, run] = useActionState<FormState, FormData>(orderAction.bind(null, storeId, orderId, "note"), {});
  return (
    <form action={run} className="flex flex-col gap-2">
      <textarea name="body" rows={2} maxLength={2000} required placeholder="أضف ملاحظة للفريق" aria-label="ملاحظة داخلية" className="rounded-xl border border-line px-3 py-2 text-sm" />
      <SubmitButton tone="secondary" pendingText="…" className="self-start">
        إضافة
      </SubmitButton>
      {state.message && !state.ok && <p className="text-xs text-red-700">{state.message}</p>}
    </form>
  );
}
