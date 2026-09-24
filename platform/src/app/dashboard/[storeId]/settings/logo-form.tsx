"use client";

import { useActionState, useTransition } from "react";
import { SubmitButton } from "@/components/submit-button";
import { Alert } from "@/components/ui";
import type { FormState } from "@/server/web";
import { removeLogoAction, uploadLogoAction } from "./actions";

export function LogoForm({ storeId, logoUrl, canEdit, storeName }: { storeId: string; logoUrl: string | null; canEdit: boolean; storeName: string }) {
  const [state, action] = useActionState<FormState, FormData>(uploadLogoAction.bind(null, storeId), {});
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-3">
      {state.message && <Alert tone={state.ok ? "success" : "error"}>{state.message}</Alert>}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex size-20 items-center justify-center overflow-hidden rounded-2xl border border-line bg-muted text-2xl font-bold text-ink-soft">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {logoUrl ? <img src={logoUrl} alt={`شعار ${storeName}`} className="size-full object-contain" /> : storeName.slice(0, 1)}
        </div>
        {canEdit && (
          <form action={action} className="flex flex-wrap items-center gap-2">
            <input
              type="file"
              name="logo"
              accept="image/jpeg,image/png,image/webp"
              required
              aria-label="اختر ملف الشعار"
              className="text-sm file:me-3 file:rounded-lg file:border-0 file:bg-muted file:px-3 file:py-2 file:text-sm"
            />
            <SubmitButton tone="secondary" pendingText="جارٍ الرفع…">
              رفع الشعار
            </SubmitButton>
            {logoUrl && (
              <button type="button" disabled={pending} className="text-sm text-red-700" onClick={() => start(() => removeLogoAction(storeId))}>
                إزالة
              </button>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
