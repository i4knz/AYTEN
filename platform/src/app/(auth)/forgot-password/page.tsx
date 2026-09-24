"use client";

import Link from "next/link";
import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Card, Field, Input } from "@/components/ui";
import type { FormState } from "@/server/web";
import { forgotPasswordAction } from "../actions";

export default function ForgotPasswordPage() {
  const [state, action] = useActionState<FormState, FormData>(forgotPasswordAction, {});
  return (
    <Card>
      <h1 className="mb-1 text-2xl font-bold">استعادة كلمة المرور</h1>
      <p className="mb-6 text-sm leading-7 text-ink-soft">أدخل بريدك وسنرسل لك رابطاً لتعيين كلمة مرور جديدة.</p>
      {state.ok ? (
        <Alert tone="success">{state.message}</Alert>
      ) : (
        <form action={action} className="flex flex-col gap-4" noValidate>
          {state.message && <Alert>{state.message}</Alert>}
          <Field label="البريد الإلكتروني" name="email" error={state.fieldErrors?.email}>
            <Input id="email" name="email" type="email" dir="ltr" autoComplete="email" required defaultValue={state.values?.email} />
          </Field>
          <SubmitButton pendingText="جارٍ الإرسال…">إرسال الرابط</SubmitButton>
        </form>
      )}
      <p className="mt-6 text-center text-sm">
        <Link href="/login" className="text-brand">
          العودة لتسجيل الدخول
        </Link>
      </p>
    </Card>
  );
}
