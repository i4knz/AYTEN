"use client";

import { useActionState, useTransition } from "react";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Card, Field, Input } from "@/components/ui";
import type { FormState } from "@/server/web";
import { deletePageAction, savePageAction } from "./actions";

type Values = { title: string; slug: string; body: string; published: boolean; showInFooter: boolean };

export function PageForm({ storeId, pageId, initial, storeUrl }: { storeId: string; pageId: string | null; initial: Values; storeUrl: string }) {
  const [state, action] = useActionState<FormState, FormData>(savePageAction.bind(null, storeId, pageId), {});
  const [pending, start] = useTransition();
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-4">
      {state.message && <Alert tone={state.ok ? "success" : "error"}>{state.message}</Alert>}
      <Card className="flex flex-col gap-4">
        <Field label="العنوان" name="title" error={e.title}>
          <Input id="title" name="title" required maxLength={120} defaultValue={initial.title} />
        </Field>
        <Field label="الرابط" name="slug" error={e.slug} hint={`${storeUrl}/pages/${initial.slug || "…"}`}>
          <Input id="slug" name="slug" maxLength={80} defaultValue={initial.slug} placeholder="يُنشأ من العنوان" />
        </Field>
        <Field label="المحتوى" name="body" error={e.body} hint="سطر يبدأ بـ ## عنوان فرعي، و - لقائمة نقطية، و 1. لقائمة مرقمة. اترك سطراً فارغاً بين الفقرات.">
          <textarea id="body" name="body" rows={16} maxLength={30000} defaultValue={initial.body} className="rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm leading-7" />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="published" defaultChecked={initial.published} className="accent-brand" /> منشورة
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="showInFooter" defaultChecked={initial.showInFooter} className="accent-brand" /> إظهار الرابط في التذييل
        </label>
      </Card>
      <div className="flex items-center gap-3">
        <SubmitButton pendingText="جارٍ الحفظ…">حفظ</SubmitButton>
        {pageId && (
          <button type="button" disabled={pending} className="text-sm text-red-700" onClick={() => confirm("حذف الصفحة؟") && start(() => deletePageAction(storeId, pageId))}>
            حذف
          </button>
        )}
      </div>
    </form>
  );
}
