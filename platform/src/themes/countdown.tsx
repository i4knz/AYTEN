"use client";

import { useSyncExternalStore } from "react";

// Ticks once per second. The server snapshot is null so the numbers render
// only in the browser (no hydration mismatch, no stale server time).
function subscribe(cb: () => void) {
  const id = setInterval(cb, 1000);
  return () => clearInterval(id);
}
const nowSeconds = () => Math.floor(Date.now() / 1000);
const serverSnapshot = () => null;

const UNITS = [
  ["يوم", 86_400],
  ["ساعة", 3_600],
  ["دقيقة", 60],
  ["ثانية", 1],
] as const;

export function Countdown({ endsAt, expiredText = "انتهى العرض" }: { endsAt: number; expiredText?: string }) {
  const now = useSyncExternalStore(subscribe, nowSeconds, serverSnapshot);
  if (now === null) {
    return <div className="h-16" aria-hidden />;
  }
  const left = Math.max(0, Math.floor(endsAt / 1000) - now);
  if (left === 0) return <p className="font-semibold">{expiredText}</p>;
  return (
    <div className="flex gap-2" role="timer" aria-live="off">
      {UNITS.map(([label, size], i) => {
        // Days are unbounded; every smaller unit wraps at the next unit's size.
        const value = i === 0 ? Math.floor(left / size) : Math.floor((left % UNITS[i - 1][1]) / size);
        return (
          <span key={label} className="flex min-w-14 flex-col items-center rounded-(--radius) bg-black/10 px-2 py-1.5">
            <span className="ltr text-2xl font-bold tabular-nums">{String(value).padStart(2, "0")}</span>
            <span className="text-[11px] opacity-80">{label}</span>
          </span>
        );
      })}
    </div>
  );
}
