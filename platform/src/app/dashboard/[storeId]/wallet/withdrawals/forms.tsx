"use client";

import { useActionState, useTransition } from "react";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Field, Input } from "@/components/ui";
import type { FormState } from "@/server/web";
import { cancelPayoutAction, requestPayoutAction } from "../actions";

export function PayoutForm({ storeId, max }: { storeId: string; max: string }) {
  const [state, action] = useActionState<FormState, FormData>(requestPayoutAction.bind(null, storeId), {});
  const v = state.ok ? {} : (state.values ?? {});
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-4">
      {state.message && <Alert tone={state.ok ? "success" : "error"}>{state.message}</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="المبلغ (ر.س)" name="amount" error={e.amount} hint={`الحد الأقصى ${max}`}>
          <Input id="amount" name="amount" inputMode="decimal" dir="ltr" required defaultValue={v.amount} aria-invalid={!!e.amount} />
        </Field>
        <Field label="اسم البنك" name="bankName" error={e.bankName}>
          <Input id="bankName" name="bankName" required defaultValue={v.bankName} aria-invalid={!!e.bankName} />
        </Field>
        <Field label="اسم صاحب الحساب" name="accountName" error={e.accountName} hint="كما هو مسجل في البنك">
          <Input id="accountName" name="accountName" required defaultValue={v.accountName} aria-invalid={!!e.accountName} />
        </Field>
        <Field label="رقم الآيبان" name="iban" error={e.iban}>
          <Input id="iban" name="iban" dir="ltr" required placeholder="SA00 0000 0000 0000 0000 0000" defaultValue={v.iban} aria-invalid={!!e.iban} />
        </Field>
      </div>
      <div>
        <SubmitButton pendingText="جارٍ الإرسال…">إرسال طلب السحب</SubmitButton>
      </div>
    </form>
  );
}

export function CancelPayout({ storeId, payoutId }: { storeId: string; payoutId: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      className="text-sm text-red-700"
      onClick={() => confirm("إلغاء طلب السحب؟ يعود المبلغ إلى رصيدك.") && start(() => cancelPayoutAction(storeId, payoutId))}
    >
      إلغاء الطلب
    </button>
  );
}
