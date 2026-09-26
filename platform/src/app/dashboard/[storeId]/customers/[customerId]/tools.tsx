"use client";

import { useActionState, useTransition } from "react";
import { SubmitButton } from "@/components/submit-button";
import { Card } from "@/components/ui";
import type { FormState } from "@/server/web";
import { anonymizeCustomerAction, saveCustomerNoteAction } from "../actions";

export function CustomerTools({ storeId, customerId, note, canWrite, canErase }: { storeId: string; customerId: string; note: string; canWrite: boolean; canErase: boolean }) {
  const [state, action] = useActionState<FormState, FormData>(saveCustomerNoteAction.bind(null, storeId, customerId), {});
  const [pending, start] = useTransition();
  return (
    <Card className="flex flex-col gap-3">
      <h2 className="font-semibold">ملاحظات داخلية</h2>
      <form action={action} className="flex flex-col gap-2">
        <textarea name="note" rows={3} maxLength={2000} defaultValue={note} disabled={!canWrite} aria-label="ملاحظات عن العميل" className="rounded-xl border border-line px-3 py-2 text-sm" />
        {canWrite && <SubmitButton tone="secondary" className="self-start" pendingText="…">حفظ</SubmitButton>}
        {state.message && <p className={`text-xs ${state.ok ? "text-emerald-700" : "text-red-700"}`}>{state.message}</p>}
      </form>
      {canErase && (
        <div className="border-t border-line pt-3">
          <p className="mb-2 text-xs text-ink-soft">عند طلب العميل حذف بياناته: يُستبدل الاسم والجوال والبريد والعنوان، وتبقى الطلبات للسجلات المحاسبية.</p>
          <button
            type="button"
            disabled={pending}
            className="text-sm text-red-700"
            onClick={() => confirm("حذف البيانات الشخصية لهذا العميل نهائياً؟ لا يمكن التراجع.") && start(() => anonymizeCustomerAction(storeId, customerId))}
          >
            حذف البيانات الشخصية للعميل
          </button>
        </div>
      )}
    </Card>
  );
}
