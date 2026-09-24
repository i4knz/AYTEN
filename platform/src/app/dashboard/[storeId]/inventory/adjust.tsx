"use client";

import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { Input, Select } from "@/components/ui";
import type { FormState } from "@/server/web";
import { adjustInventoryAction } from "../products/actions";

export function AdjustStock({ storeId, variantId, label }: { storeId: string; variantId: string; label: string }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<FormState, FormData>(adjustInventoryAction.bind(null, storeId, variantId), {});
  if (!open) {
    return (
      <button type="button" className="text-sm text-brand" onClick={() => setOpen(true)} aria-label={`تعديل كمية ${label}`}>
        تعديل
      </button>
    );
  }
  return (
    <form action={action} className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
      <Select name="mode" defaultValue="add" aria-label="نوع التعديل" className="w-auto">
        <option value="add">إضافة / خصم</option>
        <option value="set">تعيين الكمية</option>
      </Select>
      <Input name="quantity" inputMode="numeric" dir="ltr" required placeholder="مثل 5 أو ‎-2" aria-label="الكمية" className="w-24" />
      <Input name="note" maxLength={500} placeholder="السبب (اختياري)" aria-label="سبب التعديل" className="w-36" />
      <SubmitButton pendingText="…">حفظ</SubmitButton>
      <button type="button" className="text-sm text-ink-soft" onClick={() => setOpen(false)}>
        إغلاق
      </button>
      {state.message && <p className={`w-full text-xs ${state.ok ? "text-emerald-700" : "text-red-700"}`}>{state.fieldErrors?.quantity ?? state.message}</p>}
    </form>
  );
}
