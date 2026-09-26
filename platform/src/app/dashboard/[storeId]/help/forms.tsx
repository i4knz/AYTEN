"use client";

import { useActionState, useRef } from "react";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Field, Input, Select } from "@/components/ui";
import type { FormState } from "@/server/web";
import { createTicketAction, replyTicketAction } from "./actions";

const textareaCls =
  "w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm leading-7 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20";

export function NewTicketForm({ storeId, categories }: { storeId: string; categories: { value: string; label: string; priority: string }[] }) {
  const [state, action] = useActionState<FormState, FormData>(createTicketAction.bind(null, storeId), {});
  const v = state.values ?? {};
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-4">
      {state.message && <Alert tone="error">{state.message}</Alert>}
      <Field label="نوع المشكلة" name="category" error={e.category} hint="نرتّب الأولوية حسب تأثير المشكلة على مبيعاتك.">
        <Select id="category" name="category" defaultValue={v.category ?? "question"}>
          {categories.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label} — أولوية {c.priority}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="العنوان" name="subject" error={e.subject}>
        <Input id="subject" name="subject" required maxLength={150} defaultValue={v.subject} aria-invalid={!!e.subject} />
      </Field>
      <Field label="التفاصيل" name="body" error={e.body} hint="اذكر رقم الطلب أو رابط الصفحة وما الذي حدث بالضبط.">
        <textarea id="body" name="body" required rows={6} maxLength={5000} defaultValue={v.body} className={textareaCls} />
      </Field>
      <div>
        <SubmitButton pendingText="جارٍ الإرسال…">إرسال التذكرة</SubmitButton>
      </div>
    </form>
  );
}

export function ReplyForm({ storeId, ticketId }: { storeId: string; ticketId: string }) {
  const ref = useRef<HTMLFormElement>(null);
  const [state, action] = useActionState<FormState, FormData>(async (prev, form) => {
    const result = await replyTicketAction(storeId, ticketId, prev, form);
    if (result.ok) ref.current?.reset();
    return result;
  }, {});
  return (
    <form ref={ref} action={action} className="flex flex-col gap-3">
      {state.message && <Alert tone="error">{state.message}</Alert>}
      <label htmlFor="reply" className="text-sm font-medium">
        ردك
      </label>
      <textarea id="reply" name="body" required rows={4} maxLength={5000} className={textareaCls} />
      <div>
        <SubmitButton pendingText="جارٍ الإرسال…">إرسال الرد</SubmitButton>
      </div>
    </form>
  );
}
