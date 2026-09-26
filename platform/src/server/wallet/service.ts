import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { audit, type RequestMeta } from "../audit";
import { paymentFee } from "../billing/rules";
import type { Tx } from "../db/client";
import { payoutRequests, walletTransactions } from "../db/schema";
import { withTenant } from "../db/tenant";
import { AppError, isCheckViolation, isUniqueViolation, notFound } from "../lib/errors";
import { isValidSaudiIban, normalizeIban } from "../lib/iban";
import { isUuid, uuidv7 } from "../lib/ids";
import { formatMoney, parseMoney } from "../lib/money";
import { getPlatformSettings } from "../platform/settings";
import { requireStoreAccess } from "../stores/service";

/**
 * Credits an online payment to the store's wallet: the order total, minus the
 * platform fee, both withdrawable after the hold period. Idempotent per order
 * (unique index on order_id + type), so a replayed webhook never pays twice.
 */
export async function creditOnlineSale(tx: Tx, storeId: string, order: { id: string; number: number; total: number; currency: string }) {
  const { fees } = await getPlatformSettings(tx);
  const availableAt = sql`now() + make_interval(days => ${fees.payoutHoldDays})`;
  await tx
    .insert(walletTransactions)
    .values({ id: uuidv7(), storeId, type: "sale", amount: order.total, description: `مبيعات الطلب #${order.number}`, orderId: order.id, availableAt })
    .onConflictDoNothing();
  const fee = paymentFee(order.total, fees.onlinePaymentFeeBps);
  if (fee > 0) {
    await tx
      .insert(walletTransactions)
      .values({ id: uuidv7(), storeId, type: "fee", amount: -fee, description: `رسوم الدفع الإلكتروني للطلب #${order.number}`, orderId: order.id, availableAt })
      .onConflictDoNothing();
  }
}

export async function walletBalances(tx: Tx) {
  const [row] = await tx
    .select({
      balance: sql<string>`coalesce(sum(${walletTransactions.amount}), 0)`,
      available: sql<string>`coalesce(sum(${walletTransactions.amount}) filter (where ${walletTransactions.availableAt} <= now()), 0)`,
      sales: sql<string>`coalesce(sum(${walletTransactions.amount}) filter (where ${walletTransactions.type} = 'sale'), 0)`,
      fees: sql<string>`coalesce(-sum(${walletTransactions.amount}) filter (where ${walletTransactions.type} = 'fee'), 0)`,
    })
    .from(walletTransactions);
  const balance = Number(row.balance);
  const available = Number(row.available);
  return { balance, available: Math.max(0, available), pending: balance - available, sales: Number(row.sales), fees: Number(row.fees) };
}

const PAGE_SIZE = 30;

export async function getWallet(userId: string, storeId: string, page = 1) {
  await requireStoreAccess(userId, storeId, "billing.read");
  const { fees } = await getPlatformSettings();
  return withTenant({ storeId, userId }, async (tx) => {
    const balances = await walletBalances(tx);
    const rows = await tx
      .select()
      .from(walletTransactions)
      .orderBy(desc(walletTransactions.createdAt), desc(walletTransactions.id))
      .limit(PAGE_SIZE)
      .offset((Math.max(1, page) - 1) * PAGE_SIZE);
    const [{ total }] = await tx.select({ total: sql<number>`count(*)::int` }).from(walletTransactions);
    return { ...balances, settings: fees, transactions: rows, pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
  });
}

export async function listPayouts(userId: string, storeId: string) {
  await requireStoreAccess(userId, storeId, "billing.read");
  const { fees } = await getPlatformSettings();
  return withTenant({ storeId, userId }, async (tx) => {
    const balances = await walletBalances(tx);
    const payouts = await tx.select().from(payoutRequests).orderBy(desc(payoutRequests.createdAt)).limit(100);
    return { ...balances, minPayout: fees.minPayout, payouts, open: payouts.find((p) => p.status === "pending" || p.status === "approved") ?? null };
  });
}

const OPEN_PAYOUT_MESSAGE = "لديك طلب سحب قيد المعالجة. انتظر اكتماله أو ألغِه.";

const payoutSchema = z.object({
  amount: z.string().trim().min(1, { error: "أدخل المبلغ." }),
  bankName: z.string().trim().min(2, { error: "أدخل اسم البنك." }).max(80),
  accountName: z.string().trim().min(3, { error: "أدخل اسم صاحب الحساب كما في البنك." }).max(120),
  iban: z
    .string()
    .transform(normalizeIban)
    .refine(isValidSaudiIban, { error: "رقم الآيبان غير صحيح. يبدأ بـ SA ويتكون من 24 خانة." }),
});

/**
 * A payout request reserves the amount immediately (a negative "payout"
 * entry), so the same money cannot be requested twice. Rejection or
 * cancellation adds a reversing entry; nothing in the ledger is edited.
 */
export async function requestPayout(userId: string, storeId: string, input: unknown, meta: RequestMeta = {}) {
  await requireStoreAccess(userId, storeId, "billing.manage");
  const parsed = payoutSchema.safeParse(input);
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) errors[String(issue.path[0])] ??= issue.message;
    throw new AppError("validation", "راجع الحقول المظللة.", errors);
  }
  const amount = parseMoney(parsed.data.amount);
  if (amount == null || amount <= 0) throw new AppError("validation", "راجع الحقول المظللة.", { amount: "مبلغ غير صحيح." });
  const { fees } = await getPlatformSettings();
  if (amount < fees.minPayout) {
    throw new AppError("validation", "راجع الحقول المظللة.", { amount: `الحد الأدنى للسحب ${formatMoney(fees.minPayout)}.` });
  }
  try {
    return await withTenant({ storeId, userId }, async (tx) => {
      // Serialize payout requests per store so two tabs cannot both pass the balance check.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`payout:${storeId}`}))`);
      const [open] = await tx.select({ id: payoutRequests.id }).from(payoutRequests).where(inArray(payoutRequests.status, ["pending", "approved"])).limit(1);
      if (open) throw new AppError("invalid_state", OPEN_PAYOUT_MESSAGE);
      const { available } = await walletBalances(tx);
      if (amount > available) {
        throw new AppError("validation", "راجع الحقول المظللة.", { amount: `الرصيد القابل للسحب ${formatMoney(available)}.` });
      }
      const id = uuidv7();
      await tx.insert(payoutRequests).values({ id, storeId, amount, bankName: parsed.data.bankName, accountName: parsed.data.accountName, iban: parsed.data.iban, requestedBy: userId });
      await tx.insert(walletTransactions).values({ id: uuidv7(), storeId, type: "payout", amount: -amount, description: "طلب سحب رصيد", payoutId: id, createdBy: userId });
      await audit({ storeId, actorId: userId, action: "payout.requested", targetType: "payout", targetId: id, metadata: { amount }, meta }, tx);
      return { id };
    });
  } catch (err) {
    if (isUniqueViolation(err, "payout_one_open")) throw new AppError("invalid_state", OPEN_PAYOUT_MESSAGE);
    if (isCheckViolation(err)) throw new AppError("validation", "راجع الحقول المظللة.", { iban: "رقم الآيبان غير صحيح." });
    throw err;
  }
}

export async function cancelPayout(userId: string, storeId: string, payoutId: string, meta: RequestMeta = {}) {
  await requireStoreAccess(userId, storeId, "billing.manage");
  if (!isUuid(payoutId)) throw notFound();
  await withTenant({ storeId, userId }, async (tx) => {
    const [payout] = await tx
      .update(payoutRequests)
      .set({ status: "cancelled", processedAt: sql`now()` })
      .where(and(eq(payoutRequests.id, payoutId), eq(payoutRequests.status, "pending")))
      .returning();
    if (!payout) throw new AppError("invalid_state", "لا يمكن إلغاء هذا الطلب بعد بدء معالجته.");
    await tx.insert(walletTransactions).values({ id: uuidv7(), storeId, type: "payout_reversal", amount: payout.amount, description: "إلغاء طلب السحب", payoutId, createdBy: userId });
    await audit({ storeId, actorId: userId, action: "payout.cancelled", targetType: "payout", targetId: payoutId, meta }, tx);
  });
}

export const WALLET_TYPE_LABELS = {
  sale: "مبيعات",
  fee: "رسوم",
  refund: "استرداد",
  payout: "سحب",
  payout_reversal: "إرجاع سحب",
  adjustment: "تسوية",
} as const;

export const PAYOUT_STATUS_LABELS = {
  pending: "بانتظار المراجعة",
  approved: "قيد التحويل",
  paid: "تم التحويل",
  rejected: "مرفوض",
  cancelled: "ملغى",
} as const;
