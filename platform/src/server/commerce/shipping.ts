import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { audit, type RequestMeta } from "../audit";
import { fieldErrors } from "../auth/schemas";
import { SHIPPING_TYPES, shippingMethods, storeSettings, type PaymentSettings } from "../db/schema";
import { withTenant } from "../db/tenant";
import { AppError, notFound } from "../lib/errors";
import { isUuid, uuidv7 } from "../lib/ids";
import { parseMoney } from "../lib/money";
import { requireStoreAccess } from "../stores/service";

const money = (label: string, required: boolean) =>
  z
    .string()
    .optional()
    .transform((v, ctx) => {
      const m = parseMoney(v ?? "");
      if (m === null) {
        if (required) ctx.addIssue({ code: "custom", message: `${label} مطلوب.` });
        return required ? z.NEVER : null;
      }
      if (Number.isNaN(m)) {
        ctx.addIssue({ code: "custom", message: `${label} غير صالح.` });
        return z.NEVER;
      }
      return m;
    });

export const shippingMethodSchema = z
  .object({
    name: z.string().trim().min(1, { error: "اسم طريقة الشحن مطلوب." }).max(80),
    type: z.enum(SHIPPING_TYPES),
    price: money("السعر", false),
    freeThreshold: money("حد الشحن المجاني", false),
    cities: z
      .string()
      .optional()
      .transform((v) => Array.from(new Set((v ?? "").split(/[,،\n]/).map((c) => c.trim()).filter(Boolean))).slice(0, 200)),
    estimatedDays: z.string().trim().max(40).optional().transform((v) => v || null),
    pickupAddress: z.string().trim().max(300).optional().transform((v) => v || null),
    active: z.boolean().default(true),
  })
  .superRefine((m, ctx) => {
    if (m.type !== "pickup" && m.price === null) ctx.addIssue({ code: "custom", path: ["price"], message: "السعر مطلوب (يمكن أن يكون 0)." });
    if (m.type === "free_over" && !m.freeThreshold) ctx.addIssue({ code: "custom", path: ["freeThreshold"], message: "حدد قيمة الطلب التي يصبح بعدها الشحن مجانياً." });
    if (m.type === "pickup" && !m.pickupAddress) ctx.addIssue({ code: "custom", path: ["pickupAddress"], message: "أدخل عنوان الاستلام." });
  });

export async function listShippingMethods(userId: string, storeId: string) {
  await requireStoreAccess(userId, storeId, "orders.read");
  return withTenant({ storeId, userId }, (tx) =>
    tx.select().from(shippingMethods).orderBy(asc(shippingMethods.position), asc(shippingMethods.createdAt)),
  );
}

export async function saveShippingMethod(userId: string, storeId: string, methodId: string | null, input: unknown, meta: RequestMeta = {}) {
  await requireStoreAccess(userId, storeId, "settings.write");
  const parsed = shippingMethodSchema.safeParse(input);
  if (!parsed.success) throw new AppError("validation", "راجع الحقول المظللة.", fieldErrors(parsed.error));
  const m = parsed.data;
  if (methodId && !isUuid(methodId)) throw notFound();
  const values = {
    name: m.name,
    type: m.type,
    price: m.type === "pickup" ? 0 : (m.price ?? 0),
    freeThreshold: m.type === "free_over" ? m.freeThreshold : null,
    cities: m.cities,
    estimatedDays: m.estimatedDays,
    pickupAddress: m.type === "pickup" ? m.pickupAddress : null,
    active: m.active,
  };
  return withTenant({ storeId, userId }, async (tx) => {
    const id = methodId ?? uuidv7();
    if (methodId) {
      const rows = await tx.update(shippingMethods).set(values).where(eq(shippingMethods.id, methodId)).returning({ id: shippingMethods.id });
      if (!rows.length) throw notFound();
    } else {
      await tx.insert(shippingMethods).values({ id, storeId, ...values });
    }
    await audit({ storeId, actorId: userId, action: "shipping.saved", targetType: "shipping_method", targetId: id, meta }, tx);
    return { methodId: id };
  });
}

export async function deleteShippingMethod(userId: string, storeId: string, methodId: string) {
  await requireStoreAccess(userId, storeId, "settings.write");
  if (!isUuid(methodId)) throw notFound();
  await withTenant({ storeId, userId }, async (tx) => {
    const rows = await tx.delete(shippingMethods).where(eq(shippingMethods.id, methodId)).returning({ id: shippingMethods.id });
    if (!rows.length) throw notFound();
  });
}

// ---------------------------------------------------------------------------
// Payment methods
// ---------------------------------------------------------------------------

const IBAN_SA = /^SA\d{22}$/;

export const paymentSettingsSchema = z
  .object({
    codEnabled: z.boolean(),
    codFee: money("رسوم الدفع عند الاستلام", false),
    bankEnabled: z.boolean(),
    bankName: z.string().trim().max(80).optional().default(""),
    accountName: z.string().trim().max(120).optional().default(""),
    iban: z
      .string()
      .optional()
      .default("")
      .transform((v) => v.replace(/\s+/g, "").toUpperCase()),
    onlineEnabled: z.boolean(),
  })
  .superRefine((p, ctx) => {
    if (p.bankEnabled) {
      if (!p.bankName) ctx.addIssue({ code: "custom", path: ["bankName"], message: "اسم البنك مطلوب." });
      if (!p.accountName) ctx.addIssue({ code: "custom", path: ["accountName"], message: "اسم صاحب الحساب مطلوب." });
      if (!IBAN_SA.test(p.iban)) ctx.addIssue({ code: "custom", path: ["iban"], message: "رقم آيبان سعودي غير صالح (SA + 22 رقماً)." });
    }
    if (!p.codEnabled && !p.bankEnabled && !p.onlineEnabled) {
      ctx.addIssue({ code: "custom", path: ["_form"], message: "فعّل وسيلة دفع واحدة على الأقل." });
    }
  });

export async function getPaymentSettings(userId: string, storeId: string) {
  await requireStoreAccess(userId, storeId, "orders.read");
  return withTenant({ storeId, userId }, async (tx) => {
    const [row] = await tx.select({ payments: storeSettings.payments }).from(storeSettings).where(eq(storeSettings.storeId, storeId)).limit(1);
    if (!row) throw notFound();
    return row.payments;
  });
}

export async function savePaymentSettings(userId: string, storeId: string, input: unknown, meta: RequestMeta = {}) {
  await requireStoreAccess(userId, storeId, "settings.write");
  const parsed = paymentSettingsSchema.safeParse(input);
  if (!parsed.success) {
    const errors = fieldErrors(parsed.error);
    throw new AppError("validation", errors._form ?? "راجع الحقول المظللة.", errors);
  }
  const p = parsed.data;
  const payments: PaymentSettings = {
    cod: { enabled: p.codEnabled, fee: p.codFee ?? 0 },
    bankTransfer: p.bankEnabled ? { enabled: true, bankName: p.bankName, accountName: p.accountName, iban: p.iban } : { enabled: false },
    online: { enabled: p.onlineEnabled },
  };
  await withTenant({ storeId, userId }, async (tx) => {
    await tx.update(storeSettings).set({ payments }).where(eq(storeSettings.storeId, storeId));
    await audit({ storeId, actorId: userId, action: "payments.settings_updated", metadata: { cod: p.codEnabled, bank: p.bankEnabled, online: p.onlineEnabled }, meta }, tx);
  });
}

export const onlinePaymentsAvailable = () => Boolean(process.env.PAYMENT_GATEWAY);

// ---------------------------------------------------------------------------
// Tax and legal details
// ---------------------------------------------------------------------------

export const taxSettingsSchema = z
  .object({
    taxEnabled: z.boolean(),
    pricesIncludeTax: z.boolean(),
    vatNumber: z
      .string()
      .trim()
      .optional()
      .transform((v) => v?.replace(/\s+/g, "") || null),
    commercialRegistration: z
      .string()
      .trim()
      .max(30)
      .optional()
      .transform((v) => v || null),
    requireEmail: z.boolean(),
  })
  .superRefine((t, ctx) => {
    if (t.vatNumber && !/^3\d{13}3$/.test(t.vatNumber)) ctx.addIssue({ code: "custom", path: ["vatNumber"], message: "الرقم الضريبي 15 رقماً يبدأ وينتهي بالرقم 3." });
    if (t.taxEnabled && !t.vatNumber) ctx.addIssue({ code: "custom", path: ["vatNumber"], message: "أدخل الرقم الضريبي لتفعيل الضريبة." });
  });

export async function saveTaxSettings(userId: string, storeId: string, input: unknown, meta: RequestMeta = {}) {
  await requireStoreAccess(userId, storeId, "settings.write");
  const parsed = taxSettingsSchema.safeParse(input);
  if (!parsed.success) throw new AppError("validation", "راجع الحقول المظللة.", fieldErrors(parsed.error));
  const t = parsed.data;
  await withTenant({ storeId, userId }, async (tx) => {
    await tx
      .update(storeSettings)
      .set({
        taxEnabled: t.taxEnabled,
        // Saudi standard VAT rate. [Verify with ZATCA if the rate changes.]
        taxRateBps: 1500,
        pricesIncludeTax: t.pricesIncludeTax,
        vatNumber: t.vatNumber,
        commercialRegistration: t.commercialRegistration,
        checkout: { requireEmail: t.requireEmail },
      })
      .where(eq(storeSettings.storeId, storeId));
    await audit({ storeId, actorId: userId, action: "tax.settings_updated", metadata: { taxEnabled: t.taxEnabled }, meta }, tx);
  });
}
