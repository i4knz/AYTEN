"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

export function CopyField({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2 rounded-xl border border-line bg-muted/50 p-1.5 ps-3">
      <input readOnly value={value} aria-label={label} dir="ltr" className="min-w-0 flex-1 bg-transparent font-mono text-sm outline-none" onFocus={(e) => e.currentTarget.select()} />
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          } catch {
            // Clipboard can be blocked; the field stays selectable for manual copy.
          }
        }}
        className="flex items-center gap-1 rounded-lg bg-surface px-3 py-1.5 text-sm font-medium shadow-sm"
      >
        {copied ? <Check className="size-4 text-emerald-600" aria-hidden /> : <Copy className="size-4" aria-hidden />}
        {copied ? "تم النسخ" : "نسخ"}
      </button>
    </div>
  );
}
