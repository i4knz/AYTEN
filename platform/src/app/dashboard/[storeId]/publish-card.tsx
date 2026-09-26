"use client";

import { useActionState, useTransition } from "react";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Card } from "@/components/ui";
import type { FormState } from "@/server/web";
import { publishAction, unpublishAction } from "./settings/actions";

export function PublishCard({
  storeId,
  status,
  storeUrl,
  canPublish,
  blockers,
}: {
  storeId: string;
  status: "draft" | "published" | "paused" | "suspended";
  storeUrl: string;
  canPublish: boolean;
  blockers: string[];
}) {
  const [state, action] = useActionState<FormState>(publishAction.bind(null, storeId), {});
  const [pending, start] = useTransition();

  return (
    <Card id="publish" className="flex flex-col gap-3">
      {status === "published" ? (
        <>
          <h2 className="text-lg font-semibold">متجرك منشور 🎉</h2>
          {state.ok && <Alert tone="success">{state.message}</Alert>}
          <p className="text-sm text-ink-soft">
            الرابط:{" "}
            <a href={storeUrl} target="_blank" rel="noopener" className="ltr text-brand">
              {storeUrl}
            </a>
          </p>
          {canPublish && (
            <button
              type="button"
              disabled={pending}
              className="self-start text-sm text-red-700"
              onClick={() => confirm("إيقاف المتجر مؤقتاً؟ سيرى العملاء رسالة بأن المتجر غير متاح.") && start(() => unpublishAction(storeId))}
            >
              إيقاف المتجر مؤقتاً
            </button>
          )}
        </>
      ) : status === "suspended" ? (
        <Alert>المتجر موقوف من إدارة المنصة. تواصل مع الدعم.</Alert>
      ) : (
        <>
          <h2 className="text-lg font-semibold">{status === "paused" ? "المتجر متوقف مؤقتاً" : "انشر متجرك"}</h2>
          <p className="text-sm leading-7 text-ink-soft">
            {status === "paused" ? "أعد النشر ليعود المتجر متاحاً لعملائك." : "عند النشر يصبح متجرك ومنتجاتك المنشورة متاحة لأي شخص لديه الرابط."}
          </p>
          {blockers.length > 0 && (
            <ul className="list-disc ps-5 text-sm text-amber-800">
              {blockers.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          )}
          {state.message && !state.ok && <Alert>{state.message}</Alert>}
          {canPublish && (
            <form action={action}>
              <SubmitButton pendingText="جارٍ النشر…">{status === "paused" ? "إعادة النشر" : "نشر المتجر"}</SubmitButton>
            </form>
          )}
        </>
      )}
    </Card>
  );
}
