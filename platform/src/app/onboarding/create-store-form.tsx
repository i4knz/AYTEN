"use client";

import { useActionState, useRef, useState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Card, Field, Input, Select } from "@/components/ui";
import type { FormState } from "@/server/web";
import { checkSlugAction, createStoreAction, suggestSlugAction } from "./actions";

type SlugStatus = { state: "idle" | "checking" | "ok" | "bad"; message?: string; suggestion?: string };

export function CreateStoreForm({ rootDomain, businessTypes }: { rootDomain: string; businessTypes: [string, string][] }) {
  const [state, action] = useActionState<FormState, FormData>(createStoreAction, {});
  const e = state.fieldErrors ?? {};
  const [name, setName] = useState(state.values?.name ?? "");
  const [slug, setSlug] = useState(state.values?.slug ?? "");
  const [slugEdited, setSlugEdited] = useState(Boolean(state.values?.slug));
  const [status, setStatus] = useState<SlugStatus>({ state: "idle" });
  const seq = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Debounced server calls; `seq` drops responses that arrive out of order.
  function debounce(run: (isLatest: () => boolean) => Promise<void>) {
    clearTimeout(timer.current);
    const id = ++seq.current;
    timer.current = setTimeout(() => void run(() => id === seq.current), 400);
  }

  function onNameChange(value: string) {
    setName(value);
    // Suggest a slug from the name until the merchant edits the slug themselves.
    if (slugEdited || value.trim().length < 2) return;
    debounce(async (isLatest) => {
      const suggestion = await suggestSlugAction(value);
      if (isLatest()) {
        setSlug(suggestion);
        setStatus({ state: "ok" });
      }
    });
  }

  function onSlugChange(value: string) {
    setSlugEdited(true);
    setSlug(value);
    if (!value) {
      clearTimeout(timer.current);
      seq.current++;
      setStatus({ state: "idle" });
      return;
    }
    setStatus({ state: "checking" });
    debounce(async (isLatest) => {
      const r = await checkSlugAction(value);
      if (isLatest()) setStatus(r.ok ? { state: "ok" } : { state: "bad", message: r.message, suggestion: r.suggestion });
    });
  }

  const slugError = e.slug ?? (status.state === "bad" ? status.message : undefined);

  return (
    <Card>
      <form action={action} className="flex flex-col gap-5" noValidate>
        {state.message && <Alert>{state.message}</Alert>}
        <Field label="اسم المتجر" name="name" error={e.name} hint="يظهر لعملائك في أعلى المتجر. يمكنك تغييره لاحقاً.">
          <Input
            id="name"
            name="name"
            required
            maxLength={60}
            value={name}
            onChange={(ev) => onNameChange(ev.target.value)}
            aria-invalid={!!e.name}
            placeholder="مثال: عطور نجد"
          />
        </Field>

        <Field
          label="رابط المتجر"
          name="slug"
          error={slugError}
          hint={
            status.state === "checking"
              ? "جارٍ التحقق…"
              : "أحرف إنجليزية صغيرة وأرقام وشرطة. لا يمكن تغييره بسهولة بعد النشر."
          }
        >
          <div className="flex items-stretch overflow-hidden rounded-xl border border-line focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/20" dir="ltr">
            <input
              id="slug"
              name="slug"
              required
              maxLength={40}
              value={slug}
              onChange={(ev) => onSlugChange(ev.target.value.toLowerCase().replace(/\s+/g, "-"))}
              aria-invalid={!!slugError}
              aria-describedby={slugError ? "slug-error" : "slug-hint"}
              className="min-w-0 flex-1 bg-surface px-3.5 py-2.5 text-sm outline-none"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
            <span className="flex items-center bg-muted px-3 text-sm text-ink-soft">.{rootDomain}</span>
          </div>
          {status.state === "bad" && status.suggestion && (
            <button
              type="button"
              className="self-start text-xs text-brand underline"
              onClick={() => onSlugChange(status.suggestion!)}
            >
              استخدم <span className="ltr">{status.suggestion}</span>
            </button>
          )}
        </Field>

        <Field label="مجال النشاط" name="businessType" error={e.businessType} hint="نستخدمه لاقتراح إعدادات وقالب مناسب.">
          <Select id="businessType" name="businessType" required defaultValue={state.values?.businessType ?? ""}>
            <option value="" disabled>
              اختر مجال النشاط
            </option>
            {businessTypes.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>

        <SubmitButton pendingText="جارٍ إنشاء المتجر…">إنشاء المتجر</SubmitButton>
      </form>
    </Card>
  );
}
