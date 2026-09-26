"use client";

import { useTransition } from "react";
import type { PageTemplate } from "@/server/design/pages";
import { createFromTemplateAction } from "./actions";

export function TemplateButton({ storeId, template, label }: { storeId: string; template: PageTemplate; label: string }) {
  const [pending, start] = useTransition();
  return (
    <button type="button" disabled={pending} onClick={() => start(() => createFromTemplateAction(storeId, template))} className="rounded-full border border-line px-3 py-1.5 text-sm hover:border-brand">
      + {label}
    </button>
  );
}
