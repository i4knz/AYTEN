"use client";

import { useOptimistic, useTransition } from "react";
import type { StoreFeatures } from "@/server/db/schema";
import { setFeatureAction } from "../embed/actions";

export function FeatureToggle({ storeId, featureKey, enabled, disabled, label }: { storeId: string; featureKey: keyof StoreFeatures; enabled: boolean; disabled: boolean; label: string }) {
  const [pending, start] = useTransition();
  const [on, setOn] = useOptimistic(enabled);
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled || pending}
      onClick={() =>
        start(async () => {
          setOn(!on);
          await setFeatureAction(storeId, featureKey, !on);
        })
      }
      className={`relative h-7 w-12 shrink-0 rounded-full transition ${on ? "bg-brand" : "bg-line"} disabled:opacity-50`}
    >
      <span className={`absolute top-1 size-5 rounded-full bg-white shadow transition-all ${on ? "start-6" : "start-1"}`} />
    </button>
  );
}
