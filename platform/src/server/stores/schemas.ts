import { z } from "zod";
import { BUSINESS_TYPES } from "../db/schema";

export const BUSINESS_TYPE_LABELS: Record<(typeof BUSINESS_TYPES)[number], string> = {
  fashion: "ملابس وأزياء",
  beauty: "عطور وتجميل",
  electronics: "إلكترونيات وإكسسوارات",
  digital: "منتجات رقمية",
  food: "أغذية وحلويات",
  general: "متجر عام",
};

export const createStoreSchema = z.object({
  name: z
    .string({ error: "اسم المتجر مطلوب." })
    .trim()
    .min(2, { error: "اسم المتجر قصير جداً." })
    .max(60, { error: "اسم المتجر يجب ألا يزيد على 60 حرفاً." }),
  slug: z.string({ error: "رابط المتجر مطلوب." }).trim().toLowerCase(),
  businessType: z.enum(BUSINESS_TYPES, { error: "اختر مجال النشاط." }),
});

// Saudi mobile numbers are normalized to E.164 (+9665XXXXXXXX). Other
// countries will get their own rules when we expand.
function normalizeSaPhone(value: string): string | null {
  const digits = value.replace(/[\s\-()]/g, "").replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
  const m = digits.match(/^(?:\+?966|00966|0)?(5\d{8})$/);
  return m ? `+966${m[1]}` : null;
}

const optionalPhone = z
  .string()
  .trim()
  .transform((v, ctx) => {
    if (!v) return null;
    const normalized = normalizeSaPhone(v);
    if (!normalized) {
      ctx.addIssue({ code: "custom", message: "أدخل رقم جوال سعودي صحيحاً مثل 05XXXXXXXX." });
      return z.NEVER;
    }
    return normalized;
  });

export const updateStoreProfileSchema = z.object({
  name: createStoreSchema.shape.name,
  contactEmail: z
    .string()
    .trim()
    .toLowerCase()
    .transform((v) => v || null)
    .pipe(z.email({ error: "أدخل بريداً إلكترونياً صحيحاً." }).max(254).nullable()),
  contactPhone: optionalPhone,
  whatsapp: optionalPhone,
  brandColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, { error: "لون غير صالح." }),
});

export { normalizeSaPhone };
