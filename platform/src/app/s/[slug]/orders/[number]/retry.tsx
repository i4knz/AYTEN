"use client";

import { useTransition } from "react";
import { retryPaymentAction } from "../../actions";

export function RetryPayment({ slug, number, accessKey }: { slug: string; number: number; accessKey: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => start(() => retryPaymentAction(slug, number, accessKey))}
      className="self-start rounded-(--radius) bg-(--store) px-4 py-2 font-semibold text-(--on-store)"
    >
      {pending ? "جارٍ التحويل…" : "ادفع الآن"}
    </button>
  );
}
