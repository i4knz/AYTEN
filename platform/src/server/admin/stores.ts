import { and, asc, desc, eq, ilike, isNull, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import type { RequestMeta } from "../audit";
import { effectiveStatus, type SubscriptionState } from "../billing/rules";
import {
  auditLogs,
  notifications,
  payoutRequests,
  platformInvoices,
  plans,
  storeMembers,
  stores,
  storeSettings,
  subscriptions,
  supportTickets,
  users,
  userSessions,
} from "../db/schema";
import { AppError, notFound } from "../lib/errors";
import { isUuid, uuidv7 } from "../lib/ids";
import { getPlatformSettings } from "../platform/settings";
import { requireAdmin } from "./access";
import { adminAudit, adminTx, getAdminDb } from "./db";

const PAGE_SIZE = 25;

function likeTerm(q: string) {
  return `%${q.trim().slice(0, 80).replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

export async function getPlatformOverview(adminId: string, now = new Date()) {
  await requireAdmin(adminId, "stores.read");
  const db = getAdminDb();
  const { billing } = await getPlatformSettings(db);

  const [counts] = await db
    .select({
      merchants: sql<number>`(select count(*)::int from users)`,
      merchants30: sql<number>`(select count(*)::int from users where created_at > now() - interval '30 days')`,
      stores: sql<number>`(select count(*)::int from stores)`,
      published: sql<number>`(select count(*)::int from stores where status = 'published')`,
      suspended: sql<number>`(select count(*)::int from stores where status = 'suspended')`,
      stores30: sql<number>`(select count(*)::int from stores where created_at > now() - interval '30 days')`,
      orders30: sql<number>`(select count(*)::int from orders where created_at > now() - interval '30 days' and status <> 'cancelled')`,
      gmv30: sql<string>`(select coalesce(sum(total), 0) from orders where created_at > now() - interval '30 days' and status <> 'cancelled')`,
      onlinePaid30: sql<string>`(select coalesce(sum(amount), 0) from payments where status in ('paid', 'partially_refunded', 'refunded') and created_at > now() - interval '30 days')`,
      invoicesPaid30: sql<string>`(select coalesce(sum(total), 0) from platform_invoices where status = 'paid' and paid_at > now() - interval '30 days')`,
      invoicesPaidAll: sql<string>`(select coalesce(sum(total), 0) from platform_invoices where status = 'paid')`,
      invoicesOpen: sql<number>`(select count(*)::int from platform_invoices where status = 'issued')`,
      ticketsOpen: sql<number>`(select count(*)::int from support_tickets where status in ('open', 'waiting_support'))`,
      ticketsUrgent: sql<number>`(select count(*)::int from support_tickets where status in ('open', 'waiting_support') and priority = 1)`,
      payoutsPending: sql<number>`(select count(*)::int from payout_requests where status in ('pending', 'approved'))`,
      payoutsPendingAmount: sql<string>`(select coalesce(sum(amount), 0) from payout_requests where status in ('pending', 'approved'))`,
      webhookErrors7: sql<number>`(select count(*)::int from webhook_events where error is not null and received_at > now() - interval '7 days')`,
      walletLiability: sql<string>`(select coalesce(sum(amount), 0) from wallet_transactions)`,
    })
    .from(sql`(select 1) as one`);

  const subs = await db
    .select({ sub: subscriptions, priceMonthly: plans.priceMonthly, priceYearly: plans.priceYearly })
    .from(subscriptions)
    .innerJoin(plans, eq(plans.id, subscriptions.planId));
  const byStatus: Record<SubscriptionState, number> = { trialing: 0, active: 0, past_due: 0, expired: 0, cancelled: 0 };
  let mrr = 0;
  let trialsEndingSoon = 0;
  for (const { sub, priceMonthly, priceYearly } of subs) {
    const status = effectiveStatus(sub, now, billing.graceDays);
    byStatus[status] += 1;
    if (status === "active" && sub.currentPeriodEnd) mrr += sub.billingInterval === "monthly" ? priceMonthly : Math.round(priceYearly / 12);
    if (status === "trialing" && sub.trialEndsAt && sub.trialEndsAt.getTime() - now.getTime() < 7 * 86_400_000) trialsEndingSoon += 1;
  }

  const daily = await db.execute<{ day: string; stores: number; orders: number }>(sql`
    select to_char(d.day, 'YYYY-MM-DD') as day,
      (select count(*)::int from stores s where (s.created_at at time zone 'Asia/Riyadh')::date = d.day) as stores,
      (select count(*)::int from orders o where (o.created_at at time zone 'Asia/Riyadh')::date = d.day and o.status <> 'cancelled') as orders
    from generate_series((now() at time zone 'Asia/Riyadh')::date - 29, (now() at time zone 'Asia/Riyadh')::date, interval '1 day') as d(day)
    order by d.day`);

  const recentStores = await db
    .select({ id: stores.id, name: stores.name, slug: stores.slug, status: stores.status, createdAt: stores.createdAt, owner: users.name })
    .from(stores)
    .innerJoin(users, eq(users.id, stores.ownerUserId))
    .orderBy(desc(stores.createdAt))
    .limit(6);

  return {
    ...counts,
    gmv30: Number(counts.gmv30),
    onlinePaid30: Number(counts.onlinePaid30),
    invoicesPaid30: Number(counts.invoicesPaid30),
    invoicesPaidAll: Number(counts.invoicesPaidAll),
    payoutsPendingAmount: Number(counts.payoutsPendingAmount),
    walletLiability: Number(counts.walletLiability),
    subscriptions: byStatus,
    mrr,
    trialsEndingSoon,
    daily: daily.rows.map((r) => ({ day: r.day, stores: Number(r.stores), orders: Number(r.orders) })),
    recentStores,
  };
}

// ---------------------------------------------------------------------------
// Stores
// ---------------------------------------------------------------------------

export async function listStoresAdmin(adminId: string, opts: { q?: string; status?: string; page?: number } = {}) {
  await requireAdmin(adminId, "stores.read");
  const db = getAdminDb();
  const { billing } = await getPlatformSettings(db);
  const conditions: SQL[] = [];
  if (opts.q?.trim()) {
    const like = likeTerm(opts.q);
    conditions.push(or(ilike(stores.name, like), sql`${stores.slug}::text ilike ${like}`, ilike(users.email, like), ilike(users.name, like))!);
  }
  if (opts.status && ["draft", "published", "paused", "suspended"].includes(opts.status)) {
    conditions.push(eq(stores.status, opts.status as "draft"));
  }
  const page = Math.max(1, opts.page ?? 1);
  const where = conditions.length ? and(...conditions) : undefined;
  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: stores.id,
        name: stores.name,
        slug: stores.slug,
        status: stores.status,
        createdAt: stores.createdAt,
        ownerName: users.name,
        ownerEmail: users.email,
        planName: plans.name,
        sub: subscriptions,
        products: sql<number>`(select count(*)::int from products p where p.store_id = stores.id and p.status = 'active')`,
        orders: sql<number>`(select count(*)::int from orders o where o.store_id = stores.id and o.status <> 'cancelled')`,
        gmv: sql<string>`(select coalesce(sum(total), 0) from orders o where o.store_id = stores.id and o.status <> 'cancelled')`,
      })
      .from(stores)
      .innerJoin(users, eq(users.id, stores.ownerUserId))
      .leftJoin(subscriptions, eq(subscriptions.storeId, stores.id))
      .leftJoin(plans, eq(plans.id, subscriptions.planId))
      .where(where)
      .orderBy(desc(stores.createdAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ total: sql<number>`count(*)::int` }).from(stores).innerJoin(users, eq(users.id, stores.ownerUserId)).where(where),
  ]);
  const now = new Date();
  return {
    stores: rows.map(({ sub, gmv, ...r }) => ({ ...r, gmv: Number(gmv), subscriptionStatus: sub ? effectiveStatus(sub, now, billing.graceDays) : null })),
    page,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    total,
  };
}

export async function getStoreAdmin(adminId: string, storeId: string) {
  await requireAdmin(adminId, "stores.read");
  if (!isUuid(storeId)) throw notFound();
  const db = getAdminDb();
  const { billing } = await getPlatformSettings(db);
  const [row] = await db
    .select({ store: stores, owner: { id: users.id, name: users.name, email: users.email, emailVerifiedAt: users.emailVerifiedAt, lastLoginAt: users.lastLoginAt }, settings: storeSettings })
    .from(stores)
    .innerJoin(users, eq(users.id, stores.ownerUserId))
    .leftJoin(storeSettings, eq(storeSettings.storeId, stores.id))
    .where(eq(stores.id, storeId))
    .limit(1);
  if (!row) throw notFound();

  const [[subRow], [stats], members, invoices, payouts, tickets, logs, allPlans] = await Promise.all([
    db.select({ sub: subscriptions, plan: plans }).from(subscriptions).innerJoin(plans, eq(plans.id, subscriptions.planId)).where(eq(subscriptions.storeId, storeId)).limit(1),
    db
      .select({
        products: sql<number>`(select count(*)::int from products where store_id = ${storeId} and status <> 'archived')`,
        activeProducts: sql<number>`(select count(*)::int from products where store_id = ${storeId} and status = 'active')`,
        orders: sql<number>`(select count(*)::int from orders where store_id = ${storeId} and status <> 'cancelled')`,
        orders30: sql<number>`(select count(*)::int from orders where store_id = ${storeId} and status <> 'cancelled' and created_at > now() - interval '30 days')`,
        gmv: sql<string>`(select coalesce(sum(total), 0) from orders where store_id = ${storeId} and status <> 'cancelled')`,
        customers: sql<number>`(select count(*)::int from customers where store_id = ${storeId})`,
        shippingMethods: sql<number>`(select count(*)::int from shipping_methods where store_id = ${storeId} and active)`,
        lastOrderAt: sql<Date | null>`(select max(created_at) from orders where store_id = ${storeId})`,
        wallet: sql<string>`(select coalesce(sum(amount), 0) from wallet_transactions where store_id = ${storeId})`,
        views30: sql<number>`(select count(*)::int from page_views where store_id = ${storeId} and day > current_date - 30)`,
      })
      .from(sql`(select 1) as one`),
    db
      .select({ id: storeMembers.id, role: storeMembers.role, name: users.name, email: users.email })
      .from(storeMembers)
      .innerJoin(users, eq(users.id, storeMembers.userId))
      .where(and(eq(storeMembers.storeId, storeId), eq(storeMembers.status, "active")))
      .orderBy(asc(storeMembers.createdAt)),
    db.select().from(platformInvoices).where(eq(platformInvoices.storeId, storeId)).orderBy(desc(platformInvoices.createdAt)).limit(20),
    db.select().from(payoutRequests).where(eq(payoutRequests.storeId, storeId)).orderBy(desc(payoutRequests.createdAt)).limit(20),
    db.select().from(supportTickets).where(eq(supportTickets.storeId, storeId)).orderBy(desc(supportTickets.createdAt)).limit(20),
    db.select().from(auditLogs).where(eq(auditLogs.storeId, storeId)).orderBy(desc(auditLogs.createdAt)).limit(30),
    db.select().from(plans).where(isNull(plans.archivedAt)).orderBy(asc(plans.position)),
  ]);
  const now = new Date();
  return {
    ...row,
    subscription: subRow ? { ...subRow.sub, plan: subRow.plan, effective: effectiveStatus(subRow.sub, now, billing.graceDays) } : null,
    stats: { ...stats, gmv: Number(stats.gmv), wallet: Number(stats.wallet) },
    members,
    invoices,
    payouts,
    tickets,
    logs,
    plans: allPlans,
  };
}

const reasonSchema = z.string().trim().min(5, { error: "اكتب سبباً واضحاً (5 أحرف على الأقل)." }).max(500);

export async function suspendStore(adminId: string, storeId: string, reason: unknown, meta: RequestMeta = {}) {
  await requireAdmin(adminId, "stores.manage");
  if (!isUuid(storeId)) throw notFound();
  const parsed = reasonSchema.safeParse(reason);
  if (!parsed.success) throw new AppError("validation", parsed.error.issues[0].message, { reason: parsed.error.issues[0].message });
  await adminTx(async (tx) => {
    const [store] = await tx.select().from(stores).where(eq(stores.id, storeId)).for("update").limit(1);
    if (!store) throw notFound();
    if (store.status === "suspended") throw new AppError("invalid_state", "المتجر موقوف بالفعل.");
    await tx.update(stores).set({ status: "suspended", suspendedReason: parsed.data }).where(eq(stores.id, storeId));
    await tx.insert(notifications).values({ id: uuidv7(), storeId, type: "store.suspended", title: "تم إيقاف المتجر من إدارة المنصة", body: parsed.data, link: `/dashboard/${storeId}/help` });
    await adminAudit(tx, { adminId, storeId, action: "admin.store_suspended", targetType: "store", targetId: storeId, reason: parsed.data, metadata: { previousStatus: store.status }, meta });
  });
}

export async function reactivateStore(adminId: string, storeId: string, meta: RequestMeta = {}) {
  await requireAdmin(adminId, "stores.manage");
  if (!isUuid(storeId)) throw notFound();
  await adminTx(async (tx) => {
    const [store] = await tx.select().from(stores).where(eq(stores.id, storeId)).for("update").limit(1);
    if (!store) throw notFound();
    if (store.status !== "suspended") throw new AppError("invalid_state", "المتجر غير موقوف.");
    // A store that was live before goes back live; otherwise it returns to draft.
    const status = store.publishedAt ? "published" : "draft";
    await tx.update(stores).set({ status, suspendedReason: null }).where(eq(stores.id, storeId));
    await tx.insert(notifications).values({ id: uuidv7(), storeId, type: "store.reactivated", title: "أُعيد تفعيل المتجر", body: "", link: `/dashboard/${storeId}` });
    await adminAudit(tx, { adminId, storeId, action: "admin.store_reactivated", targetType: "store", targetId: storeId, metadata: { status }, meta });
  });
}

const subscriptionChangeSchema = z.object({
  planId: z.string().refine(isUuid, { error: "اختر باقة." }),
  mode: z.enum(["trial", "paid"]),
  days: z.coerce.number().int().min(1, { error: "المدة يوم واحد على الأقل." }).max(3650),
  reason: reasonSchema,
});

/**
 * Manually sets a store's plan: a trial of N days, or a paid period of N days
 * (e.g. a payment received outside the invoice flow, or a goodwill extension).
 */
export async function setStoreSubscription(adminId: string, storeId: string, input: unknown, meta: RequestMeta = {}) {
  await requireAdmin(adminId, "billing.manage");
  if (!isUuid(storeId)) throw notFound();
  const parsed = subscriptionChangeSchema.safeParse(input);
  if (!parsed.success) throw new AppError("validation", parsed.error.issues[0].message);
  const { planId, mode, days, reason } = parsed.data;
  await adminTx(async (tx) => {
    const [plan] = await tx.select().from(plans).where(eq(plans.id, planId)).limit(1);
    if (!plan) throw notFound();
    const until = sql`now() + make_interval(days => ${days})`;
    const values =
      mode === "trial"
        ? { planId, status: "trialing" as const, trialEndsAt: until, currentPeriodEnd: null, cancelAtPeriodEnd: false }
        : { planId, status: "active" as const, currentPeriodEnd: until, cancelAtPeriodEnd: false };
    const updated = await tx.update(subscriptions).set(values).where(eq(subscriptions.storeId, storeId)).returning({ id: subscriptions.id });
    if (!updated.length) {
      await tx.insert(subscriptions).values({ id: uuidv7(), storeId, billingInterval: "monthly", ...values });
    }
    await adminAudit(tx, { adminId, storeId, action: "admin.subscription_set", targetType: "store", targetId: storeId, reason, metadata: { plan: plan.key, mode, days }, meta });
  });
}

// ---------------------------------------------------------------------------
// Merchants (user accounts)
// ---------------------------------------------------------------------------

export async function listMerchants(adminId: string, opts: { q?: string; page?: number } = {}) {
  await requireAdmin(adminId, "stores.read");
  const db = getAdminDb();
  const where = opts.q?.trim() ? or(ilike(users.name, likeTerm(opts.q)), ilike(users.email, likeTerm(opts.q))) : undefined;
  const page = Math.max(1, opts.page ?? 1);
  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        emailVerifiedAt: users.emailVerifiedAt,
        lastLoginAt: users.lastLoginAt,
        createdAt: users.createdAt,
        stores: sql<number>`(select count(*)::int from stores s where s.owner_user_id = users.id)`,
        referredBy: sql<string | null>`(select r.name from users r where r.id = users.referred_by)`,
        activeSessions: sql<number>`(select count(*)::int from user_sessions us where us.user_id = users.id and us.revoked_at is null and us.expires_at > now())`,
      })
      .from(users)
      .where(where)
      .orderBy(desc(users.createdAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ total: sql<number>`count(*)::int` }).from(users).where(where),
  ]);
  return { merchants: rows, page, pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)), total };
}

/** Signs a user out everywhere (e.g. a reported account takeover). */
export async function revokeUserSessions(adminId: string, userId: string, meta: RequestMeta = {}) {
  await requireAdmin(adminId, "stores.manage");
  if (!isUuid(userId)) throw notFound();
  return adminTx(async (tx) => {
    const revoked = await tx
      .update(userSessions)
      .set({ revokedAt: sql`now()` })
      .where(and(eq(userSessions.userId, userId), isNull(userSessions.revokedAt)))
      .returning({ id: userSessions.id });
    await adminAudit(tx, { adminId, action: "admin.user_sessions_revoked", targetType: "user", targetId: userId, metadata: { count: revoked.length }, meta });
    return revoked.length;
  });
}

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------

export async function listAuditLogsAdmin(adminId: string, opts: { actor?: string; action?: string; page?: number } = {}) {
  await requireAdmin(adminId, "audit.read");
  const db = getAdminDb();
  const conditions: SQL[] = [];
  if (opts.actor === "platform_admin" || opts.actor === "user" || opts.actor === "system") conditions.push(eq(auditLogs.actorType, opts.actor));
  if (opts.action?.trim()) conditions.push(ilike(auditLogs.action, likeTerm(opts.action)));
  const page = Math.max(1, opts.page ?? 1);
  const where = conditions.length ? and(...conditions) : undefined;
  const rows = await db
    .select({ log: auditLogs, actorName: users.name, storeName: stores.name })
    .from(auditLogs)
    .leftJoin(users, eq(users.id, auditLogs.actorId))
    .leftJoin(stores, eq(stores.id, auditLogs.storeId))
    .where(where)
    .orderBy(desc(auditLogs.createdAt))
    .limit(50)
    .offset((page - 1) * 50);
  return { rows, page };
}
