"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Field, Input } from "@/components/ui";
import type { FormState } from "@/server/web";
import { updateStoreProfileAction } from "./actions";

type Values = { name: string; contactEmail: string; contactPhone: string; whatsapp: string; brandColor: string };

const toLocalPhone = (e164: string) => (e164.startsWith("+966") ? `0${e164.slice(4)}` : e164);

export function StoreProfileForm({ storeId, initial, canEdit }: { storeId: string; initial: Values; canEdit: boolean }) {
  const [state, action] = useActionState<FormState, FormData>(updateStoreProfileAction.bind(null, storeId), {});
  const e = state.fieldErrors ?? {};
  const v = { ...initial, contactPhone: toLocalPhone(initial.contactPhone), whatsapp: toLocalPhone(initial.whatsapp), ...state.values };
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {state.message && <Alert tone={state.ok ? "success" : "error"}>{state.message}</Alert>}
      <fieldset disabled={!canEdit} className="flex flex-col gap-4">
        <Field label="اسم المتجر" name="name" error={e.name}>
          <Input id="name" name="name" required maxLength={60} defaultValue={v.name} aria-invalid={!!e.name} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="جوال التواصل" name="contactPhone" error={e.contactPhone} hint="اختياري. مثال: 05XXXXXXXX">
            <Input id="contactPhone" name="contactPhone" type="tel" dir="ltr" inputMode="tel" defaultValue={v.contactPhone} aria-invalid={!!e.contactPhone} />
          </Field>
          <Field label="رقم واتساب" name="whatsapp" error={e.whatsapp} hint="اختياري. يظهر كزر تواصل في متجرك.">
            <Input id="whatsapp" name="whatsapp" type="tel" dir="ltr" inputMode="tel" defaultValue={v.whatsapp} aria-invalid={!!e.whatsapp} />
          </Field>
        </div>
        <Field label="بريد التواصل" name="contactEmail" error={e.contactEmail} hint="اختياري. يمكن أن يختلف عن بريد حسابك.">
          <Input id="contactEmail" name="contactEmail" type="email" dir="ltr" defaultValue={v.contactEmail} aria-invalid={!!e.contactEmail} />
        </Field>
        <Field label="اللون الأساسي للمتجر" name="brandColor" error={e.brandColor}>
          <input
            id="brandColor"
            name="brandColor"
            type="color"
            defaultValue={v.brandColor}
            className="h-11 w-24 cursor-pointer rounded-xl border border-line bg-surface p-1"
          />
        </Field>
        {canEdit && <SubmitButton pendingText="جارٍ الحفظ…" className="self-start">حفظ التغييرات</SubmitButton>}
      </fieldset>
    </form>
  );
}
