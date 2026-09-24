"use client";

import Link from "next/link";
import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Card, Field, Input } from "@/components/ui";
import type { FormState } from "@/server/web";
import { loginAction } from "../actions";

export function LoginForm({ next, passwordReset }: { next: string; passwordReset: boolean }) {
  const [state, action] = useActionState<FormState, FormData>(loginAction, {});
  const e = state.fieldErrors ?? {};
  return (
    <Card>
      <h1 className="mb-6 text-2xl font-bold">تسجيل الدخول</h1>
      <form action={action} className="flex flex-col gap-4" noValidate>
        {passwordReset && !state.message && (
          <Alert tone="success">تم تغيير كلمة المرور. سجّل الدخول بكلمة المرور الجديدة.</Alert>
        )}
        {state.message && <Alert>{state.message}</Alert>}
        <input type="hidden" name="next" value={next} />
        <Field label="البريد الإلكتروني" name="email" error={e.email}>
          <Input
            id="email"
            name="email"
            type="email"
            dir="ltr"
            autoComplete="email"
            inputMode="email"
            required
            defaultValue={state.values?.email}
            aria-invalid={!!e.email}
          />
        </Field>
        <Field label="كلمة المرور" name="password" error={e.password}>
          <Input id="password" name="password" type="password" dir="ltr" autoComplete="current-password" required aria-invalid={!!e.password} />
        </Field>
        <Link href="/forgot-password" className="-mt-1 self-start text-sm text-brand">
          نسيت كلمة المرور؟
        </Link>
        <SubmitButton pendingText="جارٍ الدخول…">دخول</SubmitButton>
      </form>
      <p className="mt-6 text-center text-sm text-ink-soft">
        ليس لديك حساب؟{" "}
        <Link href="/register" className="font-semibold text-brand">
          أنشئ متجرك
        </Link>
      </p>
    </Card>
  );
}
