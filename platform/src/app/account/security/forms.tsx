"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Field, Input } from "@/components/ui";
import type { FormState } from "@/server/web";
import { changePasswordAction, resendVerificationAction } from "./actions";

export function ResendVerification() {
  const [state, action] = useActionState<FormState>(resendVerificationAction, {});
  return (
    <form action={action} className="flex flex-col gap-3">
      {state.message && <Alert tone={state.ok ? "success" : "error"}>{state.message}</Alert>}
      <SubmitButton tone="secondary" pendingText="جارٍ الإرسال…" className="self-start">
        إعادة إرسال رابط التأكيد
      </SubmitButton>
    </form>
  );
}

export function ChangePasswordForm() {
  const [state, action] = useActionState<FormState, FormData>(changePasswordAction, {});
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-4" noValidate key={state.ok ? "done" : "form"}>
      {state.message && <Alert tone={state.ok ? "success" : "error"}>{state.message}</Alert>}
      <Field label="كلمة المرور الحالية" name="currentPassword" error={e.currentPassword}>
        <Input id="currentPassword" name="currentPassword" type="password" dir="ltr" autoComplete="current-password" required />
      </Field>
      <Field label="كلمة المرور الجديدة" name="newPassword" error={e.newPassword} hint="10 أحرف على الأقل.">
        <Input id="newPassword" name="newPassword" type="password" dir="ltr" autoComplete="new-password" minLength={10} required />
      </Field>
      <SubmitButton pendingText="جارٍ الحفظ…" className="self-start">
        تغيير كلمة المرور
      </SubmitButton>
    </form>
  );
}
