"use client";

import Link from "next/link";
import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Card, Field, Input } from "@/components/ui";
import type { FormState } from "@/server/web";
import { resetPasswordAction } from "../actions";

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action] = useActionState<FormState, FormData>(resetPasswordAction, {});
  return (
    <Card>
      <h1 className="mb-1 text-2xl font-bold">كلمة مرور جديدة</h1>
      <p className="mb-6 text-sm leading-7 text-ink-soft">سيتم تسجيل خروجك من جميع الأجهزة بعد التغيير.</p>
      <form action={action} className="flex flex-col gap-4" noValidate>
        {state.message && (
          <Alert>
            {state.message}{" "}
            {!state.fieldErrors && (
              <Link href="/forgot-password" className="font-semibold underline">
                طلب رابط جديد
              </Link>
            )}
          </Alert>
        )}
        <input type="hidden" name="token" value={token} />
        <Field label="كلمة المرور الجديدة" name="password" error={state.fieldErrors?.password} hint="10 أحرف على الأقل.">
          <Input id="password" name="password" type="password" dir="ltr" autoComplete="new-password" minLength={10} required />
        </Field>
        <SubmitButton pendingText="جارٍ الحفظ…">حفظ كلمة المرور</SubmitButton>
      </form>
    </Card>
  );
}
