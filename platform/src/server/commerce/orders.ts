import { and, asc, desc, eq, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { audit, type RequestMeta } from "../audit";
import type { Tx } from "../db/client";
import {
  customers,
  orderEvents,
  orderItems,
  orderNotes,
  orders,
  payments,
  refunds,
  shipments,
  users,
  type FulfillmentStatus,
} from "../db/schema";
import { withTenant } from "../db/tenant";
import { AppError, notFound } from "../lib/errors";
import { isUuid, uuidv7 } from "../lib/ids";
import { formatMoney, parseMoney } from "../lib/money";
import { requireStoreAccess } from "../stores/service";
import { commitOrderStock, releaseOrderStock } from "./stock";

export const PAYMENT_STATUS_LABELS = {
  pending: "بانتظار الدفع",
  awaiting_transfer: "بانتظار التحويل",
  paid: "مدفوع",
  partially_refunded: "مسترد جزئياً",
  refunded: "مسترد بالكامل",
  failed: "فشل الدفع",
  voided: "ملغي",
} as const;

export const FULFILLMENT_LABELS: Record<FulfillmentStatus, string> = {
  unfulfilled: "جديد",
  processing: "قيد التجهيز",
  ready: "جاهز للشحن",
  shipped: "تم الشحن",
  delivered: "تم التسليم",
  returned: "مرتجع",
  cancelled: "ملغي",
};

export const ORDER_TABS = {
  all: "الكل",
  new: "جديدة",
  processing: "قيد التجهيز",
  shipped: "تم الشحن",
  completed: "مكتملة",
  cancelled: "ملغاة",
} as const;
export type OrderTab = keyof typeof ORDER_TABS;

function tabCondition(tab: OrderTab): SQL | undefined {
  switch (tab) {
    case "new":
      return and(eq(orders.status, "open"), eq(orders.fulfillmentStatus, "unfulfilled"));
    case "processing":
      return and(eq(orders.status, "open"), sql`${orders.fulfillmentStatus} in ('processing', 'ready')`);
    case "shipped":
      return and(eq(orders.status, "open"), sql`${orders.fulfillmentStatus} in ('shipped', 'delivered')`);
    case "completed":
      return eq(orders.status, "completed");
    case "cancelled":
      return eq(orders.status, "cancelled");
    default:
      return undefined;
  }
}

export const ORDERS_PAGE_SIZE = 25;

export async function listOrders(userId: string, storeId: string, opts: { tab?: OrderTab; q?: string; page?: number; customerId?: string } = {}) {
  await requireStoreAccess(userId, storeId, "orders.read");
  const page = Math.max(1, Math.floor(opts.page ?? 1));
  return withTenant({ storeId, userId }, async (tx) => {
    const conditions: (SQL | undefined)[] = [tabCondition(opts.tab ?? "all")];
    const q = opts.q?.trim();
    if (q) {
      const digits = q.replace(/[^\d]/g, "");
      const like = `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
      conditions.push(
        or(
          digits && digits.length <= 12 ? eq(orders.number, Number(digits)) : undefined,
          sql`${orders.customerSnapshot}->>'name' ilike ${like}`,
          digits.length >= 6 ? sql`${orders.customerSnapshot}->>'phone' like ${`%${digits.slice(-9)}%`}` : undefined,
        ),
      );
    }
    if (opts.customerId && isUuid(opts.customerId)) conditions.push(eq(orders.customerId, opts.customerId));
    const where = and(...conditions);
    const rows = await tx
      .select({
        id: orders.id,
        number: orders.number,
        createdAt: orders.createdAt,
        customer: orders.customerSnapshot,
        total: orders.total,
        currency: orders.currency,
        paymentMethod: orders.paymentMethod,
        paymentStatus: orders.paymentStatus,
        fulfillmentStatus: orders.fulfillmentStatus,
        status: orders.status,
        itemCount: sql<number>`(select coalesce(sum(quantity), 0)::int from order_items oi where oi.order_id = orders.id)`,
      })
      .from(orders)
      .where(where)
      .orderBy(desc(orders.createdAt))
      .limit(ORDERS_PAGE_SIZE)
      .offset((page - 1) * ORDERS_PAGE_SIZE);
    const [{ total }] = await tx.select({ total: sql<number>`count(*)::int` }).from(orders).where(where);
    const counts = await tx
      .select({
        new: sql<number>`count(*) filter (where status = 'open' and fulfillment_status = 'unfulfilled')::int`,
        processing: sql<number>`count(*) filter (where status = 'open' and fulfillment_status in ('processing','ready'))::int`,
      })
      .from(orders);
    return { rows, total, page, pageCount: Math.max(1, Math.ceil(total / ORDERS_PAGE_SIZE)), counts: counts[0] };
  });
}

export async function getOrder(userId: string, storeId: string, orderId: string) {
  await requireStoreAccess(userId, storeId, "orders.read");
  if (!isUuid(orderId)) throw notFound();
  return withTenant({ storeId, userId }, async (tx) => {
    const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (!order) throw notFound();
    const [items, events, notes, paymentRows, shipmentRows, refundRows, customer] = await Promise.all([
      tx.select().from(orderItems).where(eq(orderItems.orderId, orderId)),
      tx.select().from(orderEvents).where(eq(orderEvents.orderId, orderId)).orderBy(asc(orderEvents.createdAt)),
      tx
        .select({ id: orderNotes.id, body: orderNotes.body, createdAt: orderNotes.createdAt, author: users.name })
        .from(orderNotes)
        .leftJoin(users, eq(users.id, orderNotes.authorUserId))
        .where(eq(orderNotes.orderId, orderId))
        .orderBy(asc(orderNotes.createdAt)),
      tx.select().from(payments).where(eq(payments.orderId, orderId)).orderBy(asc(payments.createdAt)),
      tx.select().from(shipments).where(eq(shipments.orderId, orderId)).orderBy(asc(shipments.createdAt)),
      tx.select().from(refunds).where(eq(refunds.orderId, orderId)).orderBy(asc(refunds.createdAt)),
      tx.select().from(customers).where(eq(customers.id, order.customerId)).limit(1),
    ]);
    return { order, items, events, notes, payments: paymentRows, shipments: shipmentRows, refunds: refundRows, customer: customer[0] ?? null };
  });
}

async function lockOrder(tx: Tx, orderId: string) {
  const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).for("update").limit(1);
  if (!order) throw notFound();
  return order;
}

async function logEvent(tx: Tx, storeId: string, orderId: string, type: string, message: string, actorId: string | null, data: Record<string, unknown> = {}) {
  await tx.insert(orderEvents).values({ id: uuidv7(), storeId, orderId, type, message, actorType: actorId ? "user" : "system", actorId, data });
}

const invalid = (msg: string) => new AppError("invalid_state", msg);

/** Marks a COD or bank-transfer order as paid (money received). */
export async function markOrderPaid(userId: string, storeId: string, orderId: string, meta: RequestMeta = {}) {
  await requireStoreAccess(userId, storeId, "orders.write");
  if (!isUuid(orderId)) throw notFound();
  await withTenant({ storeId, userId }, async (tx) => {
    const order = await lockOrder(tx, orderId);
    if (order.status === "cancelled") throw invalid("الطلب ملغي.");
    if (order.paymentStatus === "paid") return;
    if (order.paymentMethod === "online") throw invalid("الطلبات المدفوعة إلكترونياً تُحدَّث تلقائياً من بوابة الدفع.");
    if (!["pending", "awaiting_transfer"].includes(order.paymentStatus)) throw invalid("لا يمكن تغيير حالة الدفع لهذا الطلب.");
    await tx.update(orders).set({ paymentStatus: "paid" }).where(eq(orders.id, orderId));
    await tx.update(payments).set({ status: "paid" }).where(and(eq(payments.orderId, orderId), eq(payments.status, "pending")));
    await logEvent(tx, storeId, orderId, "payment.paid", order.paymentMethod === "cod" ? "تم تحصيل المبلغ عند الاستلام" : "تم تأكيد استلام التحويل البنكي", userId);
    await completeIfDone(tx, storeId, orderId);
    await audit({ storeId, actorId: userId, action: "order.marked_paid", targetType: "order", targetId: orderId, meta }, tx);
  });
}

const FORWARD: Record<string, FulfillmentStatus[]> = {
  unfulfilled: ["processing", "ready"],
  processing: ["ready"],
};

/** Moves an order forward in preparation (new → processing → ready). */
export async function setOrderPreparation(userId: string, storeId: string, orderId: string, to: "processing" | "ready", meta: RequestMeta = {}) {
  await requireStoreAccess(userId, storeId, "orders.write");
  if (!isUuid(orderId)) throw notFound();
  await withTenant({ storeId, userId }, async (tx) => {
    const order = await lockOrder(tx, orderId);
    if (order.status !== "open") throw invalid("لا يمكن تعديل طلب مغلق.");
    if (order.fulfillmentStatus === to) return;
    if (!FORWARD[order.fulfillmentStatus]?.includes(to)) throw invalid(`لا يمكن الانتقال من «${FULFILLMENT_LABELS[order.fulfillmentStatus]}» إلى «${FULFILLMENT_LABELS[to]}».`);
    await tx.update(orders).set({ fulfillmentStatus: to }).where(eq(orders.id, orderId));
    await logEvent(tx, storeId, orderId, `fulfillment.${to}`, `تغيرت الحالة إلى «${FULFILLMENT_LABELS[to]}»`, userId);
    await audit({ storeId, actorId: userId, action: "order.fulfillment_changed", targetType: "order", targetId: orderId, metadata: { to }, meta }, tx);
  });
}

export const shipSchema = z.object({
  carrier: z.string().trim().max(60).default(""),
  trackingNumber: z.string().trim().max(80).default(""),
  trackingUrl: z
    .string()
    .trim()
    .max(500)
    .default("")
    .refine((v) => v === "" || /^https:\/\/[^\s]+$/.test(v), { error: "رابط التتبع يجب أن يبدأ بـ https://" }),
});

/** Ships the order: records the shipment and removes the reserved stock from the shelf. */
export async function shipOrder(userId: string, storeId: string, orderId: string, input: unknown, meta: RequestMeta = {}) {
  await requireStoreAccess(userId, storeId, "orders.write");
  if (!isUuid(orderId)) throw notFound();
  const parsed = shipSchema.safeParse(input);
  if (!parsed.success) throw new AppError("validation", parsed.error.issues[0].message);
  const s = parsed.data;
  await withTenant({ storeId, userId }, async (tx) => {
    const order = await lockOrder(tx, orderId);
    if (order.status !== "open") throw invalid("لا يمكن شحن طلب مغلق.");
    if (!["unfulfilled", "processing", "ready"].includes(order.fulfillmentStatus)) throw invalid("تم شحن هذا الطلب بالفعل.");
    if (order.paymentMethod === "online" && order.paymentStatus !== "paid") throw invalid("لا يمكن شحن طلب دفع إلكتروني قبل اكتمال الدفع.");
    const lines = await tx.select().from(orderItems).where(eq(orderItems.orderId, orderId));
    await commitOrderStock(tx, storeId, orderId, lines, userId);
    await tx.insert(shipments).values({
      id: uuidv7(),
      storeId,
      orderId,
      carrier: s.carrier || null,
      trackingNumber: s.trackingNumber || null,
      trackingUrl: s.trackingUrl || null,
    });
    const isPickup = order.shippingMethod.type === "pickup";
    await tx.update(orders).set({ fulfillmentStatus: "shipped" }).where(eq(orders.id, orderId));
    await logEvent(
      tx,
      storeId,
      orderId,
      "fulfillment.shipped",
      isPickup ? "الطلب جاهز للاستلام من المتجر" : `تم شحن الطلب${s.carrier ? ` عبر ${s.carrier}` : ""}${s.trackingNumber ? ` — رقم التتبع ${s.trackingNumber}` : ""}`,
      userId,
    );
    await audit({ storeId, actorId: userId, action: "order.shipped", targetType: "order", targetId: orderId, meta }, tx);
  });
}

/** Delivered. For cash on delivery, delivery means the cash was collected. */
export async function markOrderDelivered(userId: string, storeId: string, orderId: string, meta: RequestMeta = {}) {
  await requireStoreAccess(userId, storeId, "orders.write");
  if (!isUuid(orderId)) throw notFound();
  await withTenant({ storeId, userId }, async (tx) => {
    const order = await lockOrder(tx, orderId);
    if (order.status !== "open" || order.fulfillmentStatus !== "shipped") throw invalid("يجب شحن الطلب أولاً.");
    await tx.update(orders).set({ fulfillmentStatus: "delivered" }).where(eq(orders.id, orderId));
    await tx.update(shipments).set({ deliveredAt: sql`now()` }).where(and(eq(shipments.orderId, orderId), sql`${shipments.deliveredAt} is null`));
    await logEvent(tx, storeId, orderId, "fulfillment.delivered", "تم تسليم الطلب للعميل", userId);
    if (order.paymentMethod === "cod" && order.paymentStatus === "pending") {
      await tx.update(orders).set({ paymentStatus: "paid" }).where(eq(orders.id, orderId));
      await tx.update(payments).set({ status: "paid" }).where(and(eq(payments.orderId, orderId), eq(payments.status, "pending")));
      await logEvent(tx, storeId, orderId, "payment.paid", "تم تحصيل المبلغ عند الاستلام", userId);
    }
    await completeIfDone(tx, storeId, orderId);
    await audit({ storeId, actorId: userId, action: "order.delivered", targetType: "order", targetId: orderId, meta }, tx);
  });
}

async function completeIfDone(tx: Tx, storeId: string, orderId: string) {
  const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (order.status === "open" && order.fulfillmentStatus === "delivered" && order.paymentStatus === "paid") {
    await tx.update(orders).set({ status: "completed", completedAt: sql`now()` }).where(eq(orders.id, orderId));
    await logEvent(tx, storeId, orderId, "completed", "اكتمل الطلب", null);
  }
}

export const cancelSchema = z.object({
  reason: z.string().trim().min(2, { error: "اكتب سبب الإلغاء." }).max(500),
  restock: z.boolean().default(true),
});

/**
 * Cancels an open order. Reserved stock is always released; stock of a
 * shipped order goes back on the shelf only with `restock` (goods returned).
 * A paid order stays "paid" until a refund is recorded, so the merchant sees
 * that money is still owed back.
 */
export async function cancelOrder(userId: string, storeId: string, orderId: string, input: unknown, meta: RequestMeta = {}) {
  await requireStoreAccess(userId, storeId, "orders.write");
  if (!isUuid(orderId)) throw notFound();
  const parsed = cancelSchema.safeParse(input);
  if (!parsed.success) throw new AppError("validation", parsed.error.issues[0].message, { reason: parsed.error.issues[0].message });
  const { reason, restock } = parsed.data;
  await withTenant({ storeId, userId }, async (tx) => {
    const order = await lockOrder(tx, orderId);
    if (order.status !== "open") throw invalid("لا يمكن إلغاء هذا الطلب.");
    if (order.fulfillmentStatus === "delivered") throw invalid("الطلب مُسلَّم. سجّل مرتجعاً واسترداداً بدلاً من الإلغاء.");
    const lines = await tx.select().from(orderItems).where(eq(orderItems.orderId, orderId));
    await releaseOrderStock(tx, storeId, orderId, lines, { restockCommitted: restock, actorUserId: userId });
    const paid = order.paymentStatus === "paid" || order.paymentStatus === "partially_refunded";
    await tx
      .update(orders)
      .set({
        status: "cancelled",
        fulfillmentStatus: order.fulfillmentStatus === "shipped" ? "returned" : "cancelled",
        paymentStatus: paid ? order.paymentStatus : "voided",
        cancelReason: reason,
        cancelledAt: sql`now()`,
      })
      .where(eq(orders.id, orderId));
    if (!paid) await tx.update(payments).set({ status: "voided" }).where(and(eq(payments.orderId, orderId), eq(payments.status, "pending")));
    await tx
      .update(customers)
      .set({ cancelledCount: sql`${customers.cancelledCount} + 1`, totalSpent: sql`greatest(${customers.totalSpent} - ${order.total}, 0)` })
      .where(eq(customers.id, order.customerId));
    await logEvent(tx, storeId, orderId, "cancelled", `أُلغي الطلب: ${reason}`, userId, { restock });
    await audit({ storeId, actorId: userId, action: "order.cancelled", targetType: "order", targetId: orderId, reason, meta }, tx);
  });
}

export const refundSchema = z.object({
  amount: z.string().transform((v, ctx) => {
    const m = parseMoney(v);
    if (m === null || Number.isNaN(m) || m <= 0) {
      ctx.addIssue({ code: "custom", message: "أدخل مبلغ الاسترداد." });
      return z.NEVER;
    }
    return m;
  }),
  reason: z.string().trim().max(500).default(""),
});

/**
 * Records a refund paid back to the customer outside the platform (cash or
 * bank transfer). Provider-side refunds for online payments come with real
 * gateway integrations.
 */
export async function recordRefund(userId: string, storeId: string, orderId: string, input: unknown, meta: RequestMeta = {}) {
  await requireStoreAccess(userId, storeId, "orders.write");
  if (!isUuid(orderId)) throw notFound();
  const parsed = refundSchema.safeParse(input);
  if (!parsed.success) throw new AppError("validation", parsed.error.issues[0].message, { amount: parsed.error.issues[0].message });
  const { amount, reason } = parsed.data;
  await withTenant({ storeId, userId }, async (tx) => {
    const order = await lockOrder(tx, orderId);
    if (!["paid", "partially_refunded"].includes(order.paymentStatus)) throw invalid("لا يوجد مبلغ مدفوع لاسترداده.");
    const remaining = order.total - order.refundedTotal;
    if (amount > remaining) throw new AppError("validation", `الحد الأقصى للاسترداد ${formatMoney(remaining, order.currency)}.`, { amount: "أكبر من المبلغ المتبقي." });
    const refundedTotal = order.refundedTotal + amount;
    const status = refundedTotal === order.total ? "refunded" : "partially_refunded";
    await tx.insert(refunds).values({ id: uuidv7(), storeId, orderId, amount, reason: reason || null, method: "manual", createdBy: userId });
    await tx.update(orders).set({ refundedTotal, paymentStatus: status }).where(eq(orders.id, orderId));
    await tx.update(payments).set({ status }).where(and(eq(payments.orderId, orderId), eq(payments.status, "paid")));
    await tx.update(payments).set({ status }).where(and(eq(payments.orderId, orderId), eq(payments.status, "partially_refunded")));
    await tx.update(customers).set({ totalSpent: sql`greatest(${customers.totalSpent} - ${amount}, 0)` }).where(eq(customers.id, order.customerId));
    await logEvent(tx, storeId, orderId, "refund", `تم تسجيل استرداد ${formatMoney(amount, order.currency)}${reason ? ` — ${reason}` : ""}`, userId);
    await audit({ storeId, actorId: userId, action: "order.refunded", targetType: "order", targetId: orderId, metadata: { amount }, reason, meta }, tx);
  });
}

export async function addOrderNote(userId: string, storeId: string, orderId: string, body: string) {
  await requireStoreAccess(userId, storeId, "orders.read");
  if (!isUuid(orderId)) throw notFound();
  const text = body.trim().slice(0, 2000);
  if (!text) throw new AppError("validation", "اكتب الملاحظة.");
  await withTenant({ storeId, userId }, async (tx) => {
    const [order] = await tx.select({ id: orders.id }).from(orders).where(eq(orders.id, orderId)).limit(1);
    if (!order) throw notFound();
    await tx.insert(orderNotes).values({ id: uuidv7(), storeId, orderId, authorUserId: userId, body: text });
  });
}

// ---------------------------------------------------------------------------
// Shopper-facing lookups
// ---------------------------------------------------------------------------

/** The order confirmation page, authorized by the unguessable access key in the link. */
export async function getOrderForShopper(storeId: string, number: number, accessKey: string) {
  if (!Number.isSafeInteger(number) || !/^[A-Za-z0-9_-]{16,64}$/.test(accessKey)) return null;
  return withTenant({ storeId }, async (tx) => {
    const [order] = await tx.select().from(orders).where(and(eq(orders.number, number), eq(orders.accessKey, accessKey))).limit(1);
    if (!order) return null;
    const [items, events, shipmentRows] = await Promise.all([
      tx.select().from(orderItems).where(eq(orderItems.orderId, order.id)),
      tx
        .select({ type: orderEvents.type, message: orderEvents.message, createdAt: orderEvents.createdAt })
        .from(orderEvents)
        .where(and(eq(orderEvents.orderId, order.id), sql`${orderEvents.type} not in ('note')`))
        .orderBy(asc(orderEvents.createdAt)),
      tx.select().from(shipments).where(eq(shipments.orderId, order.id)),
    ]);
    return { order, items, events, shipments: shipmentRows };
  });
}

/** "Track my order": number + the phone used at checkout. Returns the access key for the full page. */
export async function findOrderForTracking(storeId: string, number: number, phone: string) {
  if (!Number.isSafeInteger(number)) return null;
  return withTenant({ storeId }, async (tx) => {
    const [order] = await tx
      .select({ number: orders.number, accessKey: orders.accessKey })
      .from(orders)
      .where(and(eq(orders.number, number), sql`${orders.customerSnapshot}->>'phone' = ${phone}`))
      .limit(1);
    return order ?? null;
  });
}


/** CSV export of orders (UTF-8 with BOM for Excel), newest first. */
export async function exportOrdersCsv(userId: string, storeId: string, meta: RequestMeta = {}) {
  await requireStoreAccess(userId, storeId, "reports.read");
  const rows = await withTenant({ storeId, userId }, (tx) => tx.select().from(orders).orderBy(desc(orders.createdAt)).limit(50_000));
  await audit({ storeId, actorId: userId, action: "orders.exported", metadata: { count: rows.length }, meta });
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
    return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const amount = (m: number) => (m / 100).toFixed(2);
  const header = ["رقم الطلب", "التاريخ", "العميل", "الجوال", "المدينة", "المجموع", "الخصم", "الشحن", "الضريبة", "الإجمالي", "طريقة الدفع", "حالة الدفع", "حالة التنفيذ", "الحالة"];
  const lines = rows.map((o) =>
    [o.number, o.createdAt.toISOString(), o.customerSnapshot.name, o.customerSnapshot.phone, o.shippingAddress.city, amount(o.subtotal), amount(o.discountTotal), amount(o.shippingTotal), amount(o.taxTotal), amount(o.total), o.paymentMethod, o.paymentStatus, o.fulfillmentStatus, o.status]
      .map(esc)
      .join(","),
  );
  return "﻿" + [header.join(","), ...lines].join("\n");
}
