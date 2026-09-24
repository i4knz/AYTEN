"use client";

import { useActionState, useMemo, useState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Button, Card, Field, Input, Select } from "@/components/ui";
import type { FormState } from "@/server/web";
import { saveProductAction } from "./actions";

export interface VariantRow {
  id?: string;
  optionValues: string[];
  price: string;
  compareAtPrice: string;
  cost: string;
  sku: string;
  trackInventory: boolean;
  quantity: string;
}

export interface ProductFormValues {
  name: string;
  slug: string;
  description: string;
  status: "draft" | "active";
  categoryIds: string[];
  seoTitle: string;
  seoDescription: string;
  options: { name: string; values: string[] }[];
  variants: VariantRow[];
}

const emptyVariant = (optionValues: string[] = [], from?: VariantRow): VariantRow => ({
  optionValues,
  price: from?.price ?? "",
  compareAtPrice: from?.compareAtPrice ?? "",
  cost: from?.cost ?? "",
  sku: "",
  trackInventory: from?.trackInventory ?? true,
  quantity: "",
});

export const emptyProduct: ProductFormValues = {
  name: "",
  slug: "",
  description: "",
  status: "active",
  categoryIds: [],
  seoTitle: "",
  seoDescription: "",
  options: [],
  variants: [emptyVariant()],
};

const MAX_OPTIONS = 3;
const splitValues = (text: string) =>
  Array.from(new Set(text.split(/[,،\n]/).map((v) => v.trim()).filter(Boolean))).slice(0, 30);

function cartesian(options: { values: string[] }[]): string[][] {
  return options.reduce<string[][]>((acc, o) => acc.flatMap((prefix) => o.values.map((v) => [...prefix, v])), [[]]);
}

const keyOf = (values: string[]) => values.join("\u0000");

export function ProductForm({
  storeId,
  productId,
  initial,
  categories,
  canAdjustStock,
  storefrontBase,
}: {
  storeId: string;
  productId: string | null;
  initial: ProductFormValues;
  categories: { id: string; name: string; parentId: string | null }[];
  canAdjustStock: boolean;
  storefrontBase: string;
}) {
  const [state, action] = useActionState<FormState, FormData>(saveProductAction.bind(null, storeId, productId), {});
  const [values, setValues] = useState<ProductFormValues>(initial);
  // Option values are edited as comma-separated text and parsed on change.
  const [optionText, setOptionText] = useState(initial.options.map((o) => o.values.join("، ")));
  const e = state.fieldErrors ?? {};

  const set = <K extends keyof ProductFormValues>(key: K, value: ProductFormValues[K]) => setValues((v) => ({ ...v, [key]: value }));

  /** Rebuilds the variant list from options, keeping rows whose option values still exist. */
  function applyOptions(options: { name: string; values: string[] }[]) {
    setValues((v) => {
      const usable = options.filter((o) => o.name.trim() && o.values.length);
      const byKey = new Map(v.variants.map((row) => [keyOf(row.optionValues), row]));
      const template = v.variants[0];
      const variants = usable.length
        ? cartesian(usable).map((combo) => byKey.get(keyOf(combo)) ?? emptyVariant(combo, template))
        : [byKey.get("") ?? { ...(template ?? emptyVariant()), optionValues: [] }];
      return { ...v, options, variants };
    });
  }

  function updateOption(i: number, patch: { name?: string; text?: string }) {
    const texts = [...optionText];
    if (patch.text !== undefined) texts[i] = patch.text;
    setOptionText(texts);
    const options = values.options.map((o, j) =>
      j === i ? { name: patch.name ?? o.name, values: patch.text !== undefined ? splitValues(patch.text) : o.values } : o,
    );
    applyOptions(options);
  }

  function addOption() {
    if (values.options.length >= MAX_OPTIONS) return;
    setOptionText([...optionText, ""]);
    set("options", [...values.options, { name: values.options.length === 0 ? "اللون" : values.options.length === 1 ? "المقاس" : "", values: [] }]);
  }

  function removeOption(i: number) {
    setOptionText(optionText.filter((_, j) => j !== i));
    applyOptions(values.options.filter((_, j) => j !== i));
  }

  function updateVariant(i: number, patch: Partial<VariantRow>) {
    setValues((v) => ({ ...v, variants: v.variants.map((row, j) => (j === i ? { ...row, ...patch } : row)) }));
  }

  function fillAll(field: "price" | "compareAtPrice" | "quantity") {
    const first = values.variants[0]?.[field] ?? "";
    setValues((v) => ({ ...v, variants: v.variants.map((row) => ({ ...row, [field]: first })) }));
  }

  const usableOptions = values.options.filter((o) => o.name.trim() && o.values.length);
  const hasVariants = usableOptions.length > 0;
  const payload = useMemo(
    () =>
      JSON.stringify({
        ...values,
        options: usableOptions,
        variants: values.variants.map((row) => ({
          ...row,
          quantity: row.quantity.trim() === "" ? "" : Number(row.quantity.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))),
        })),
      }),
    [values, usableOptions],
  );
  const single = values.variants[0];
  const variantError = (i: number) =>
    Object.entries(e).find(([k]) => k === `variants.${i}` || k.startsWith(`variants.${i}.`))?.[1];

  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      <input type="hidden" name="payload" value={payload} />
      {state.message && <Alert>{state.message}</Alert>}

      <Card className="flex flex-col gap-4">
        <Field label="اسم المنتج" name="name" error={e.name}>
          <Input id="name" value={values.name} onChange={(ev) => set("name", ev.target.value)} maxLength={150} required aria-invalid={!!e.name} />
        </Field>
        <Field label="الوصف" name="description" error={e.description} hint="اكتب ما يحتاجه العميل ليقرر: المواد، المقاسات، طريقة الاستخدام، ومحتوى العبوة.">
          <textarea
            id="description"
            value={values.description}
            onChange={(ev) => set("description", ev.target.value)}
            rows={6}
            maxLength={10000}
            className="w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm leading-7 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
          />
        </Field>
      </Card>

      <Card className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">الخيارات</h2>
          {values.options.length < MAX_OPTIONS && (
            <Button type="button" tone="secondary" onClick={addOption}>
              + إضافة خيار (لون، مقاس…)
            </Button>
          )}
        </div>
        {values.options.length === 0 && <p className="text-sm text-ink-soft">منتج بسيط بسعر وكمية واحدة. أضف خيارات إذا كان للمنتج ألوان أو مقاسات.</p>}
        {values.options.map((o, i) => (
          <div key={i} className="grid gap-3 rounded-xl border border-line p-3 sm:grid-cols-[10rem_1fr_auto] sm:items-end">
            <Field label={`اسم الخيار ${i + 1}`} name={`option-${i}-name`}>
              <Input id={`option-${i}-name`} value={o.name} maxLength={40} onChange={(ev) => updateOption(i, { name: ev.target.value })} />
            </Field>
            <Field label="القيم (افصل بينها بفاصلة)" name={`option-${i}-values`} hint={o.values.length ? `${o.values.length} قيم` : undefined}>
              <Input id={`option-${i}-values`} value={optionText[i] ?? ""} placeholder="أحمر، أسود، أبيض" onChange={(ev) => updateOption(i, { text: ev.target.value })} />
            </Field>
            <Button type="button" tone="ghost" className="text-red-700" onClick={() => removeOption(i)}>
              حذف
            </Button>
          </div>
        ))}
      </Card>

      <Card className="flex flex-col gap-4">
        <h2 className="font-semibold">{hasVariants ? `السعر والمخزون لكل نسخة (${values.variants.length})` : "السعر والمخزون"}</h2>
        {!hasVariants && single ? (
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="السعر (ر.س)" name="price" error={variantError(0)}>
              <Input id="price" inputMode="decimal" dir="ltr" value={single.price} onChange={(ev) => updateVariant(0, { price: ev.target.value })} placeholder="0.00" />
            </Field>
            <Field label="السعر قبل الخصم" name="compareAtPrice" hint="اختياري. يظهر مشطوباً.">
              <Input id="compareAtPrice" inputMode="decimal" dir="ltr" value={single.compareAtPrice} onChange={(ev) => updateVariant(0, { compareAtPrice: ev.target.value })} />
            </Field>
            <Field label="التكلفة" name="cost" hint="اختياري. لا تظهر للعملاء.">
              <Input id="cost" inputMode="decimal" dir="ltr" value={single.cost} onChange={(ev) => updateVariant(0, { cost: ev.target.value })} />
            </Field>
            <Field label="رمز المنتج SKU" name="sku" hint="اختياري.">
              <Input id="sku" dir="ltr" value={single.sku} maxLength={64} onChange={(ev) => updateVariant(0, { sku: ev.target.value })} />
            </Field>
            <Field label="الكمية المتوفرة" name="quantity" hint={canAdjustStock ? undefined : "تعديل الكمية يتطلب صلاحية المخزون."}>
              <Input
                id="quantity"
                inputMode="numeric"
                dir="ltr"
                value={single.trackInventory ? single.quantity : ""}
                disabled={!single.trackInventory || !canAdjustStock}
                onChange={(ev) => updateVariant(0, { quantity: ev.target.value })}
                placeholder={single.trackInventory ? "0" : "غير محدود"}
              />
            </Field>
            <label className="flex items-center gap-2 self-end pb-3 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-brand"
                checked={single.trackInventory}
                disabled={!canAdjustStock}
                onChange={(ev) => updateVariant(0, { trackInventory: ev.target.checked })}
              />
              تتبّع الكمية
            </label>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="text-ink-soft">تعبئة الكل من الصف الأول:</span>
              <button type="button" className="text-brand underline" onClick={() => fillAll("price")}>السعر</button>
              <button type="button" className="text-brand underline" onClick={() => fillAll("compareAtPrice")}>السعر قبل الخصم</button>
              {canAdjustStock && <button type="button" className="text-brand underline" onClick={() => fillAll("quantity")}>الكمية</button>}
            </div>
            {/* One markup for all sizes: stacked cards on phones, a table-like grid from sm up. */}
            <div className="hidden grid-cols-[1.4fr_1fr_1fr_1fr_0.8fr] gap-2 text-xs text-ink-soft sm:grid">
              <span>النسخة</span>
              <span>السعر</span>
              <span>قبل الخصم</span>
              <span>SKU</span>
              <span>الكمية</span>
            </div>
            <ul className="flex flex-col gap-3 sm:gap-0 sm:divide-y sm:divide-line">
              {values.variants.map((row, i) => {
                const title = row.optionValues.join(" / ");
                const cell = "flex flex-col gap-1";
                const mobileLabel = "text-xs text-ink-soft sm:sr-only";
                return (
                  <li
                    key={keyOf(row.optionValues)}
                    className="grid grid-cols-2 gap-2 rounded-xl border border-line p-3 sm:grid-cols-[1.4fr_1fr_1fr_1fr_0.8fr] sm:items-start sm:rounded-none sm:border-0 sm:px-0 sm:py-2"
                  >
                    <div className="col-span-2 font-medium sm:col-span-1 sm:pt-2.5">
                      {title}
                      {variantError(i) && <p className="mt-1 text-xs font-normal text-red-700">{variantError(i)}</p>}
                    </div>
                    <label className={cell}>
                      <span className={mobileLabel}>السعر</span>
                      <Input aria-label={`سعر ${title}`} inputMode="decimal" dir="ltr" value={row.price} onChange={(ev) => updateVariant(i, { price: ev.target.value })} />
                    </label>
                    <label className={cell}>
                      <span className={mobileLabel}>قبل الخصم</span>
                      <Input aria-label={`السعر قبل الخصم ${title}`} inputMode="decimal" dir="ltr" value={row.compareAtPrice} onChange={(ev) => updateVariant(i, { compareAtPrice: ev.target.value })} />
                    </label>
                    <label className={cell}>
                      <span className={mobileLabel}>SKU</span>
                      <Input aria-label={`SKU ${title}`} dir="ltr" value={row.sku} maxLength={64} onChange={(ev) => updateVariant(i, { sku: ev.target.value })} />
                    </label>
                    <label className={cell}>
                      <span className={mobileLabel}>الكمية</span>
                      <Input
                        aria-label={`كمية ${title}`}
                        inputMode="numeric"
                        dir="ltr"
                        value={row.quantity}
                        disabled={!canAdjustStock}
                        onChange={(ev) => updateVariant(i, { quantity: ev.target.value })}
                      />
                    </label>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </Card>

      <Card className="flex flex-col gap-4">
        <h2 className="font-semibold">التنظيم والظهور</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="الحالة" name="status" hint="المسودة لا تظهر للعملاء.">
            <Select id="status" value={values.status} onChange={(ev) => set("status", ev.target.value as "draft" | "active")}>
              <option value="active">منشور</option>
              <option value="draft">مسودة</option>
            </Select>
          </Field>
          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1.5 text-sm font-medium">التصنيفات</legend>
            {categories.length === 0 ? (
              <p className="text-xs text-ink-soft">لا توجد تصنيفات بعد. أنشئها من صفحة التصنيفات.</p>
            ) : (
              <div className="flex max-h-40 flex-col gap-1 overflow-y-auto rounded-xl border border-line p-2">
                {categories.map((c) => (
                  <label key={c.id} className={`flex items-center gap-2 text-sm ${c.parentId ? "ps-5" : ""}`}>
                    <input
                      type="checkbox"
                      className="size-4 accent-brand"
                      checked={values.categoryIds.includes(c.id)}
                      onChange={(ev) =>
                        set("categoryIds", ev.target.checked ? [...values.categoryIds, c.id] : values.categoryIds.filter((id) => id !== c.id))
                      }
                    />
                    {c.name}
                  </label>
                ))}
              </div>
            )}
          </fieldset>
        </div>
        <details className="rounded-xl border border-line p-3">
          <summary className="cursor-pointer text-sm font-medium">تحسين الظهور في محركات البحث (اختياري)</summary>
          <div className="mt-3 flex flex-col gap-3">
            <Field label="رابط المنتج" name="slug" hint={`${storefrontBase}/products/${values.slug || "…"}`}>
              <Input id="slug" value={values.slug} maxLength={160} onChange={(ev) => set("slug", ev.target.value)} placeholder="يُنشأ تلقائياً من الاسم" />
            </Field>
            <Field label={`عنوان الصفحة (${values.seoTitle.length}/70)`} name="seoTitle">
              <Input id="seoTitle" value={values.seoTitle} maxLength={70} onChange={(ev) => set("seoTitle", ev.target.value)} placeholder={values.name} />
            </Field>
            <Field label={`وصف الصفحة (${values.seoDescription.length}/320)`} name="seoDescription">
              <textarea
                id="seoDescription"
                value={values.seoDescription}
                maxLength={320}
                rows={3}
                onChange={(ev) => set("seoDescription", ev.target.value)}
                className="w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm outline-none focus:border-brand"
              />
            </Field>
            <div className="rounded-lg bg-muted p-3 text-sm" aria-label="معاينة نتيجة البحث">
              <p className="truncate text-[#1a0dab]">{values.seoTitle || values.name || "عنوان المنتج"}</p>
              <p className="ltr truncate text-end text-xs text-emerald-800">{storefrontBase}/products/{values.slug || "…"}</p>
              <p className="line-clamp-2 text-xs text-ink-soft">{values.seoDescription || values.description.slice(0, 160) || "وصف المنتج…"}</p>
            </div>
          </div>
        </details>
      </Card>

      <div className="sticky bottom-0 -mx-4 flex justify-end gap-2 border-t border-line bg-canvas/95 px-4 py-3 backdrop-blur md:static md:mx-0 md:border-0 md:bg-transparent md:p-0">
        <SubmitButton pendingText="جارٍ الحفظ…">{productId ? "حفظ التغييرات" : "حفظ المنتج"}</SubmitButton>
      </div>
    </form>
  );
}
