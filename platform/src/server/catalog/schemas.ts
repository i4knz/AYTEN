import { z } from "zod";
import { parseMoney } from "../lib/money";

export const MAX_OPTIONS = 3;
export const MAX_OPTION_VALUES = 30;
export const MAX_VARIANTS = 100;
export const MAX_IMAGES = 10;
export const MAX_QUANTITY = 1_000_000;

/**
 * URL slug that keeps Arabic letters (readable, good for Arabic search) and
 * drops URL delimiters, punctuation and diacritics.
 */
export function toCatalogSlug(name: string, fallback = "item"): string {
  const slug = name
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[ً-ٰٟـ]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
  return slug || fallback;
}

const money = (label: string, { required }: { required: boolean }) =>
  z
    .string()
    .max(20)
    .transform((value, ctx) => {
      const amount = parseMoney(value);
      if (amount === null) {
        if (required) ctx.addIssue({ code: "custom", message: `${label} مطلوب.` });
        return null;
      }
      if (Number.isNaN(amount)) {
        ctx.addIssue({ code: "custom", message: `${label} غير صالح. استخدم أرقاماً فقط، مثل 99.50` });
        return z.NEVER;
      }
      return amount;
    });

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => v || null);

export const variantInputSchema = z.object({
  id: z.uuid().optional(),
  optionValues: z.array(z.string().trim().min(1).max(40)).max(MAX_OPTIONS),
  price: money("السعر", { required: true }),
  compareAtPrice: money("السعر قبل الخصم", { required: false }),
  cost: money("التكلفة", { required: false }),
  sku: optionalText(64),
  trackInventory: z.boolean(),
  quantity: z.union([z.literal(""), z.coerce.number().int().min(0, { error: "الكمية لا تقل عن صفر." }).max(MAX_QUANTITY)]),
});

export const productInputSchema = z
  .object({
    name: z.string().trim().min(1, { error: "اسم المنتج مطلوب." }).max(150, { error: "اسم المنتج طويل جداً." }),
    slug: z.string().trim().max(160).optional().default(""),
    description: z.string().max(10000, { error: "الوصف طويل جداً (الحد 10000 حرف)." }).default(""),
    status: z.enum(["draft", "active"], { error: "حالة غير صالحة." }),
    categoryIds: z.array(z.uuid()).max(20).default([]),
    seoTitle: optionalText(70),
    seoDescription: optionalText(320),
    options: z
      .array(
        z.object({
          name: z.string().trim().min(1, { error: "اسم الخيار مطلوب." }).max(40),
          values: z
            .array(z.string().trim().min(1).max(40))
            .min(1, { error: "أضف قيمة واحدة على الأقل للخيار." })
            .max(MAX_OPTION_VALUES),
        }),
      )
      .max(MAX_OPTIONS, { error: `الحد الأقصى ${MAX_OPTIONS} خيارات.` }),
    variants: z.array(variantInputSchema).min(1).max(MAX_VARIANTS, { error: `الحد الأقصى ${MAX_VARIANTS} نسخة للمنتج.` }),
  })
  .superRefine((p, ctx) => {
    const names = p.options.map((o) => o.name);
    if (new Set(names).size !== names.length) ctx.addIssue({ code: "custom", path: ["options"], message: "أسماء الخيارات مكررة." });
    p.options.forEach((o, i) => {
      if (new Set(o.values).size !== o.values.length) {
        ctx.addIssue({ code: "custom", path: ["options", i, "values"], message: `قيم الخيار «${o.name}» مكررة.` });
      }
    });
    if (p.options.length === 0 && p.variants.length !== 1) {
      ctx.addIssue({ code: "custom", path: ["variants"], message: "المنتج بدون خيارات له نسخة واحدة فقط." });
    }
    const seen = new Set<string>();
    p.variants.forEach((v, i) => {
      if (v.optionValues.length !== p.options.length) {
        ctx.addIssue({ code: "custom", path: ["variants", i], message: "قيم الخيارات لا تطابق الخيارات المعرّفة." });
        return;
      }
      v.optionValues.forEach((val, j) => {
        if (!p.options[j].values.includes(val)) {
          ctx.addIssue({ code: "custom", path: ["variants", i], message: `القيمة «${val}» غير موجودة في خيار «${p.options[j].name}».` });
        }
      });
      const key = v.optionValues.join("\u0000");
      if (seen.has(key)) ctx.addIssue({ code: "custom", path: ["variants", i], message: "توجد نسختان بنفس الخيارات." });
      seen.add(key);
      if (v.price != null && v.compareAtPrice != null && v.compareAtPrice <= v.price) {
        ctx.addIssue({ code: "custom", path: ["variants", i, "compareAtPrice"], message: "السعر قبل الخصم يجب أن يكون أعلى من السعر." });
      }
    });
    const skus = p.variants.map((v) => v.sku).filter(Boolean);
    if (new Set(skus).size !== skus.length) ctx.addIssue({ code: "custom", path: ["variants"], message: "رمز SKU مكرر بين النسخ." });
  });

export type ProductInput = z.infer<typeof productInputSchema>;

export const categoryInputSchema = z.object({
  name: z.string().trim().min(1, { error: "اسم التصنيف مطلوب." }).max(80, { error: "اسم التصنيف طويل جداً." }),
  parentId: z
    .string()
    .optional()
    .transform((v) => v || null)
    .pipe(z.uuid().nullable()),
  description: optionalText(2000),
});

export const inventoryAdjustSchema = z.object({
  mode: z.enum(["set", "add"]),
  quantity: z.coerce.number({ error: "أدخل رقماً صحيحاً." }).int({ error: "أدخل رقماً صحيحاً." }).min(-MAX_QUANTITY).max(MAX_QUANTITY),
  note: optionalText(500),
});
