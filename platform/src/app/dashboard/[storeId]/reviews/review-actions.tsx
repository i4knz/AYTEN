"use client";

import { useState, useTransition } from "react";
import { moderateAction } from "./actions";

export function ReviewActions({ storeId, reviewId, status, reply }: { storeId: string; reviewId: string; status: string; reply: string }) {
  const [pending, start] = useTransition();
  const [text, setText] = useState(reply);
  return (
    <div className="flex flex-col gap-2 border-t border-line pt-2">
      <div className="flex gap-3 text-sm">
        {status !== "approved" && <button type="button" disabled={pending} onClick={() => start(() => moderateAction(storeId, reviewId, { status: "approved" }))} className="font-semibold text-emerald-700">نشر</button>}
        {status !== "rejected" && <button type="button" disabled={pending} onClick={() => start(() => moderateAction(storeId, reviewId, { status: "rejected" }))} className="text-red-700">رفض</button>}
      </div>
      <div className="flex gap-2">
        <input value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} placeholder="رد المتجر (يظهر تحت التقييم)" aria-label="رد المتجر" className="min-w-0 flex-1 rounded-lg border border-line px-3 py-1.5 text-sm" />
        <button type="button" disabled={pending} onClick={() => start(() => moderateAction(storeId, reviewId, { reply: text }))} className="text-sm text-brand">حفظ الرد</button>
      </div>
    </div>
  );
}
