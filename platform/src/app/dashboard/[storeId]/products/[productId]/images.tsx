"use client";

import { useActionState, useRef, useTransition } from "react";
import { SubmitButton } from "@/components/submit-button";
import { Alert } from "@/components/ui";
import type { FormState } from "@/server/web";
import { deleteImageAction, makePrimaryImageAction, updateImageAltAction, uploadImageAction } from "../actions";

export function ProductImages({
  storeId,
  productId,
  images,
  canWrite,
}: {
  storeId: string;
  productId: string;
  images: { id: string; url: string; alt: string }[];
  canWrite: boolean;
}) {
  const [state, upload] = useActionState<FormState, FormData>(uploadImageAction.bind(null, storeId, productId), {});
  const [pending, start] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <div className="flex flex-col gap-4">
      {state.message && <Alert tone={state.ok ? "success" : "error"}>{state.message}</Alert>}
      {images.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {images.map((img, i) => (
            <li key={img.id} className="flex flex-col gap-1.5">
              <div className="relative aspect-square overflow-hidden rounded-xl border border-line bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.url} alt={img.alt} className="size-full object-cover" />
                {i === 0 && <span className="absolute start-1 top-1 rounded-full bg-ink/80 px-2 py-0.5 text-[10px] text-white">الرئيسية</span>}
              </div>
              {canWrite && (
                <>
                  <form action={updateImageAltAction.bind(null, storeId, productId, img.id)} className="flex gap-1">
                    <input
                      name="alt"
                      defaultValue={img.alt}
                      maxLength={200}
                      placeholder="وصف الصورة"
                      aria-label="وصف الصورة لمحركات البحث وقارئات الشاشة"
                      className="min-w-0 flex-1 rounded-lg border border-line px-2 py-1 text-xs"
                    />
                    <button type="submit" className="text-xs text-brand">حفظ</button>
                  </form>
                  <div className="flex justify-between text-xs">
                    {i > 0 ? (
                      <button type="button" disabled={pending} className="text-brand" onClick={() => start(() => makePrimaryImageAction(storeId, productId, img.id))}>
                        اجعلها الرئيسية
                      </button>
                    ) : (
                      <span />
                    )}
                    <button
                      type="button"
                      disabled={pending}
                      className="text-red-700"
                      onClick={() => confirm("حذف الصورة؟") && start(() => deleteImageAction(storeId, productId, img.id))}
                    >
                      حذف
                    </button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {canWrite && (
        <form ref={formRef} action={upload} className="flex flex-wrap items-center gap-3">
          <input
            type="file"
            name="images"
            accept="image/jpeg,image/png,image/webp,image/avif"
            multiple
            aria-label="اختر صور المنتج"
            className="text-sm file:me-3 file:rounded-lg file:border-0 file:bg-muted file:px-3 file:py-2 file:text-sm"
          />
          <SubmitButton tone="secondary" pendingText="جارٍ الرفع…">
            رفع الصور
          </SubmitButton>
        </form>
      )}
      {!canWrite && images.length === 0 && <p className="text-sm text-ink-soft">لا توجد صور.</p>}
      {pending && <p className="text-xs text-ink-soft">جارٍ التحديث…</p>}
    </div>
  );
}
