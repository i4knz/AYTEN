"use client";

import { useActionState, useState, useTransition } from "react";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Field, Input, Select } from "@/components/ui";
import type { FormState } from "@/server/web";
import { deleteShippingAction, saveShippingAction } from "../commerce-actions";

type Values = { name: string; type: "flat" | "free_over" | "pickup"; price: string; freeThreshold: string; cities: string; estimatedDays: string; pickupAddress: string; active: boolean };

export function ShippingMethodForm({ storeId, methodId, initial, canEdit }: { storeId: string; methodId: string | null; initial: Values; canEdit: boolean }) {
  const [state, action] = useActionState<FormState, FormData>(saveShippingAction.bind(null, storeId, methodId), {});
  const [type, setType] = useState(initial.type);
  const [pending, start] = useTransition();
  const e = state.fieldErrors ?? {};
  const v = { ...initial, ...(state.ok ? {} : (state.values as Partial<Values>)) };
  const id = (n: string) => `${methodId ?? "new"}-${n}`;
  return (
    <form action={action} className="flex flex-col gap-3">
      {state.message && <Alert tone={state.ok ? "success" : "error"}>{state.message}</Alert>}
      <fieldset disabled={!canEdit} className="grid gap-3 sm:grid-cols-2">
        <Field label="الاسم" name={id("name")} error={e.name}>
          <Input id={id("name")} name="name" required defaultValue={v.name} placeholder="توصيل سريع" />
        </Field>
        <Field label="النوع" name={id("type")}>
          <Select id={id("type")} name="type" value={type} onChange={(ev) => setType(ev.target.value as Values["type"])}>
            <option value="flat">سعر ثابت</option>
            <option value="free_over">مجاني فوق مبلغ معين</option>
            <option value="pickup">استلام من المتجر</option>
          </Select>
        </Field>
        {type !== "pickup" && (
          <Field label="السعر (ر.س)" name={id("price")} error={e.price}>
            <Input id={id("price")} name="price" inputMode="decimal" dir="ltr" defaultValue={v.price} />
          </Field>
        )}
        {type === "free_over" && (
          <Field label="مجاني للطلبات من (ر.س)" name={id("freeThreshold")} error={e.freeThreshold}>
            <Input id={id("freeThreshold")} name="freeThreshold" inputMode="decimal" dir="ltr" defaultValue={v.freeThreshold} />
          </Field>
        )}
        {type === "pickup" ? (
          <Field label="عنوان الاستلام" name={id("pickupAddress")} error={e.pickupAddress}>
            <Input id={id("pickupAddress")} name="pickupAddress" defaultValue={v.pickupAddress} />
          </Field>
        ) : (
          <Field label="مدة التوصيل" name={id("estimatedDays")}>
            <Input id={id("estimatedDays")} name="estimatedDays" defaultValue={v.estimatedDays} placeholder="2–4 أيام عمل" />
          </Field>
        )}
        <Field label="المدن (اختياري، افصل بفاصلة)" name={id("cities")}>
          <Input id={id("cities")} name="cities" defaultValue={v.cities} placeholder="الرياض، الخرج" />
        </Field>
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <input type="checkbox" name="active" defaultChecked={v.active} className="accent-brand" /> مفعّلة
        </label>
      </fieldset>
      {canEdit && (
        <div className="flex items-center gap-3">
          <SubmitButton pendingText="…" tone={methodId ? "secondary" : "primary"}>{methodId ? "حفظ" : "إضافة"}</SubmitButton>
          {methodId && (
            <button type="button" disabled={pending} className="text-sm text-red-700" onClick={() => confirm("حذف طريقة الشحن؟") && start(() => deleteShippingAction(storeId, methodId))}>
              حذف
            </button>
          )}
        </div>
      )}
    </form>
  );
}
