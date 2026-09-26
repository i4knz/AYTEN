"use client";

import { useActionState } from "react";
import type { FormState } from "@/server/web";
import { trackOrderAction } from "../actions";

const inputCls = "w-full rounded-(--radius) border border-line px-3.5 py-2.5 text-sm";

export function TrackForm({ slug }: { slug: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(trackOrderAction.bind(null, slug), {});
  return (
    <form action={action} className="flex flex-col gap-3">
      {state.message && <p role="alert" className="text-sm text-red-700">{state.message}</p>}
      <label className="flex flex-col gap-1 text-sm">
        رقم الطلب
        <input name="number" inputMode="numeric" dir="ltr" required placeholder="1001" className={inputCls} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        رقم الجوال
        <input name="phone" type="tel" dir="ltr" required placeholder="05XXXXXXXX" className={inputCls} />
      </label>
      <button type="submit" disabled={pending} className="rounded-(--radius) bg-(--store) px-5 py-3 font-semibold text-(--on-store)">
        {pending ? "جارٍ البحث…" : "عرض الطلب"}
      </button>
    </form>
  );
}
