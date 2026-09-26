"use client";

import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Field, Input, Select } from "@/components/ui";
import type { FormState } from "@/server/web";
import { saveTrackingAction } from "./actions";

const FIELDS = [
  ["ga4", "Google Analytics 4", "G-XXXXXXXXXX"],
  ["gtm", "Google Tag Manager", "GTM-XXXXXXX"],
  ["metaPixel", "Meta Pixel (فيسبوك وإنستغرام)", "123456789012345"],
  ["tiktokPixel", "TikTok Pixel", "C1ABCDEFGHIJK"],
  ["snapPixel", "Snap Pixel", "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"],
] as const;

export function TrackingForm({ storeId, initial, canEdit }: { storeId: string; initial: Partial<Record<(typeof FIELDS)[number][0], string>>; canEdit: boolean }) {
  const [state, action] = useActionState<FormState, FormData>(saveTrackingAction.bind(null, storeId), {});
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-3">
      {state.message && <Alert tone={state.ok ? "success" : "error"}>{state.message}</Alert>}
      <fieldset disabled={!canEdit} className="grid gap-3 sm:grid-cols-2">
        {FIELDS.map(([key, label, placeholder]) => (
          <Field key={key} label={label} name={key} error={e[key]}>
            <Input id={key} name={key} dir="ltr" placeholder={placeholder} defaultValue={state.values?.[key] ?? initial[key] ?? ""} />
          </Field>
        ))}
      </fieldset>
      {canEdit && <SubmitButton className="self-start" pendingText="…">حفظ</SubmitButton>}
    </form>
  );
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function EmbedSnippet({ storeUrl, products }: { storeUrl: string; products: { name: string; slug: string }[] }) {
  const [slug, setSlug] = useState(products[0]?.slug ?? "");
  const [copied, setCopied] = useState(false);
  if (!products.length) return <p className="text-sm text-ink-soft">انشر منتجاً أولاً.</p>;
  const product = products.find((p) => p.slug === slug) ?? products[0];
  const url = `${storeUrl}/products/${encodeURIComponent(product.slug)}`;
  const code = `<a href="${esc(url)}" target="_blank" rel="noopener" style="display:inline-block;padding:12px 24px;border-radius:10px;background:#0f766e;color:#fff;font-family:sans-serif;text-decoration:none">اشترِ ${esc(product.name)}</a>`;
  return (
    <div className="flex flex-col gap-3">
      <Select value={slug} onChange={(ev) => setSlug(ev.target.value)} aria-label="اختر المنتج">
        {products.map((p) => (
          <option key={p.slug} value={p.slug}>{p.name}</option>
        ))}
      </Select>
      <textarea readOnly value={code} rows={4} dir="ltr" aria-label="كود التضمين" className="rounded-xl border border-line bg-muted p-3 font-mono text-xs" />
      <button type="button" className="self-start text-sm text-brand" onClick={() => void navigator.clipboard.writeText(code).then(() => setCopied(true))}>
        {copied ? "تم النسخ ✓" : "نسخ الكود"}
      </button>
    </div>
  );
}
