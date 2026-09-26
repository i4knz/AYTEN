"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Card, Field, Input } from "@/components/ui";
import type { FormState } from "@/server/web";
import { savePaymentsAction } from "../commerce-actions";

type Values = { codEnabled: boolean; codFee: string; bankEnabled: boolean; bankName: string; accountName: string; iban: string; onlineEnabled: boolean };

export function PaymentsForm({ storeId, initial, canEdit, onlineAvailable, testMode }: { storeId: string; initial: Values; canEdit: boolean; onlineAvailable: boolean; testMode: boolean }) {
  const [state, action] = useActionState<FormState, FormData>(savePaymentsAction.bind(null, storeId), {});
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-4">
      {state.message && <Alert tone={state.ok ? "success" : "error"}>{state.message}</Alert>}
      <fieldset disabled={!canEdit} className="flex flex-col gap-4">
        <Card className="flex flex-col gap-3">
          <label className="flex items-center gap-2 font-semibold">
            <input type="checkbox" name="codEnabled" defaultChecked={initial.codEnabled} className="accent-brand" /> الدفع عند الاستلام
          </label>
          <Field label="رسوم إضافية (اختياري، ر.س)" name="codFee" error={e.codFee}>
            <Input id="codFee" name="codFee" inputMode="decimal" dir="ltr" defaultValue={initial.codFee} className="max-w-40" />
          </Field>
        </Card>
        <Card className="flex flex-col gap-3">
          <label className="flex items-center gap-2 font-semibold">
            <input type="checkbox" name="bankEnabled" defaultChecked={initial.bankEnabled} className="accent-brand" /> تحويل بنكي
          </label>
          <p className="text-xs text-ink-soft">تظهر البيانات للعميل بعد الطلب، وتؤكد أنت استلام التحويل من صفحة الطلب.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="اسم البنك" name="bankName" error={e.bankName}>
              <Input id="bankName" name="bankName" defaultValue={initial.bankName} />
            </Field>
            <Field label="اسم صاحب الحساب" name="accountName" error={e.accountName}>
              <Input id="accountName" name="accountName" defaultValue={initial.accountName} />
            </Field>
          </div>
          <Field label="رقم الآيبان" name="iban" error={e.iban}>
            <Input id="iban" name="iban" dir="ltr" defaultValue={initial.iban} placeholder="SA0000000000000000000000" />
          </Field>
        </Card>
        <Card className="flex flex-col gap-3">
          <label className="flex items-center gap-2 font-semibold">
            <input type="checkbox" name="onlineEnabled" defaultChecked={initial.onlineEnabled} disabled={!onlineAvailable} className="accent-brand" /> الدفع الإلكتروني (مدى، فيزا، ماستركارد)
          </label>
          {!onlineAvailable ? (
            <p className="text-xs text-ink-soft">غير متاح بعد: يتطلب ربط بوابة دفع من إدارة المنصة.</p>
          ) : testMode ? (
            <Alert tone="warning">بوابة الدفع الحالية تجريبية: تحاكي الدفع دون خصم أي مبلغ. لا تستخدمها لطلبات حقيقية.</Alert>
          ) : null}
        </Card>
      </fieldset>
      {e._form && <Alert>{e._form}</Alert>}
      {canEdit && <SubmitButton className="self-start" pendingText="جارٍ الحفظ…">حفظ</SubmitButton>}
    </form>
  );
}
