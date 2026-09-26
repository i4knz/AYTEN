import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import type { RequestMeta } from "../audit";
import { nextPeriodEnd } from "../billing/rules";
import type { Tx } from "../db/client";
import { notifications, payoutRequests, platformInvoices, referralRewards, stores, subscriptions, users, walletTransactions } from "../db/schema";
import { AppError, notFound } from "../lib/errors";
import { isUuid, uuidv7 } from "../lib/ids";
import { getPlatformSettings } from "../platform/settings";
import { requireAdmin } from "./access";
import { adminAudit, adminTx, getAdminDb } from "./db";

// ---------------------------------------------------------------------------
// Subscription invoices
// ---------------------------------------------------------------------------

export async function listInvoicesAdmin(adminId: string, status?: string) {
  await requireAdmin(adminId, "billing.manage");
  const where = status === "issued" || status === "paid" || status === "void" ? eq(platformInvoices.status, status) : undefined;
  return getAdminDb()
    .select({ invoice: platformInvoices, storeName: stores.name, storeSlug: stores.slug })
    .from(platformInvoices)
    .innerJoin(stores, eq(stores.id, platformInvoices.storeId))
    .where(where)
    .orderBy(desc(platformInvoices.createdAt))
    .limit(200);
}

const markPaidSchema = z.object({
  method: z.enum(["bank_transfer", "gateway", "waived"]),
  reference: z.string().trim().max(100).optional().transform((v) => v || null),
});

/**
 * Confirms payment of an invoice and activates or extends the subscription
 * in the same transaction. Paid periods stack. The store owner's referrer
 * gets their reward on the referred store's first paid invoice.
 */
export async function markInvoicePaid(adminId: string, invoiceId: string, input: unknown, meta: RequestMeta = {}) {
  await requireAdmin(adminId, "billing.manage");
  if (!isUuid(invoiceId)) throw notFound();
  const parsed = markPaidSchema.safeParse(input);
  if (!parsed.success) throw new AppError("validation", "اختر طريقة الدفع.");
  const { method, reference } = parsed.data;
  if (method === "bank_transfer" && !reference) throw new AppError("validation", "أدخل رقم مرجع التحويل البنكي.", { reference: "مطلوب للتحويل البنكي." });
  const settings = await getPlatformSettings(getAdminDb());

  await adminTx(async (tx) => {
    const [invoice] = await tx.select().from(platformInvoices).where(eq(platformInvoices.id, invoiceId)).for("update").limit(1);
    if (!invoice) throw notFound();
    if (invoice.status !== "issued") throw new AppError("invalid_state", "الفاتورة ليست بانتظار الدفع.");
    await tx.update(platformInvoices).set({ status: "paid", paymentMethod: method, paymentReference: reference, paidAt: sql`now()` }).where(eq(platformInvoices.id, invoiceId));

    const [sub] = await tx.select().from(subscriptions).where(eq(subscriptions.storeId, invoice.storeId)).for("update").limit(1);
    const now = new Date();
    // Stack only on top of an active paid period of the same plan; a plan change starts fresh.
    const stackFrom = sub && sub.status !== "trialing" && sub.planId === invoice.planId ? sub.currentPeriodEnd : null;
    const periodEnd = nextPeriodEnd(stackFrom, now, invoice.billingInterval);
    const values = { planId: invoice.planId, status: "active" as const, billingInterval: invoice.billingInterval, currentPeriodEnd: periodEnd, cancelAtPeriodEnd: false };
    if (sub) await tx.update(subscriptions).set(values).where(eq(subscriptions.id, sub.id));
    else await tx.insert(subscriptions).values({ id: uuidv7(), storeId: invoice.storeId, ...values });

    await tx.insert(notifications).values({
      id: uuidv7(),
      storeId: invoice.storeId,
      type: "billing.paid",
      title: `تم تفعيل ${invoice.planName}`,
      body: `استلمنا دفعة الفاتورة رقم ${invoice.number}. شكراً لك.`,
      link: `/dashboard/${invoice.storeId}/billing`,
    });
    await adminAudit(tx, { adminId, storeId: invoice.storeId, action: "admin.invoice_paid", targetType: "platform_invoice", targetId: invoiceId, metadata: { method, reference, total: invoice.total, periodEnd }, meta });
    await grantReferralReward(tx, invoice.storeId, settings.referrals.rewardDays, adminId);
  });
}

async function grantReferralReward(tx: Tx, storeId: string, rewardDays: number, adminId: string) {
  if (rewardDays <= 0) return;
  const [store] = await tx
    .select({ ownerId: stores.ownerUserId, referrerId: users.referredBy })
    .from(stores)
    .innerJoin(users, eq(users.id, stores.ownerUserId))
    .where(eq(stores.id, storeId))
    .limit(1);
  if (!store?.referrerId) return;
  const [already] = await tx.select({ id: referralRewards.id }).from(referralRewards).where(eq(referralRewards.referredUserId, store.ownerId)).limit(1);
  if (already) return;

  // The reward extends the referrer's first store: its paid period if it has one, otherwise its trial.
  const [target] = await tx
    .select({ storeId: stores.id, sub: subscriptions })
    .from(stores)
    .innerJoin(subscriptions, eq(subscriptions.storeId, stores.id))
    .where(eq(stores.ownerUserId, store.referrerId))
    .orderBy(asc(stores.createdAt))
    .limit(1);
  let reward = `${rewardDays} يوماً مجانية`;
  if (target) {
    if (target.sub.status === "trialing") {
      await tx.update(subscriptions).set({ trialEndsAt: sql`greatest(coalesce(${subscriptions.trialEndsAt}, now()), now()) + make_interval(days => ${rewardDays})` }).where(eq(subscriptions.id, target.sub.id));
    } else if (target.sub.currentPeriodEnd) {
      await tx.update(subscriptions).set({ currentPeriodEnd: sql`greatest(${subscriptions.currentPeriodEnd}, now()) + make_interval(days => ${rewardDays})` }).where(eq(subscriptions.id, target.sub.id));
    } else {
      reward += " (الباقة الحالية بلا تاريخ انتهاء)";
    }
    await tx.insert(notifications).values({ id: uuidv7(), storeId: target.storeId, type: "referral.reward", title: "حصلت على مكافأة إحالة 🎉", body: `أُضيفت ${rewardDays} يوماً إلى اشتراكك لأن متجراً سجّل برابطك واشترك.`, link: `/dashboard/${target.storeId}/referrals` });
  } else {
    reward += " (لا يوجد متجر لتطبيقها عليه)";
  }
  await tx.insert(referralRewards).values({ id: uuidv7(), referrerId: store.referrerId, referredUserId: store.ownerId, storeId: target?.storeId ?? null, reward });
  await adminAudit(tx, { adminId, storeId: target?.storeId ?? null, action: "referral.rewarded", targetType: "user", targetId: store.referrerId, metadata: { referredUserId: store.ownerId, rewardDays } });
}

export async function voidInvoice(adminId: string, invoiceId: string, reason: unknown, meta: RequestMeta = {}) {
  await requireAdmin(adminId, "billing.manage");
  if (!isUuid(invoiceId)) throw notFound();
  const text = typeof reason === "string" ? reason.trim().slice(0, 300) : "";
  if (text.length < 3) throw new AppError("validation", "اكتب سبب الإلغاء.", { reason: "اكتب سبب الإلغاء." });
  await adminTx(async (tx) => {
    const [invoice] = await tx
      .update(platformInvoices)
      .set({ status: "void", voidedReason: text })
      .where(and(eq(platformInvoices.id, invoiceId), eq(platformInvoices.status, "issued")))
      .returning();
    if (!invoice) throw new AppError("invalid_state", "يمكن إلغاء الفواتير غير المدفوعة فقط.");
    await adminAudit(tx, { adminId, storeId: invoice.storeId, action: "admin.invoice_voided", targetType: "platform_invoice", targetId: invoiceId, reason: text, meta });
  });
}

// ---------------------------------------------------------------------------
// Payouts
// ---------------------------------------------------------------------------

export async function listPayoutsAdmin(adminId: string, status?: string) {
  await requireAdmin(adminId, "payouts.manage");
  const where =
    status === "open"
      ? inArray(payoutRequests.status, ["pending", "approved"])
      : status && ["pending", "approved", "paid", "rejected", "cancelled"].includes(status)
        ? eq(payoutRequests.status, status as "pending")
        : undefined;
  return getAdminDb()
    .select({
      payout: payoutRequests,
      storeName: stores.name,
      ownerName: users.name,
      balance: sql<string>`(select coalesce(sum(amount), 0) from wallet_transactions w where w.store_id = payout_requests.store_id)`,
    })
    .from(payoutRequests)
    .innerJoin(stores, eq(stores.id, payoutRequests.storeId))
    .innerJoin(users, eq(users.id, stores.ownerUserId))
    .where(where)
    .orderBy(asc(payoutRequests.createdAt))
    .limit(200);
}

const PAYOUT_TRANSITIONS = {
  approve: { from: ["pending"], to: "approved" },
  pay: { from: ["approved", "pending"], to: "paid" },
  reject: { from: ["pending", "approved"], to: "rejected" },
} as const;

export async function processPayout(
  adminId: string,
  payoutId: string,
  action: keyof typeof PAYOUT_TRANSITIONS,
  input: { reference?: unknown; note?: unknown } = {},
  meta: RequestMeta = {},
) {
  await requireAdmin(adminId, "payouts.manage");
  if (!isUuid(payoutId)) throw notFound();
  const transition = PAYOUT_TRANSITIONS[action];
  if (!transition) throw new AppError("validation", "إجراء غير معروف.");
  const reference = typeof input.reference === "string" ? input.reference.trim().slice(0, 100) : "";
  const note = typeof input.note === "string" ? input.note.trim().slice(0, 500) : "";
  if (action === "pay" && !reference) throw new AppError("validation", "أدخل رقم مرجع التحويل.", { reference: "مطلوب." });
  if (action === "reject" && note.length < 3) throw new AppError("validation", "اكتب سبب الرفض ليظهر للتاجر.", { note: "مطلوب." });

  await adminTx(async (tx) => {
    const [payout] = await tx.select().from(payoutRequests).where(eq(payoutRequests.id, payoutId)).for("update").limit(1);
    if (!payout) throw notFound();
    if (!(transition.from as readonly string[]).includes(payout.status)) throw new AppError("invalid_state", "حالة الطلب لا تسمح بهذا الإجراء.");
    await tx
      .update(payoutRequests)
      .set({
        status: transition.to,
        processedBy: adminId,
        processedAt: sql`now()`,
        ...(reference ? { transferReference: reference } : {}),
        ...(note ? { adminNote: note } : {}),
      })
      .where(eq(payoutRequests.id, payoutId));
    if (action === "reject") {
      await tx.insert(walletTransactions).values({ id: uuidv7(), storeId: payout.storeId, type: "payout_reversal", amount: payout.amount, description: "إرجاع طلب سحب مرفوض", payoutId, createdBy: adminId });
    }
    const titles = { approve: "طلب السحب قيد التحويل", pay: "تم تحويل رصيدك", reject: "رُفض طلب السحب" };
    await tx.insert(notifications).values({
      id: uuidv7(),
      storeId: payout.storeId,
      type: `payout.${transition.to}`,
      title: titles[action],
      body: action === "pay" ? `مرجع التحويل: ${reference}` : note,
      link: `/dashboard/${payout.storeId}/wallet/withdrawals`,
    });
    await adminAudit(tx, { adminId, storeId: payout.storeId, action: `admin.payout_${transition.to}`, targetType: "payout", targetId: payoutId, reason: note || undefined, metadata: { amount: payout.amount, reference: reference || undefined }, meta });
  });
}

// ---------------------------------------------------------------------------
// Payment activity (for the gateways page)
// ---------------------------------------------------------------------------

export async function getPaymentActivity(adminId: string) {
  await requireAdmin(adminId, "settings.manage");
  const db = getAdminDb();
  const [byProvider, webhooks] = await Promise.all([
    db.execute<{ provider: string; status: string; count: number; amount: string }>(sql`
      select provider, status, count(*)::int as count, coalesce(sum(amount), 0) as amount
      from payments where created_at > now() - interval '30 days'
      group by provider, status order by provider, status`),
    db.execute<{ provider: string; type: string; received_at: Date; error: string | null; processed_at: Date | null }>(sql`
      select provider, type, received_at, error, processed_at from webhook_events
      order by received_at desc limit 30`),
  ]);
  return { byProvider: byProvider.rows.map((r) => ({ ...r, amount: Number(r.amount) })), webhooks: webhooks.rows };
}
