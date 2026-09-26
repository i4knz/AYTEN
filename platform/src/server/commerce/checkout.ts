import { randomBytes } from "node:crypto";
import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { audit, type RequestMeta } from "../audit";
import { fieldErrors } from "../auth/schemas";
import { countUsage, loadStorePlan } from "../billing/service";
import type { Tx } from "../db/client";
import { getDb } from "../db/client";
import {
  carts,
  couponRedemptions,
  coupons,
  customers,
  orderCounters,
  orderEvents,
  orderItems,
  orders,
  payments,
  shippingMethods,
  storeMembers,
  stores,
  storeSettings,
  users,
  type PaymentMethod,
} from "../db/schema";
import { withTenant } from "../db/tenant";
import { getEmailProvider } from "../email";
import { newOrderMerchantMessage } from "../email/templates";
import { AppError } from "../lib/errors";
import { uuidv7 } from "../lib/ids";
import { formatMoney } from "../lib/money";
import { notify } from "../notifications";
import { getPaymentGateway } from "../payments/gateway";
import { normalizeSaPhone } from "../stores/schemas";
import { COUPON_MESSAGES, loadCouponForCheckout } from "./coupons";
import { findCart, getTaxSettings, loadCartLines, toPricingLines } from "./cart";
import { priceOrder } from "./pricing";
import { reserveStock } from "./stock";
import { onlinePaymentsAvailable } from "./shipping";

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cod: "الدفع عند الاستلام",
  bank_transfer: "تحويل بنكي",
  online: "بطاقة مدى / فيزا / ماستركارد",
};

const phone = z
  .string({ error: "رقم الجوال مطلوب." })
  .transform((v, ctx) => {
    const n = normalizeSaPhone(v);
    if (!n) {
      ctx.addIssue({ code: "custom", message: "أدخل رقم جوال سعودي صحيحاً مثل 05XXXXXXXX." });
      return z.NEVER;
    }
    return n;
  });

export const checkoutSchema = z.object({
  name: z.string({ error: "الاسم مطلوب." }).trim().min(2, { error: "أدخل الاسم." }).max(100),
  phone,
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(254)
    .optional()
    .transform((v) => v || null)
    .pipe(z.email({ error: "بريد إلكتروني غير صالح." }).nullable()),
  city: z.string({ error: "المدينة مطلوبة." }).trim().min(2, { error: "المدينة مطلوبة." }).max(60),
  district: z.string().trim().max(80).default(""),
  street: z.string().trim().max(160).default(""),
  details: z.string().trim().max(300).default(""),
  postalCode: z
    .string()
    .trim()
    .max(10)
    .default("")
    .refine((v) => v === "" || /^\d{5}$/.test(v), { error: "الرمز البريدي 5 أرقام." }),
  shippingMethodId: z.uuid({ error: "اختر طريقة الشحن." }),
  paymentMethod: z.enum(["cod", "bank_transfer", "online"], { error: "اختر طريقة الدفع." }),
  note: z.string().trim().max(1000).default(""),
  acceptsMarketing: z.boolean().default(false),
  idempotencyKey: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/),
});

export type CheckoutInput = z.input<typeof checkoutSchema>;

/** Shipping methods the shopper may pick for a city (empty `cities` = everywhere). */
export async function getCheckoutOptions(storeId: string, city?: string) {
  return withTenant({ storeId }, (tx) => loadCheckoutOptions(tx, storeId, city));
}

async function loadCheckoutOptions(tx: Tx, storeId: string, city?: string) {
  {
    const methods = await tx
      .select()
      .from(shippingMethods)
      .where(eq(shippingMethods.active, true))
      .orderBy(asc(shippingMethods.position), asc(shippingMethods.createdAt));
    const [settings] = await tx
      .select({ payments: storeSettings.payments, checkout: storeSettings.checkout })
      .from(storeSettings)
      .where(eq(storeSettings.storeId, storeId))
      .limit(1);
    const c = city?.trim();
    const available = methods.filter((m) => !c || m.cities.length === 0 || m.cities.includes(c));
    const paymentMethods: { method: PaymentMethod; label: string; fee: number }[] = [];
    if (settings?.payments.cod.enabled) paymentMethods.push({ method: "cod", label: PAYMENT_METHOD_LABELS.cod, fee: settings.payments.cod.fee });
    if (settings?.payments.bankTransfer.enabled) paymentMethods.push({ method: "bank_transfer", label: PAYMENT_METHOD_LABELS.bank_transfer, fee: 0 });
    if (settings?.payments.online.enabled && onlinePaymentsAvailable()) paymentMethods.push({ method: "online", label: PAYMENT_METHOD_LABELS.online, fee: 0 });
    return {
      shippingMethods: available,
      allShippingMethods: methods,
      paymentMethods,
      requireEmail: settings?.checkout.requireEmail ?? false,
      bankTransfer: settings?.payments.bankTransfer,
    };
  }
}

async function nextOrderNumber(tx: Tx, storeId: string): Promise<number> {
  const [row] = await tx
    .insert(orderCounters)
    .values({ storeId, lastNumber: 1001 })
    .onConflictDoUpdate({ target: orderCounters.storeId, set: { lastNumber: sql`${orderCounters.lastNumber} + 1` } })
    .returning({ n: orderCounters.lastNumber });
  return row.n;
}

export interface PlacedOrder {
  orderId: string;
  number: number;
  accessKey: string;
  total: number;
  paymentRedirect: string | null;
  reused: boolean;
}

/**
 * Turns the shopper's cart into an order in one transaction:
 * re-reads prices and stock from the catalog, validates shipping, payment and
 * coupon, reserves stock atomically, creates the customer, order, items,
 * payment and coupon redemption, and converts the cart. Retrying with the
 * same idempotency key returns the original order instead of a duplicate.
 */
export async function placeOrder(storeId: string, cartToken: string | null | undefined, rawInput: unknown, meta: RequestMeta = {}): Promise<PlacedOrder> {
  const parsed = checkoutSchema.safeParse(rawInput);
  if (!parsed.success) throw new AppError("validation", "راجع البيانات المظللة.", fieldErrors(parsed.error));
  const input = parsed.data;

  const [store] = await getDb().select().from(stores).where(eq(stores.id, storeId)).limit(1);
  if (!store || store.status !== "published") throw new AppError("store_closed", "المتجر لا يستقبل طلبات حالياً.");

  const result = await withTenant({ storeId }, async (tx) => {
    const [existing] = await tx.select().from(orders).where(eq(orders.idempotencyKey, input.idempotencyKey)).limit(1);
    if (existing) {
      return { orderId: existing.id, number: existing.number, accessKey: existing.accessKey, total: existing.total, method: existing.paymentMethod, reused: true };
    }
    const storePlan = await loadStorePlan(tx, storeId);
    if (!storePlan.canTakeOrders) throw new AppError("store_closed", "المتجر لا يستقبل طلبات حالياً.");
    const monthlyLimit = storePlan.plan.limits.ordersPerMonth;
    if (monthlyLimit != null && (await countUsage(tx, storeId)).ordersPerMonth >= monthlyLimit) {
      throw new AppError("store_closed", "المتجر لا يستقبل طلبات حالياً.");
    }

    const cart = await findCart(tx, cartToken, { lock: true });
    if (!cart) throw new AppError("empty_cart", "سلتك فارغة.");
    const lines = await loadCartLines(tx, cart.id);
    if (!lines.length) throw new AppError("empty_cart", "سلتك فارغة.");
    const problem = lines.find((l) => l.problem);
    if (problem) {
      throw new AppError("out_of_stock", `«${problem.productName}» ${problem.problem === "unavailable" ? "لم يعد متوفراً" : "كميته غير كافية"}. حدّث سلتك.`);
    }

    const options = await loadCheckoutOptions(tx, storeId, input.city);
    if (input.email === null && options.requireEmail) {
      throw new AppError("validation", "راجع البيانات المظللة.", { email: "البريد الإلكتروني مطلوب." });
    }
    const method = options.shippingMethods.find((m) => m.id === input.shippingMethodId);
    if (!method) {
      throw new AppError("validation", "طريقة الشحن غير متاحة لمدينتك.", { shippingMethodId: "طريقة الشحن غير متاحة لمدينتك." });
    }
    const payment = options.paymentMethods.find((p) => p.method === input.paymentMethod);
    if (!payment) throw new AppError("validation", "طريقة الدفع غير متاحة.", { paymentMethod: "طريقة الدفع غير متاحة." });

    let coupon = null;
    if (cart.couponCode) {
      const loaded = await loadCouponForCheckout(tx, cart.couponCode, { customerPhone: input.phone, lock: true });
      if (!loaded.coupon) throw new AppError("coupon", COUPON_MESSAGES[loaded.rejection]);
      coupon = loaded.coupon;
    }

    const tax = await getTaxSettings(tx, storeId);
    const pricing = priceOrder({
      lines: toPricingLines(lines),
      coupon,
      shipping: { type: method.type, price: method.price, freeThreshold: method.freeThreshold },
      paymentFee: payment.fee,
      tax,
    });
    if (coupon && pricing.coupon && !pricing.coupon.applied) {
      throw new AppError("coupon", COUPON_MESSAGES[pricing.coupon.reason as keyof typeof COUPON_MESSAGES]);
    }

    // Reserve stock line by line; any shortage aborts the whole transaction.
    const tracked = new Map<string, boolean>();
    for (const line of lines) tracked.set(line.variantId, await reserveStock(tx, line.variantId, line.quantity, line.productName));

    // Customer (one per phone per store).
    const now = new Date();
    const [customer] = await tx
      .insert(customers)
      .values({
        id: uuidv7(),
        storeId,
        phone: input.phone,
        email: input.email,
        name: input.name,
        acceptsMarketing: input.acceptsMarketing,
        marketingConsentAt: input.acceptsMarketing ? now : null,
      })
      .onConflictDoUpdate({
        target: [customers.storeId, customers.phone],
        set: {
          name: input.name,
          email: sql`coalesce(excluded.email, ${customers.email})`,
          acceptsMarketing: sql`${customers.acceptsMarketing} or excluded.accepts_marketing`,
          marketingConsentAt: sql`coalesce(${customers.marketingConsentAt}, excluded.marketing_consent_at)`,
        },
      })
      .returning();

    const orderId = uuidv7();
    const number = await nextOrderNumber(tx, storeId);
    const accessKey = randomBytes(18).toString("base64url");
    const paymentStatus = input.paymentMethod === "bank_transfer" ? "awaiting_transfer" : "pending";

    await tx.insert(orders).values({
      id: orderId,
      storeId,
      number,
      accessKey,
      customerId: customer.id,
      currency: store.currency,
      subtotal: pricing.subtotal,
      discountTotal: pricing.discountTotal,
      shippingTotal: pricing.shippingTotal,
      paymentFee: pricing.paymentFee,
      taxTotal: pricing.taxTotal,
      total: pricing.total,
      pricesIncludeTax: tax.pricesIncludeTax,
      taxRateBps: tax.enabled ? tax.rateBps : 0,
      paymentMethod: input.paymentMethod,
      paymentStatus,
      customerSnapshot: { name: input.name, phone: input.phone, email: input.email },
      shippingAddress: { city: input.city, district: input.district, street: input.street, details: input.details, postalCode: input.postalCode },
      shippingMethod: { id: method.id, name: method.name, type: method.type, estimatedDays: method.estimatedDays, pickupAddress: method.pickupAddress },
      couponCode: pricing.coupon?.applied ? pricing.coupon.code : null,
      customerNote: input.note || null,
      idempotencyKey: input.idempotencyKey,
    });

    const priced = new Map(pricing.lines.map((l) => [l.key, l]));
    await tx.insert(orderItems).values(
      lines.map((l) => {
        const p = priced.get(l.variantId)!;
        return {
          id: uuidv7(),
          storeId,
          orderId,
          productId: l.productId,
          variantId: l.variantId,
          productName: l.productName,
          variantTitle: l.variantTitle,
          sku: l.sku,
          imageKey: l.imageKey,
          unitPrice: l.unitPrice,
          quantity: l.quantity,
          discountAmount: p.discount,
          taxAmount: p.tax,
          lineTotal: p.total,
          stockState: tracked.get(l.variantId) ? ("reserved" as const) : ("none" as const),
        };
      }),
    );

    if (coupon && pricing.coupon?.applied) {
      await tx.update(coupons).set({ usedCount: sql`${coupons.usedCount} + 1` }).where(eq(coupons.id, coupon.id));
      await tx.insert(couponRedemptions).values({
        id: uuidv7(),
        storeId,
        couponId: coupon.id,
        orderId,
        customerId: customer.id,
        amount: pricing.discountTotal + (coupon.type === "free_shipping" ? method.price : 0),
      });
    }

    await tx
      .update(customers)
      .set({
        ordersCount: sql`${customers.ordersCount} + 1`,
        totalSpent: sql`${customers.totalSpent} + ${pricing.total}`,
        firstOrderAt: sql`coalesce(${customers.firstOrderAt}, now())`,
        lastOrderAt: sql`now()`,
      })
      .where(eq(customers.id, customer.id));

    await tx.insert(payments).values({
      id: uuidv7(),
      storeId,
      orderId,
      provider: input.paymentMethod === "online" ? getPaymentGateway().key : input.paymentMethod,
      amount: pricing.total,
      currency: store.currency,
      status: "pending",
    });

    await tx.insert(orderEvents).values({
      id: uuidv7(),
      storeId,
      orderId,
      type: "created",
      message: `تم إنشاء الطلب (${PAYMENT_METHOD_LABELS[input.paymentMethod]})`,
      actorType: "customer",
      data: { ip: meta.ip ?? null },
    });

    await tx.update(carts).set({ convertedOrderId: orderId, contactName: input.name, contactPhone: input.phone }).where(eq(carts.id, cart.id));

    await notify(tx, storeId, {
      type: "order.created",
      title: `طلب جديد #${number}`,
      body: `${input.name} — ${formatMoney(pricing.total, store.currency)}`,
      link: `/dashboard/${storeId}/orders/${orderId}`,
    });

    return { orderId, number, accessKey, total: pricing.total, method: input.paymentMethod, reused: false };
  });

  let paymentRedirect: string | null = null;
  if (result.method === "online") {
    paymentRedirect = await getPaymentGateway().startPayment({ storeId, orderId: result.orderId });
  }
  if (!result.reused) {
    await audit({ storeId, actorType: "system", action: "order.created", targetType: "order", targetId: result.orderId, meta });
    void notifyMerchantByEmail(storeId, result.orderId, result.number, result.total, store.currency);
  }
  return { orderId: result.orderId, number: result.number, accessKey: result.accessKey, total: result.total, paymentRedirect, reused: result.reused };
}

/** Emails active owners/managers/order staff about a new order. Best effort. */
async function notifyMerchantByEmail(storeId: string, orderId: string, number: number, total: number, currency: string) {
  try {
    const recipients = await withTenant({ storeId }, (tx) =>
      tx
        .select({ email: users.email, name: users.name })
        .from(storeMembers)
        .innerJoin(users, eq(users.id, storeMembers.userId))
        .where(and(eq(storeMembers.status, "active"), sql`${storeMembers.role} in ('owner', 'manager', 'orders')`)),
    );
    const url = new URL(`/dashboard/${storeId}/orders/${orderId}`, process.env.APP_URL ?? "http://localhost:3000").toString();
    for (const r of recipients) {
      await getEmailProvider().send(newOrderMerchantMessage(r.email, r.name, number, formatMoney(total, currency), url));
    }
  } catch (err) {
    console.error("[email] new order notification failed", err);
  }
}
