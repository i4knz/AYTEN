// Pure subscription and billing rules, shared by services, jobs and tests.

export type SubscriptionState = "trialing" | "active" | "past_due" | "expired" | "cancelled";
export type BillingInterval = "monthly" | "yearly";

export interface SubscriptionLike {
  status: SubscriptionState;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
}

const DAY_MS = 86_400_000;

/**
 * The status a subscription has at `now`, derived from its dates. The stored
 * status is only refreshed by the periodic job, so every check uses this.
 */
export function effectiveStatus(sub: SubscriptionLike, now: Date, graceDays: number): SubscriptionState {
  if (sub.status === "cancelled" || sub.status === "expired") return sub.status;
  if (sub.status === "trialing") {
    return sub.trialEndsAt && now > sub.trialEndsAt ? "expired" : "trialing";
  }
  // active / past_due
  if (!sub.currentPeriodEnd || now <= sub.currentPeriodEnd) return sub.status === "past_due" ? "past_due" : "active";
  if (sub.cancelAtPeriodEnd) return "cancelled";
  return now.getTime() <= sub.currentPeriodEnd.getTime() + graceDays * DAY_MS ? "past_due" : "expired";
}

/** Whether the storefront may accept new orders in this state. */
export function canTakeOrders(status: SubscriptionState): boolean {
  return status === "trialing" || status === "active" || status === "past_due";
}

export function addInterval(from: Date, interval: BillingInterval): Date {
  const d = new Date(from);
  if (interval === "monthly") d.setUTCMonth(d.getUTCMonth() + 1);
  else d.setUTCFullYear(d.getUTCFullYear() + 1);
  return d;
}

/** Paid periods stack: renewing early extends from the current end, not from today. */
export function nextPeriodEnd(currentEnd: Date | null, now: Date, interval: BillingInterval): Date {
  const start = currentEnd && currentEnd > now ? currentEnd : now;
  return addInterval(start, interval);
}

export function daysLeft(until: Date | null, now: Date): number | null {
  if (!until) return null;
  return Math.max(0, Math.ceil((until.getTime() - now.getTime()) / DAY_MS));
}

export function invoiceAmounts(price: number, vatBps: number) {
  const tax = Math.round((price * vatBps) / 10_000);
  return { subtotal: price, tax, total: price + tax };
}

/** Platform fee on an online payment, rounded to the nearest halala. */
export function paymentFee(amount: number, feeBps: number): number {
  return Math.round((amount * feeBps) / 10_000);
}

/** A null or missing limit means unlimited. */
export function withinLimit(limit: number | null | undefined, used: number): boolean {
  return limit == null || used < limit;
}

export const STATUS_LABELS: Record<SubscriptionState, string> = {
  trialing: "فترة تجريبية",
  active: "نشط",
  past_due: "متأخر السداد",
  expired: "منتهٍ",
  cancelled: "ملغى",
};
