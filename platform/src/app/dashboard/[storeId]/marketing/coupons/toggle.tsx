"use client";

import { useTransition } from "react";
import { toggleCouponAction } from "../actions";

export function CouponToggle({ storeId, couponId, active }: { storeId: string; couponId: string; active: boolean }) {
  const [pending, start] = useTransition();
  return (
    <button type="button" disabled={pending} onClick={() => start(() => toggleCouponAction(storeId, couponId, !active))} className="text-xs text-brand">
      {active ? "إيقاف" : "تفعيل"}
    </button>
  );
}
