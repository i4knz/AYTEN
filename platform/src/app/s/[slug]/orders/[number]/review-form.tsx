"use client";

import { useActionState, useState } from "react";
import type { FormState } from "@/server/web";
import { submitReviewAction } from "../../actions";

export function ReviewForm({ slug, number, accessKey, productId, productName }: { slug: string; number: number; accessKey: string; productId: string; productName: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(submitReviewAction.bind(null, slug, number, accessKey), {});
  const [rating, setRating] = useState(0);
  if (state.ok) return <p className="text-sm text-emerald-700">{state.message}</p>;
  return (
    <form action={action} className="flex flex-col gap-2 border-t border-line pt-3 first:border-0 first:pt-0">
      <p className="text-sm font-medium">{productName}</p>
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="rating" value={rating || ""} />
      <div className="flex gap-1" role="radiogroup" aria-label={`تقييم ${productName}`}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={rating === n}
            aria-label={`${n} من 5`}
            onClick={() => setRating(n)}
            className={`text-2xl leading-none ${n <= rating ? "text-amber-500" : "text-ink-faint"}`}
          >
            ★
          </button>
        ))}
      </div>
      <textarea name="body" rows={2} maxLength={2000} placeholder="شاركنا رأيك (اختياري)" aria-label="نص التقييم" className="rounded-(--radius) border border-line px-3 py-2 text-sm" />
      {state.message && <p className="text-xs text-red-700">{state.message}</p>}
      <button type="submit" disabled={pending || !rating} className="self-start rounded-(--radius) bg-(--store) px-4 py-2 text-sm text-(--on-store) disabled:opacity-50">
        إرسال التقييم
      </button>
    </form>
  );
}
