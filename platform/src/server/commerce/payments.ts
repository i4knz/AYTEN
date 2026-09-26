import { and, eq, lt, sql } from "drizzle-orm";
import { getDb } from "../db/client";
import { orderEvents, orderItems, orders, payments, stores, webhookEvents } from "../db/schema";
import { withTenant } from "../db/tenant";
import { uuidv7 } from "../lib/ids";
import { notify } from "../notifications";
import { creditOnlineSale } from "../wallet/service";
import { releaseOrderStock } from "./stock";

export interface ProviderPaymentEvent {
  provider: string;
  eventId: string;
  storeId: string;
  providerPaymentId: string;
  status: "paid" | "failed";
  amount: number;
  currency: string;
  failureReason?: string;
}

/**
 * Applies a verified provider notification. Idempotent: each provider event
 * id is recorded once (unique constraint), and a payment that is already
 * final is not changed again. The amount and currency must match what we
 * asked for; a mismatch is recorded and ignored.
 */
export async function applyPaymentEvent(event: ProviderPaymentEvent): Promise<"applied" | "duplicate" | "ignored"> {
  const inserted = await getDb()
    .insert(webhookEvents)
    .values({ id: uuidv7(), provider: event.provider, eventId: event.eventId, type: `payment.${event.status}`, payload: event })
    .onConflictDoNothing()
    .returning({ id: webhookEvents.id });
  if (!inserted.length) return "duplicate";
  const eventRowId = inserted[0].id;

  const outcome = await withTenant({ storeId: event.storeId }, async (tx) => {
    const [payment] = await tx
      .select()
      .from(payments)
      .where(and(eq(payments.provider, event.provider), eq(payments.providerPaymentId, event.providerPaymentId)))
      .for("update")
      .limit(1);
    if (!payment) return { result: "ignored" as const, error: "payment not found" };
    if (payment.status !== "pending") return { result: "ignored" as const, error: `payment already ${payment.status}` };
    if (payment.amount !== event.amount || payment.currency !== event.currency) {
      return { result: "ignored" as const, error: `amount mismatch: expected ${payment.amount} ${payment.currency}` };
    }
    const [order] = await tx.select().from(orders).where(eq(orders.id, payment.orderId)).for("update").limit(1);

    if (event.status === "paid") {
      await tx.update(payments).set({ status: "paid" }).where(eq(payments.id, payment.id));
      await tx.update(orders).set({ paymentStatus: "paid" }).where(eq(orders.id, order.id));
      await creditOnlineSale(tx, event.storeId, order);
      await tx.insert(orderEvents).values({ id: uuidv7(), storeId: event.storeId, orderId: order.id, type: "payment.paid", message: "تم الدفع إلكترونياً بنجاح", actorType: "provider" });
      await notify(tx, event.storeId, { type: "payment.paid", title: `تم دفع الطلب #${order.number}`, link: `/dashboard/${event.storeId}/orders/${order.id}` });
    } else {
      await tx.update(payments).set({ status: "failed", failureReason: event.failureReason?.slice(0, 300) ?? null }).where(eq(payments.id, payment.id));
      if (order.paymentStatus === "pending") await tx.update(orders).set({ paymentStatus: "failed" }).where(eq(orders.id, order.id));
      await tx.insert(orderEvents).values({
        id: uuidv7(),
        storeId: event.storeId,
        orderId: order.id,
        type: "payment.failed",
        message: `فشلت محاولة الدفع${event.failureReason ? `: ${event.failureReason.slice(0, 120)}` : ""}`,
        actorType: "provider",
      });
    }
    return { result: "applied" as const, error: null };
  });

  await getDb()
    .update(webhookEvents)
    .set({ processedAt: sql`now()`, error: outcome.error })
    .where(eq(webhookEvents.id, eventRowId));
  return outcome.result;
}

export const UNPAID_ONLINE_ORDER_TTL_MINUTES = 60;

/**
 * Cancels online-payment orders that were never paid and releases their
 * reserved stock. Run periodically (scripts/jobs.ts).
 */
export async function expireUnpaidOnlineOrders(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - UNPAID_ONLINE_ORDER_TTL_MINUTES * 60_000);
  const storeRows = await getDb().select({ id: stores.id }).from(stores);
  let expired = 0;
  for (const { id: storeId } of storeRows) {
    expired += await withTenant({ storeId }, async (tx) => {
      const stale = await tx
        .select()
        .from(orders)
        .where(
          and(
            eq(orders.paymentMethod, "online"),
            eq(orders.status, "open"),
            sql`${orders.paymentStatus} in ('pending', 'failed')`,
            lt(orders.createdAt, cutoff),
          ),
        )
        .for("update");
      for (const order of stale) {
        const lines = await tx.select().from(orderItems).where(eq(orderItems.orderId, order.id));
        await releaseOrderStock(tx, storeId, order.id, lines, { restockCommitted: false, actorUserId: null });
        await tx
          .update(orders)
          .set({ status: "cancelled", fulfillmentStatus: "cancelled", paymentStatus: "voided", cancelledAt: sql`now()`, cancelReason: "لم يكتمل الدفع خلال المهلة" })
          .where(eq(orders.id, order.id));
        await tx.update(payments).set({ status: "voided" }).where(and(eq(payments.orderId, order.id), eq(payments.status, "pending")));
        await tx.insert(orderEvents).values({ id: uuidv7(), storeId, orderId: order.id, type: "cancelled", message: "أُلغي الطلب تلقائياً لعدم اكتمال الدفع خلال المهلة", actorType: "system" });
      }
      return stale.length;
    });
  }
  return expired;
}
