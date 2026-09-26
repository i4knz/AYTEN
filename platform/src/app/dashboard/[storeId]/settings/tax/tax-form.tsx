"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Card, Field, Input } from "@/components/ui";
import type { FormState } from "@/server/web";
import { saveTaxAction } from "../commerce-actions";

type Values = { taxEnabled: boolean; pricesIncludeTax: boolean; vatNumber: string; commercialRegistration: string; requireEmail: boolean };

export function TaxForm({ storeId, initial, canEdit }: { storeId: string; initial: Values; canEdit: boolean }) {
  const [state, action] = useActionState<FormState, FormData>(saveTaxAction.bind(null, storeId), {});
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-4">
      {state.message && <Alert tone={state.ok ? "success" : "error"}>{state.message}</Alert>}
      <fieldset disabled={!canEdit} className="flex flex-col gap-4">
        <Card className="flex flex-col gap-3">
          <h2 className="font-semibold">ضريبة القيمة المضافة (15%)</h2>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="taxEnabled" defaultChecked={initial.taxEnabled} className="accent-brand" /> متجري مسجّل في ضريبة القيمة المضافة
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="pricesIncludeTax" defaultChecked={initial.pricesIncludeTax} className="accent-brand" /> أسعار المنتجات تشمل الضريبة
          </label>
          <Field label="الرقم الضريبي" name="vatNumber" error={e.vatNumber} hint="15 رقماً. يظهر في الفاتورة الضريبية المبسطة مع رمز QR.">
            <Input id="vatNumber" name="vatNumber" dir="ltr" inputMode="numeric" defaultValue={initial.vatNumber} />
          </Field>
          <Alert tone="info">
            نولّد الفاتورة الضريبية المبسطة مع رمز QR (المرحلة الأولى من الفوترة الإلكترونية). المرحلة الثانية (الربط مع منصة فاتورة) غير مفعلة بعد؛ راجع التزاماتك مع محاسبك.
          </Alert>
        </Card>
        <Card className="flex flex-col gap-3">
          <h2 className="font-semibold">البيانات النظامية</h2>
          <Field label="رقم السجل التجاري أو وثيقة العمل الحر" name="commercialRegistration" error={e.commercialRegistration}>
            <Input id="commercialRegistration" name="commercialRegistration" dir="ltr" defaultValue={initial.commercialRegistration} />
          </Field>
        </Card>
        <Card className="flex flex-col gap-3">
          <h2 className="font-semibold">إتمام الطلب</h2>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="requireEmail" defaultChecked={initial.requireEmail} className="accent-brand" /> اطلب البريد الإلكتروني من العميل (إلزامي)
          </label>
        </Card>
      </fieldset>
      {canEdit && <SubmitButton className="self-start" pendingText="جارٍ الحفظ…">حفظ</SubmitButton>}
    </form>
  );
}
