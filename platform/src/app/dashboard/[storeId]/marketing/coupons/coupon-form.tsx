"use client";

import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Card, Field, Input, Select } from "@/components/ui";
import type { FormState } from "@/server/web";
import { saveCouponAction } from "../actions";

export type CouponFormValues = {
  code: string;
  type: "percent" | "fixed" | "free_shipping";
  value: string;
  maxDiscount: string;
  minSubtotal: string;
  startsAt: string;
  endsAt: string;
  usageLimit: string;
  usageLimitPerCustomer: string;
  productIds: string[];
  categoryIds: string[];
  active: boolean;
};

export function CouponForm({
  storeId,
  couponId,
  initial,
  products,
  categories,
}: {
  storeId: string;
  couponId: string | null;
  initial: CouponFormValues;
  products: { id: string; name: string }[];
  categories: { id: string; name: string }[];
}) {
  const [state, action] = useActionState<FormState, FormData>(saveCouponAction.bind(null, storeId, couponId), {});
  const e = state.fieldErrors ?? {};
  const v = { ...initial, ...(state.values as Partial<CouponFormValues>) };
  const [type, setType] = useState(v.type);
  const [scoped, setScoped] = useState(initial.productIds.length + initial.categoryIds.length > 0);

  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      {state.message && <Alert>{state.message}</Alert>}
      <Card className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="رمز الكوبون" name="code" error={e.code} hint="حروف إنجليزية وأرقام، مثل EID25">
            <Input id="code" name="code" dir="ltr" required defaultValue={v.code} className="uppercase" aria-invalid={!!e.code} />
          </Field>
          <Field label="نوع الخصم" name="type">
            <Select id="type" name="type" value={type} onChange={(ev) => setType(ev.target.value as CouponFormValues["type"])}>
              <option value="percent">نسبة مئوية</option>
              <option value="fixed">مبلغ ثابت</option>
              <option value="free_shipping">شحن مجاني</option>
            </Select>
          </Field>
          {type !== "free_shipping" && (
            <Field label={type === "percent" ? "النسبة %" : "مبلغ الخصم (ر.س)"} name="value" error={e.value}>
              <Input id="value" name="value" inputMode="decimal" dir="ltr" required defaultValue={v.value} aria-invalid={!!e.value} />
            </Field>
          )}
          {type === "percent" && (
            <Field label="أقصى خصم (اختياري)" name="maxDiscount" error={e.maxDiscount}>
              <Input id="maxDiscount" name="maxDiscount" inputMode="decimal" dir="ltr" defaultValue={v.maxDiscount} />
            </Field>
          )}
          <Field label="الحد الأدنى للطلب (اختياري)" name="minSubtotal" error={e.minSubtotal}>
            <Input id="minSubtotal" name="minSubtotal" inputMode="decimal" dir="ltr" defaultValue={v.minSubtotal} />
          </Field>
        </div>
      </Card>

      <Card className="flex flex-col gap-4">
        <h2 className="font-semibold">المدة وحدود الاستخدام</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="يبدأ في (اختياري)" name="startsAt" error={e.startsAt}>
            <Input id="startsAt" name="startsAt" type="datetime-local" defaultValue={v.startsAt} />
          </Field>
          <Field label="ينتهي في (اختياري)" name="endsAt" error={e.endsAt}>
            <Input id="endsAt" name="endsAt" type="datetime-local" defaultValue={v.endsAt} />
          </Field>
          <Field label="عدد مرات الاستخدام الكلي (اختياري)" name="usageLimit" error={e.usageLimit}>
            <Input id="usageLimit" name="usageLimit" inputMode="numeric" dir="ltr" defaultValue={v.usageLimit} />
          </Field>
          <Field label="لكل عميل (اختياري)" name="usageLimitPerCustomer" error={e.usageLimitPerCustomer} hint="يُعرف العميل برقم جواله.">
            <Input id="usageLimitPerCustomer" name="usageLimitPerCustomer" inputMode="numeric" dir="ltr" defaultValue={v.usageLimitPerCustomer} />
          </Field>
        </div>
      </Card>

      <Card className="flex flex-col gap-3">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={scoped} onChange={(ev) => setScoped(ev.target.checked)} className="accent-brand" />
          يطبق على منتجات أو تصنيفات محددة فقط
        </label>
        {scoped && (
          <div className="grid gap-4 sm:grid-cols-2">
            <fieldset className="flex max-h-56 flex-col gap-1 overflow-y-auto rounded-xl border border-line p-2">
              <legend className="px-1 text-xs text-ink-soft">المنتجات</legend>
              {products.map((p) => (
                <label key={p.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="productIds" value={p.id} defaultChecked={v.productIds.includes(p.id)} className="accent-brand" />
                  {p.name}
                </label>
              ))}
            </fieldset>
            <fieldset className="flex max-h-56 flex-col gap-1 overflow-y-auto rounded-xl border border-line p-2">
              <legend className="px-1 text-xs text-ink-soft">التصنيفات</legend>
              {categories.map((c) => (
                <label key={c.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="categoryIds" value={c.id} defaultChecked={v.categoryIds.includes(c.id)} className="accent-brand" />
                  {c.name}
                </label>
              ))}
            </fieldset>
          </div>
        )}
      </Card>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="active" defaultChecked={v.active} className="accent-brand" /> مفعّل
      </label>
      <SubmitButton className="self-start" pendingText="جارٍ الحفظ…">حفظ الكوبون</SubmitButton>
    </form>
  );
}
