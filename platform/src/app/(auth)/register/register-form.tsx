"use client";

import Link from "next/link";
import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Card, Field, Input } from "@/components/ui";
import type { FormState } from "@/server/web";
import { registerAction } from "../actions";

export function RegisterForm() {
  const [state, action] = useActionState<FormState, FormData>(registerAction, {});
  const e = state.fieldErrors ?? {};
  const v = state.values ?? {};
  return (
    <Card>
      <h1 className="mb-1 text-2xl font-bold">أنشئ حسابك</h1>
      <p className="mb-6 text-sm leading-7 text-ink-soft">خطوة واحدة، ثم ننشئ متجرك معاً.</p>
      <form action={action} className="flex flex-col gap-4" noValidate>
        {state.message && !state.ok && <Alert>{state.message}</Alert>}
        <Field label="الاسم" name="name" error={e.name}>
          <Input id="name" name="name" autoComplete="name" required defaultValue={v.name} aria-invalid={!!e.name} />
        </Field>
        <Field label="البريد الإلكتروني" name="email" error={e.email}>
          <Input
            id="email"
            name="email"
            type="email"
            dir="ltr"
            autoComplete="email"
            inputMode="email"
            required
            defaultValue={v.email}
            aria-invalid={!!e.email}
          />
        </Field>
        <Field label="كلمة المرور" name="password" error={e.password} hint="10 أحرف على الأقل. العبارات الطويلة أسهل للتذكر وأصعب للتخمين.">
          <Input
            id="password"
            name="password"
            type="password"
            dir="ltr"
            autoComplete="new-password"
            minLength={10}
            required
            aria-invalid={!!e.password}
          />
        </Field>
        <div className="flex flex-col gap-1">
          <label className="flex items-start gap-2 text-sm leading-7">
            <input type="checkbox" name="acceptTerms" className="mt-1.5 size-4 accent-brand" defaultChecked={v.acceptTerms === "on"} />
            <span>
              أوافق على{" "}
              <Link href="/terms" target="_blank" className="text-brand underline">
                شروط الاستخدام
              </Link>{" "}
              و
              <Link href="/privacy" target="_blank" className="text-brand underline">
                سياسة الخصوصية
              </Link>
            </span>
          </label>
          {e.acceptTerms && <p className="text-xs text-red-700">{e.acceptTerms}</p>}
        </div>
        <SubmitButton pendingText="جارٍ إنشاء الحساب…">إنشاء الحساب</SubmitButton>
      </form>
      <p className="mt-6 text-center text-sm text-ink-soft">
        لديك حساب؟{" "}
        <Link href="/login" className="font-semibold text-brand">
          تسجيل الدخول
        </Link>
      </p>
    </Card>
  );
}
