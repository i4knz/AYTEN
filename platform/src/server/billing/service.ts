import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { audit, type RequestMeta } from "../audit";
import { getDb, type Tx } from "../db/client";
import { platformInvoices, plans, products, storeInvitations, storeMembers, stores, subscriptions, type PlanFeatures, type PlanLimits } from "../db/schema";
import { withTenant } from "../db/tenant";
import { AppError, isUniqueViolation, notFound } from "../lib/errors";
import { isUuid, uuidv7 } from "../lib/ids";
import { notify } from "../notifications";
import { getPlatformSettings } from "../platform/settings";
import { requireStoreAccess } from "../stores/service";
import { canTakeOrders, daysLeft, effectiveStatus, invoiceAmounts, withinLimit, type SubscriptionState } from "./rules";

export type Plan = typeof plans.$inferSelect;

/** Starts the default plan for a new store, inside the store-creation transaction. */
export async function createTrialSubscription(tx: Tx, storeId: string, now = new Date()) {
  const [plan] = await tx.select().from(plans).where(and(eq(plans.isDefault, true), isNull(plans.archivedAt))).limit(1);
  if (!plan) return;
  const trial = plan.trialDays > 0;
  await tx.insert(subscriptions).values({
    id: uuidv7(),
    storeId,
    planId: plan.id,
    status: trial ? "trialing" : "active",
    trialEndsAt: trial ? new Date(now.getTime() + plan.trialDays * 86_400_000) : null,
  });
}

export interface StorePlan {
  subscription: typeof subscriptions.$inferSelect | null;
  plan: Plan;
  status: SubscriptionState;
  /** Days left in the trial or the paid period, when either has an end. */
  daysLeft: number | null;
  canTakeOrders: boolean;
  graceDays: number;
}

/**
 * The store's plan and effective status. A store without a subscription row
 * (created before billing existed and not backfilled) is treated as being on
 * the default plan with an open trial, so it is never locked out by accident.
 */
export async function loadStorePlan(tx: Tx, storeId: string, now = new Date()): Promise<StorePlan> {
  const { billing } = await getPlatformSettings(tx);
  const [row] = await tx
    .select({ subscription: subscriptions, plan: plans })
    .from(subscriptions)
    .innerJoin(plans, eq(plans.id, subscriptions.planId))
    .where(eq(subscriptions.storeId, storeId))
    .limit(1);
  if (!row) {
    const [plan] = await tx.select().from(plans).where(eq(plans.isDefault, true)).limit(1);
    if (!plan) throw new Error("No default plan configured");
    return { subscription: null, plan, status: "trialing", daysLeft: null, canTakeOrders: true, graceDays: billing.graceDays };
  }
  const status = effectiveStatus(row.subscription, now, billing.graceDays);
  const end = status === "trialing" ? row.subscription.trialEndsAt : row.subscription.currentPeriodEnd;
  return { subscription: row.subscription, plan: row.plan, status, daysLeft: daysLeft(end, now), canTakeOrders: canTakeOrders(status), graceDays: billing.graceDays };
}

export async function getStorePlan(storeId: string): Promise<StorePlan> {
  return withTenant({ storeId }, (tx) => loadStorePlan(tx, storeId));
}

type LimitKey = keyof PlanLimits;

const LIMIT_MESSAGES: Record<LimitKey, (n: number) => string> = {
  products: (n) => `وصلت إلى الحد الأقصى للمنتجات في باقتك (${n} منتج). رقِّ باقتك من صفحة «الاشتراك» أو أرشف منتجات قديمة.`,
  staff: (n) => `وصلت إلى الحد الأقصى لأعضاء الفريق في باقتك (${n}). رقِّ باقتك من صفحة «الاشتراك».`,
  ordersPerMonth: (n) => `وصل المتجر إلى الحد الشهري للطلبات في باقته (${n}).`,
};

export async function countUsage(tx: Tx, storeId: string): Promise<Record<LimitKey, number>> {
  const [row] = await tx
    .select({
      products: sql<number>`(select count(*)::int from ${products} where status <> 'archived')`,
      staff: sql<number>`((select count(*)::int from ${storeMembers} where store_id = ${storeId} and status = 'active' and role <> 'owner')
        + (select count(*)::int from ${storeInvitations} where accepted_at is null and revoked_at is null and expires_at > now()))`,
      ordersPerMonth: sql<number>`(select count(*)::int from orders where created_at >= date_trunc('month', now() at time zone 'Asia/Riyadh') at time zone 'Asia/Riyadh')`,
    })
    .from(sql`(select 1) as one`);
  return row;
}

/** Throws when adding one more `key` would exceed the store's plan limit. */
export async function assertWithinPlanLimit(tx: Tx, storeId: string, key: LimitKey) {
  const { plan } = await loadStorePlan(tx, storeId);
  const limit = plan.limits[key];
  if (limit == null) return;
  const usage = await countUsage(tx, storeId);
  if (!withinLimit(limit, usage[key])) throw new AppError("plan_limit", LIMIT_MESSAGES[key](limit));
}

export async function assertPlanFeature(tx: Tx, storeId: string, feature: keyof PlanFeatures, label: string) {
  const { plan } = await loadStorePlan(tx, storeId);
  if (!plan.features[feature]) throw new AppError("plan_feature", `${label} غير متاحة في باقتك الحالية. رقِّ باقتك من صفحة «الاشتراك».`);
}

export async function listPublicPlans() {
  return withTenant({}, (tx) =>
    tx
      .select()
      .from(plans)
      .where(and(eq(plans.isPublic, true), isNull(plans.archivedAt)))
      .orderBy(asc(plans.position)),
  );
}

export async function getBillingOverview(userId: string, storeId: string) {
  await requireStoreAccess(userId, storeId, "billing.read");
  const settings = await getPlatformSettings();
  return withTenant({ storeId, userId }, async (tx) => {
    // One connection per transaction: queries run sequentially.
    const storePlan = await loadStorePlan(tx, storeId);
    const usage = await countUsage(tx, storeId);
    const invoices = await tx.select().from(platformInvoices).orderBy(desc(platformInvoices.createdAt)).limit(50);
    const available = await tx.select().from(plans).where(and(eq(plans.isPublic, true), isNull(plans.archivedAt))).orderBy(asc(plans.position));
    const openInvoice = invoices.find((i) => i.status === "issued") ?? null;
    return { ...storePlan, usage, invoices, openInvoice, plans: available, bank: settings.billing, support: settings.support };
  });
}

const upgradeSchema = z.object({
  planId: z.string().refine(isUuid, { error: "اختر باقة." }),
  interval: z.enum(["monthly", "yearly"], { error: "اختر مدة الاشتراك." }),
});

/**
 * Issues an invoice for a paid plan. The subscription changes only when the
 * platform confirms payment (admin "mark paid"), never on request.
 */
export async function requestPlanInvoice(userId: string, storeId: string, input: unknown, meta: RequestMeta = {}) {
  await requireStoreAccess(userId, storeId, "billing.manage");
  const parsed = upgradeSchema.safeParse(input);
  if (!parsed.success) throw new AppError("validation", parsed.error.issues[0].message);
  const { planId, interval } = parsed.data;
  const { billing } = await getPlatformSettings();
  try {
    return await withTenant({ storeId, userId }, async (tx) => {
      const [plan] = await tx.select().from(plans).where(and(eq(plans.id, planId), eq(plans.isPublic, true), isNull(plans.archivedAt))).limit(1);
      if (!plan) throw notFound();
      const price = interval === "monthly" ? plan.priceMonthly : plan.priceYearly;
      if (price <= 0) throw new AppError("validation", "هذه الباقة مجانية ولا تحتاج فاتورة. تواصل مع الدعم لتغييرها.");
      const amounts = invoiceAmounts(price, billing.vatBps);
      const [invoice] = await tx
        .insert(platformInvoices)
        .values({ id: uuidv7(), storeId, planId: plan.id, planName: plan.name, billingInterval: interval, ...amounts, currency: plan.currency, issuedBy: userId })
        .returning();
      await audit({ storeId, actorId: userId, action: "billing.invoice_requested", targetType: "platform_invoice", targetId: invoice.id, metadata: { plan: plan.key, interval, total: amounts.total }, meta }, tx);
      await notify(tx, storeId, { type: "billing.invoice", title: `صدرت فاتورة الاشتراك رقم ${invoice.number}`, body: "حوّل المبلغ واكتب رقم الفاتورة في وصف التحويل.", link: `/dashboard/${storeId}/billing` });
      return invoice;
    });
  } catch (err) {
    if (isUniqueViolation(err, "platform_invoices_one_open")) {
      throw new AppError("invalid_state", "لديك فاتورة بانتظار الدفع. ادفعها أولاً أو تواصل مع الدعم لإلغائها.");
    }
    throw err;
  }
}

export async function setCancelAtPeriodEnd(userId: string, storeId: string, cancel: boolean, meta: RequestMeta = {}) {
  await requireStoreAccess(userId, storeId, "billing.manage");
  await withTenant({ storeId, userId }, async (tx) => {
    const current = await loadStorePlan(tx, storeId);
    if (!current.subscription || current.status !== "active" || !current.subscription.currentPeriodEnd) {
      throw new AppError("invalid_state", "لا يوجد اشتراك مدفوع نشط لإلغاء تجديده.");
    }
    await tx.update(subscriptions).set({ cancelAtPeriodEnd: cancel }).where(eq(subscriptions.storeId, storeId));
    await audit({ storeId, actorId: userId, action: cancel ? "billing.cancel_scheduled" : "billing.cancel_reverted", targetType: "subscription", targetId: current.subscription.id, meta }, tx);
  });
}

export async function getInvoice(userId: string, storeId: string, invoiceId: string) {
  await requireStoreAccess(userId, storeId, "billing.read");
  if (!isUuid(invoiceId)) throw notFound();
  const settings = await getPlatformSettings();
  const invoice = await withTenant({ storeId, userId }, async (tx) => {
    const [row] = await tx.select().from(platformInvoices).where(eq(platformInvoices.id, invoiceId)).limit(1);
    return row;
  });
  if (!invoice) throw notFound();
  return { invoice, billing: settings.billing };
}

const STATUS_NOTICES: Partial<Record<SubscriptionState, { title: string; body: string }>> = {
  past_due: { title: "انتهت فترة اشتراكك", body: "جدّد اشتراكك خلال فترة السماح حتى لا يتوقف متجرك عن استقبال الطلبات." },
  expired: { title: "توقف متجرك عن استقبال الطلبات", body: "انتهى الاشتراك. متجرك ما زال ظاهراً للعملاء، وجدّد الاشتراك لاستقبال الطلبات مجدداً." },
  cancelled: { title: "انتهى اشتراكك الملغى", body: "يمكنك الاشتراك من جديد في أي وقت من صفحة «الاشتراك»." },
};

/**
 * Persists status transitions that dates have already implied (trial ended,
 * period ended, grace ended) and notifies the store once per transition.
 * Run periodically (scripts/jobs.ts). Checks never depend on it having run.
 */
export async function syncSubscriptionStatuses(now = new Date()): Promise<number> {
  // Subscriptions are only visible per store under RLS, so iterate stores.
  const ids = (await getDb().select({ id: stores.id }).from(stores)).map((r) => r.id);
  let changed = 0;
  for (const storeId of ids) {
    changed += await withTenant({ storeId }, async (tx) => {
      const [sub] = await tx.select().from(subscriptions).where(eq(subscriptions.storeId, storeId)).for("update").limit(1);
      if (!sub) return 0;
      const { billing } = await getPlatformSettings(tx);
      const status = effectiveStatus(sub, now, billing.graceDays);
      if (status === sub.status) return 0;
      await tx.update(subscriptions).set({ status }).where(eq(subscriptions.id, sub.id));
      const notice = STATUS_NOTICES[status];
      if (notice) await notify(tx, storeId, { type: `billing.${status}`, ...notice, link: `/dashboard/${storeId}/billing` });
      await audit({ storeId, actorType: "system", action: "billing.status_changed", targetType: "subscription", targetId: sub.id, metadata: { from: sub.status, to: status } }, tx);
      return 1;
    });
  }
  return changed;
}
