import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { audit, type RequestMeta } from "../audit";
import { fieldErrors } from "../auth/schemas";
import type { Tx } from "../db/client";
import { COUPON_TYPES, couponRedemptions, coupons, customers } from "../db/schema";
import { withTenant } from "../db/tenant";
import { AppError, isCheckViolation, isUniqueViolation, notFound } from "../lib/errors";
import { isUuid, uuidv7 } from "../lib/ids";
import { parseMoney } from "../lib/money";
import { requireStoreAccess } from "../stores/service";
import type { PricingCoupon } from "./pricing";

const optionalMoney = (label: string) =>
  z
    .string()
    .optional()
    .transform((v, ctx) => {
      if (!v?.trim()) return null;
      const m = parseMoney(v);
      if (m === null || Number.isNaN(m) || m <= 0) {
        ctx.addIssue({ code: "custom", message: `${label} غير صالح.` });
        return z.NEVER;
      }
      return m;
    });

const optionalInt = z
  .string()
  .optional()
  .transform((v, ctx) => {
    if (!v?.trim()) return null;
    const n = Number(v);
    if (!Number.isInteger(n) || n < 1 || n > 1_000_000) {
      ctx.addIssue({ code: "custom", message: "أدخل رقماً صحيحاً أكبر من صفر." });
      return z.NEVER;
    }
    return n;
  });

const optionalDate = z
  .string()
  .optional()
  .transform((v, ctx) => {
    if (!v?.trim()) return null;
    // <input type="datetime-local"> gives local Riyadh time without offset.
    const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(v) ? v : `${v}+03:00`);
    if (Number.isNaN(d.getTime())) {
      ctx.addIssue({ code: "custom", message: "تاريخ غير صالح." });
      return z.NEVER;
    }
    return d;
  });

export const couponInputSchema = z
  .object({
    code: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9_-]{3,30}$/, { error: "الرمز من 3 إلى 30 حرفاً إنجليزياً أو رقماً أو - أو _ ." })
      .transform((v) => v.toUpperCase()),
    type: z.enum(COUPON_TYPES, { error: "اختر نوع الخصم." }),
    value: z.string().optional().default(""),
    maxDiscount: optionalMoney("الحد الأقصى للخصم"),
    minSubtotal: optionalMoney("الحد الأدنى للطلب"),
    startsAt: optionalDate,
    endsAt: optionalDate,
    usageLimit: optionalInt,
    usageLimitPerCustomer: optionalInt,
    productIds: z.array(z.uuid()).max(200).default([]),
    categoryIds: z.array(z.uuid()).max(100).default([]),
    active: z.boolean().default(true),
  })
  .transform((c, ctx) => {
    let value = 0;
    if (c.type === "percent") {
      value = Number(c.value);
      if (!Number.isInteger(value) || value < 1 || value > 100) {
        ctx.addIssue({ code: "custom", path: ["value"], message: "النسبة من 1 إلى 100." });
        return z.NEVER;
      }
    } else if (c.type === "fixed") {
      const m = parseMoney(c.value);
      if (m === null || Number.isNaN(m) || m <= 0) {
        ctx.addIssue({ code: "custom", path: ["value"], message: "أدخل مبلغ الخصم." });
        return z.NEVER;
      }
      value = m;
    }
    if (c.startsAt && c.endsAt && c.endsAt <= c.startsAt) {
      ctx.addIssue({ code: "custom", path: ["endsAt"], message: "تاريخ الانتهاء يجب أن يكون بعد البداية." });
      return z.NEVER;
    }
    return { ...c, value, maxDiscount: c.type === "percent" ? c.maxDiscount : null };
  });

export type CouponState = "active" | "inactive" | "expired" | "exhausted" | "scheduled";

export function couponState(c: typeof coupons.$inferSelect, now = Date.now()): CouponState {
  if (!c.active) return "inactive";
  if (c.endsAt && c.endsAt.getTime() <= now) return "expired";
  if (c.usageLimit !== null && c.usedCount >= c.usageLimit) return "exhausted";
  if (c.startsAt && c.startsAt.getTime() > now) return "scheduled";
  return "active";
}

export async function listCoupons(userId: string, storeId: string) {
  await requireStoreAccess(userId, storeId, "products.read");
  const rows = await withTenant({ storeId, userId }, (tx) => tx.select().from(coupons).orderBy(desc(coupons.createdAt)));
  const now = Date.now();
  return rows.map((c) => ({ ...c, state: couponState(c, now) }));
}

export async function getCoupon(userId: string, storeId: string, couponId: string) {
  await requireStoreAccess(userId, storeId, "products.read");
  if (!isUuid(couponId)) throw notFound();
  return withTenant({ storeId, userId }, async (tx) => {
    const [row] = await tx.select().from(coupons).where(eq(coupons.id, couponId)).limit(1);
    if (!row) throw notFound();
    const [{ total }] = await tx
      .select({ total: sql<number>`coalesce(sum(amount), 0)::bigint` })
      .from(couponRedemptions)
      .where(eq(couponRedemptions.couponId, couponId));
    return { coupon: row, totalDiscount: Number(total) };
  });
}

const COUPON_PERMISSION = "marketing.write" as const;

export async function saveCoupon(userId: string, storeId: string, couponId: string | null, input: unknown, meta: RequestMeta = {}) {
  await requireStoreAccess(userId, storeId, COUPON_PERMISSION);
  const parsed = couponInputSchema.safeParse(input);
  if (!parsed.success) throw new AppError("validation", "راجع الحقول المظللة.", fieldErrors(parsed.error));
  const c = parsed.data;
  if (couponId && !isUuid(couponId)) throw notFound();
  try {
    return await withTenant({ storeId, userId }, async (tx) => {
      const id = couponId ?? uuidv7();
      const values = {
        code: c.code,
        type: c.type,
        value: c.value,
        maxDiscount: c.maxDiscount,
        minSubtotal: c.minSubtotal,
        startsAt: c.startsAt,
        endsAt: c.endsAt,
        usageLimit: c.usageLimit,
        usageLimitPerCustomer: c.usageLimitPerCustomer,
        productIds: c.productIds,
        categoryIds: c.categoryIds,
        active: c.active,
      };
      if (couponId) {
        const rows = await tx.update(coupons).set(values).where(eq(coupons.id, couponId)).returning({ id: coupons.id });
        if (!rows.length) throw notFound();
      } else {
        await tx.insert(coupons).values({ id, storeId, ...values });
      }
      await audit({ storeId, actorId: userId, action: couponId ? "coupon.updated" : "coupon.created", targetType: "coupon", targetId: id, metadata: { code: c.code }, meta }, tx);
      return { couponId: id };
    });
  } catch (err) {
    if (isUniqueViolation(err, "coupons_store_id_code_key")) {
      throw new AppError("validation", "راجع الحقول المظللة.", { code: "هذا الرمز مستخدم لكوبون آخر." });
    }
    if (isCheckViolation(err)) {
      throw new AppError("validation", "حد الاستخدام أقل من عدد مرات استخدام الكوبون حتى الآن.", { usageLimit: "أقل من عدد مرات الاستخدام الحالية." });
    }
    throw err;
  }
}

export async function setCouponActive(userId: string, storeId: string, couponId: string, active: boolean) {
  await requireStoreAccess(userId, storeId, COUPON_PERMISSION);
  if (!isUuid(couponId)) throw notFound();
  await withTenant({ storeId, userId }, async (tx) => {
    const rows = await tx.update(coupons).set({ active }).where(eq(coupons.id, couponId)).returning({ id: coupons.id });
    if (!rows.length) throw notFound();
  });
}

export type CouponRejection = "not_found" | "inactive" | "not_started" | "expired" | "usage_limit" | "customer_limit";

export const COUPON_MESSAGES: Record<CouponRejection | "min_subtotal" | "no_eligible_items", string> = {
  not_found: "رمز الكوبون غير صحيح.",
  inactive: "هذا الكوبون غير مفعّل.",
  not_started: "هذا الكوبون لم يبدأ بعد.",
  expired: "انتهت صلاحية هذا الكوبون.",
  usage_limit: "تم استخدام هذا الكوبون بالكامل.",
  customer_limit: "لقد استخدمت هذا الكوبون من قبل.",
  min_subtotal: "قيمة السلة أقل من الحد الأدنى لهذا الكوبون.",
  no_eligible_items: "الكوبون لا ينطبق على المنتجات في سلتك.",
};

/**
 * Loads a coupon for pricing and checks everything except amount rules
 * (minimum subtotal, eligible items), which the pricing engine reports.
 * With `lock`, the row is locked for the rest of the transaction so the
 * usage limit holds under concurrent checkouts.
 */
export async function loadCouponForCheckout(
  tx: Tx,
  code: string,
  opts: { customerPhone?: string | null; lock?: boolean } = {},
): Promise<{ coupon: PricingCoupon & { id: string }; rejection: null } | { coupon: null; rejection: CouponRejection }> {
  let q = tx.select().from(coupons).where(eq(coupons.code, code)).limit(1).$dynamic();
  if (opts.lock) q = q.for("update");
  const [row] = await q;
  if (!row) return { coupon: null, rejection: "not_found" };
  const now = Date.now();
  if (!row.active) return { coupon: null, rejection: "inactive" };
  if (row.startsAt && row.startsAt.getTime() > now) return { coupon: null, rejection: "not_started" };
  if (row.endsAt && row.endsAt.getTime() <= now) return { coupon: null, rejection: "expired" };
  if (row.usageLimit !== null && row.usedCount >= row.usageLimit) return { coupon: null, rejection: "usage_limit" };
  if (row.usageLimitPerCustomer !== null && opts.customerPhone) {
    const [{ used }] = await tx
      .select({ used: sql<number>`count(*)::int` })
      .from(couponRedemptions)
      .innerJoin(customers, eq(customers.id, couponRedemptions.customerId))
      .where(and(eq(couponRedemptions.couponId, row.id), eq(customers.phone, opts.customerPhone)));
    if (used >= row.usageLimitPerCustomer) return { coupon: null, rejection: "customer_limit" };
  }
  return {
    rejection: null,
    coupon: {
      id: row.id,
      code: row.code,
      type: row.type,
      value: row.value,
      maxDiscount: row.maxDiscount,
      minSubtotal: row.minSubtotal,
      productIds: row.productIds,
      categoryIds: row.categoryIds,
    },
  };
}
