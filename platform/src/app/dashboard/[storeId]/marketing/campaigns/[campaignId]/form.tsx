"use client";

import { useActionState, useState, useTransition } from "react";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Button, Card, Field, Input, Select } from "@/components/ui";
import type { FormState } from "@/server/web";
import { saveCampaignAction, sendCampaignAction } from "../../campaign-actions";

type Values = { name: string; subject: string; body: string; buttonText: string; buttonLink: string; segment: string };

export function CampaignForm({ storeId, campaignId, status, sentCount, segments, initial }: { storeId: string; campaignId: string | null; status: string; sentCount: number; segments: { value: string; label: string }[]; initial: Values }) {
  const [state, action] = useActionState<FormState, FormData>(saveCampaignAction.bind(null, storeId, campaignId), {});
  const [sendState, setSendState] = useState<FormState>({});
  const [pending, start] = useTransition();
  const e = state.fieldErrors ?? {};
  const v = { ...initial, ...(state.values as Partial<Values>) };
  const locked = status !== "draft";
  return (
    <div className="flex flex-col gap-4">
      {locked && <Alert tone="info">أُرسلت هذه الحملة إلى {sentCount} مستلم ولا يمكن تعديلها.</Alert>}
      <form action={action} className="flex flex-col gap-4">
        {state.message && <Alert tone={state.ok ? "success" : "error"}>{state.message}</Alert>}
        <fieldset disabled={locked} className="flex flex-col gap-4">
          <Card className="flex flex-col gap-4">
            <Field label="اسم الحملة (داخلي)" name="name" error={e.name}><Input id="name" name="name" defaultValue={v.name} /></Field>
            <Field label="الشريحة" name="segment"><Select id="segment" name="segment" defaultValue={v.segment}>{segments.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</Select></Field>
            <Field label="عنوان الرسالة" name="subject" error={e.subject}><Input id="subject" name="subject" defaultValue={v.subject} maxLength={150} /></Field>
            <Field label="نص الرسالة" name="body" error={e.body} hint="اترك سطراً فارغاً بين الفقرات. لا تعد بخصومات غير حقيقية.">
              <textarea id="body" name="body" rows={8} maxLength={5000} defaultValue={v.body} className="rounded-xl border border-line px-3.5 py-2.5 text-sm leading-7" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="نص الزر" name="buttonText"><Input id="buttonText" name="buttonText" defaultValue={v.buttonText} /></Field>
              <Field label="رابط الزر" name="buttonLink" error={e.buttonLink}><Input id="buttonLink" name="buttonLink" dir="ltr" defaultValue={v.buttonLink} placeholder="/ أو /products/…" /></Field>
            </div>
          </Card>
          {!locked && <SubmitButton tone="secondary" className="self-start" pendingText="…">حفظ المسودة</SubmitButton>}
        </fieldset>
      </form>
      {campaignId && !locked && (
        <Card className="flex flex-col gap-3">
          <h2 className="font-semibold">إرسال الحملة</h2>
          <p className="text-sm text-ink-soft">احفظ التعديلات أولاً. تُرسل لمرة واحدة فقط، بحد أقصى 2000 مستلم و3 حملات يومياً.</p>
          {sendState.message && <Alert tone={sendState.ok ? "success" : "error"}>{sendState.message}</Alert>}
          <Button type="button" disabled={pending} className="self-start" onClick={() => confirm("إرسال الحملة الآن؟ لا يمكن التراجع.") && start(async () => setSendState(await sendCampaignAction(storeId, campaignId)))}>
            {pending ? "جارٍ الإرسال…" : "إرسال الآن"}
          </Button>
        </Card>
      )}
    </div>
  );
}
