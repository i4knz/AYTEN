import { eq } from "drizzle-orm";
import { z } from "zod";
import { audit, type RequestMeta } from "../audit";
import { fieldErrors } from "../auth/schemas";
import { storeSettings, type StoreFeatures, type TrackingSettings } from "../db/schema";
import { withTenant } from "../db/tenant";
import { AppError } from "../lib/errors";
import { requireStoreAccess } from "../stores/service";

// Only IDs are accepted, never script code: the storefront builds the
// official snippet for each provider itself, and only after the shopper
// consents to marketing cookies.
const optionalId = (re: RegExp, message: string) =>
  z
    .string()
    .trim()
    .optional()
    .transform((v) => v || undefined)
    .refine((v) => v === undefined || re.test(v), { error: message });

export const trackingSchema = z.object({
  ga4: optionalId(/^G-[A-Z0-9]{4,12}$/, "معرّف Google Analytics يبدأ بـ G-"),
  gtm: optionalId(/^GTM-[A-Z0-9]{4,10}$/, "معرّف Tag Manager يبدأ بـ GTM-"),
  metaPixel: optionalId(/^\d{10,20}$/, "معرّف Meta Pixel أرقام فقط"),
  tiktokPixel: optionalId(/^[A-Z0-9]{10,30}$/, "معرّف TikTok Pixel غير صالح"),
  snapPixel: optionalId(/^[0-9a-f-]{36}$/, "معرّف Snap Pixel غير صالح"),
});

export async function getStoreTracking(storeId: string): Promise<{ tracking: TrackingSettings; features: StoreFeatures }> {
  return withTenant({ storeId }, async (tx) => {
    const [row] = await tx.select({ tracking: storeSettings.tracking, features: storeSettings.features }).from(storeSettings).where(eq(storeSettings.storeId, storeId)).limit(1);
    return { tracking: row?.tracking ?? {}, features: row?.features ?? { whatsappButton: true, reviews: true, stockHints: true, shareButtons: true } };
  });
}

export async function saveTracking(userId: string, storeId: string, input: unknown, meta: RequestMeta = {}) {
  await requireStoreAccess(userId, storeId, "marketing.write");
  const parsed = trackingSchema.safeParse(input);
  if (!parsed.success) throw new AppError("validation", "راجع الحقول المظللة.", fieldErrors(parsed.error));
  const tracking = Object.fromEntries(Object.entries(parsed.data).filter(([, v]) => v)) as TrackingSettings;
  await withTenant({ storeId, userId }, async (tx) => {
    await tx.update(storeSettings).set({ tracking }).where(eq(storeSettings.storeId, storeId));
    await audit({ storeId, actorId: userId, action: "tracking.updated", metadata: { providers: Object.keys(tracking) }, meta }, tx);
  });
}

export const FEATURE_LIST: { key: keyof StoreFeatures; title: string; body: string }[] = [
  { key: "whatsappButton", title: "زر واتساب العائم", body: "زر ثابت في زاوية المتجر يفتح محادثة واتساب معك (يتطلب رقم واتساب في الإعدادات)." },
  { key: "reviews", title: "تقييمات المنتجات", body: "يستطيع العميل تقييم المنتج بعد استلام طلبه، وتظهر التقييمات بعد موافقتك." },
  { key: "stockHints", title: "تنبيه الكمية المتبقية", body: "عبارة «متبقٍ 2 فقط» عندما تقل الكمية، لتحفيز الشراء بصدق." },
  { key: "shareButtons", title: "أزرار المشاركة", body: "مشاركة المنتج عبر واتساب وإكس ونسخ الرابط من صفحة المنتج." },
];

export async function setFeature(userId: string, storeId: string, key: keyof StoreFeatures, enabled: boolean, meta: RequestMeta = {}) {
  await requireStoreAccess(userId, storeId, "settings.write");
  if (!FEATURE_LIST.some((f) => f.key === key)) throw new AppError("validation", "ميزة غير معروفة.");
  await withTenant({ storeId, userId }, async (tx) => {
    const [row] = await tx.select({ features: storeSettings.features }).from(storeSettings).where(eq(storeSettings.storeId, storeId)).limit(1);
    await tx.update(storeSettings).set({ features: { ...row.features, [key]: enabled } }).where(eq(storeSettings.storeId, storeId));
    await audit({ storeId, actorId: userId, action: "feature.toggled", metadata: { key, enabled }, meta }, tx);
  });
}
