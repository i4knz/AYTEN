import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { getAdminDb } from "@/server/admin/db";
import { markInvoicePaid, processPayout, voidInvoice } from "@/server/admin/finance";
import { grantAdmin, revokeAdmin, savePlan, saveSetting } from "@/server/admin/platform";
import { getPlatformOverview, getStoreAdmin, listStoresAdmin, reactivateStore, setStoreSubscription, suspendStore } from "@/server/admin/stores";
import { getTicketAdmin, listTicketQueue, replyAsSupport, saveHelpArticle } from "@/server/admin/support";
import { verifyEmail } from "@/server/auth/service";
import { getBillingOverview, getStorePlan, requestPlanInvoice, setCancelAtPeriodEnd, syncSubscriptionStatuses } from "@/server/billing/service";
import { listFeedItems } from "@/server/catalog/feed";
import { getProduct } from "@/server/catalog/products";
import { listStorefrontProducts } from "@/server/catalog/storefront";
import { addToCart } from "@/server/commerce/cart";
import { placeOrder } from "@/server/commerce/checkout";
import { applyPaymentEvent } from "@/server/commerce/payments";
import { savePaymentSettings, saveShippingMethod } from "@/server/commerce/shipping";
import { getDb } from "@/server/db/client";
import { auditLogs, payments, subscriptions, users } from "@/server/db/schema";
import { withTenant } from "@/server/db/tenant";
import { AppError } from "@/server/lib/errors";
import { listNotifications } from "@/server/notifications";
import { getPlatformSettings } from "@/server/platform/settings";
import { getReferralDashboard } from "@/server/referrals/service";
import { publishStore } from "@/server/stores/service";
import { closeTicket, createTicket, getTicket, listHelpArticles, replyToTicket } from "@/server/support/service";
import { inviteMember } from "@/server/team/service";
import { cancelPayout, getWallet, listPayouts, requestPayout } from "@/server/wallet/service";
import { makeAdmin } from "../support/admin";
import { makeProduct, shirtProduct, simpleProduct } from "../support/catalog";
import { asOwner, lastTokenFromOutbox, SEEDED_PLANS } from "../support/db";
import { makeStore, makeUser } from "../support/factories";
import { saudiIban } from "../support/iban";

async function expectCode(p: Promise<unknown>, code: string) {
  await expect(p).rejects.toSatisfy((e: unknown) => e instanceof AppError && e.code === code);
}

let seq = 0;
const key = () => `idem-p-${Date.now()}-${++seq}`;

async function shop(opts: { ref?: string } = {}) {
  const owner = await makeUser();
  if (opts.ref) {
    await getDb()
      .update(users)
      .set({ referredBy: (await getDb().select({ id: users.id }).from(users).where(eq(users.referralCode, opts.ref)))[0].id })
      .where(eq(users.id, owner.userId));
  }
  await verifyEmail(lastTokenFromOutbox("email_verify"));
  const { storeId } = await makeStore(owner.userId);
  const { productId } = await makeProduct(owner.userId, storeId, simpleProduct({ variants: [{ ...simpleProduct().variants[0], price: "100", quantity: 50 }] }));
  const variantId = (await getProduct(owner.userId, storeId, productId)).variants[0].variant.id;
  const { methodId } = await saveShippingMethod(owner.userId, storeId, null, { name: "توصيل", type: "flat", price: "25", cities: "" });
  await publishStore(owner.userId, storeId);
  return { owner, storeId, productId, variantId, methodId };
}

async function order(s: Awaited<ReturnType<typeof shop>>, paymentMethod = "cod") {
  const { token } = await addToCart(s.storeId, null, s.variantId, 1);
  return placeOrder(s.storeId, token, {
    name: "خالد",
    phone: "0551234567",
    email: "",
    city: "الرياض",
    district: "العليا",
    street: "طريق الملك فهد",
    details: "",
    postalCode: "",
    shippingMethodId: s.methodId,
    paymentMethod,
    note: "",
    acceptsMarketing: false,
    idempotencyKey: key(),
  });
}

async function platformOwner() {
  const u = await makeUser({ name: "مالك المنصة" });
  await makeAdmin(u.userId, "owner");
  return u.userId;
}

async function setTrialEnd(storeId: string, iso: string) {
  await asOwner(async (c) => {
    await c.query("begin");
    await c.query(`select set_config('app.store_id', $1, true)`, [storeId]);
    await c.query(`update subscriptions set trial_ends_at = $1 where store_id = $2`, [iso, storeId]);
    await c.query("commit");
  });
}

beforeEach(() => {
  delete process.env.PAYMENT_GATEWAY;
});

describe("subscriptions and plan limits", () => {
  it("starts every new store on the default plan's trial", async () => {
    const s = await shop();
    const plan = await getStorePlan(s.storeId);
    expect(plan).toMatchObject({ status: "trialing", canTakeOrders: true, plan: { id: SEEDED_PLANS.founders } });
    expect(plan.daysLeft).toBe(90);
    const overview = await getBillingOverview(s.owner.userId, s.storeId);
    expect(overview.plans.map((p) => p.key)).toEqual(["founders", "basic", "pro"]);
    expect(overview.usage).toMatchObject({ products: 1, staff: 0, ordersPerMonth: 0 });
  });

  it("enforces product and staff limits of the store's plan", async () => {
    const admin = await platformOwner();
    const s = await shop();
    const { id: tiny } = await savePlan(admin, null, {
      key: "tiny",
      name: "صغيرة",
      description: "",
      priceMonthly: "10",
      priceYearly: "100",
      trialDays: "0",
      position: "5",
      isPublic: true,
      products: "1",
      staff: "0",
      ordersPerMonth: "",
      campaigns: false,
      advancedReports: false,
      removeBranding: false,
    });
    await setStoreSubscription(admin, s.storeId, { planId: tiny, mode: "paid", days: 30, reason: "اختبار الحدود" });
    await expectCode(makeProduct(s.owner.userId, s.storeId, shirtProduct()), "plan_limit");
    await expectCode(inviteMember(s.owner.userId, s.storeId, { email: "staff@example.com", role: "orders" }), "plan_limit");
  });

  it("an expired trial stops new orders but keeps the store visible; a manual extension restores it", async () => {
    const admin = await platformOwner();
    const s = await shop();
    await order(s);
    await setTrialEnd(s.storeId, "2020-01-01T00:00:00Z");
    expect((await getStorePlan(s.storeId)).status).toBe("expired");
    await expectCode(order(s), "store_closed");
    expect(await syncSubscriptionStatuses()).toBe(1);
    expect(await syncSubscriptionStatuses()).toBe(0);
    const { items } = await listNotifications(s.owner.userId, s.storeId);
    expect(items.some((n) => n.type === "billing.expired")).toBe(true);
    await setStoreSubscription(admin, s.storeId, { planId: SEEDED_PLANS.founders, mode: "trial", days: 14, reason: "تمديد بطلب التاجر" });
    await expect(order(s)).resolves.toMatchObject({ number: expect.any(Number) });
  });

  it("issues one invoice at a time; paying it activates the plan and stacks renewals", async () => {
    const admin = await platformOwner();
    await saveSetting(admin, "billing", { bankName: "بنك", accountName: "المنصة", iban: saudiIban(), vatBps: "1500", vatNumber: "", graceDays: "7" });
    const s = await shop();
    const invoice = await requestPlanInvoice(s.owner.userId, s.storeId, { planId: SEEDED_PLANS.basic, interval: "monthly" });
    expect(invoice).toMatchObject({ subtotal: 9900, tax: 1485, total: 11385, status: "issued" });
    await expectCode(requestPlanInvoice(s.owner.userId, s.storeId, { planId: SEEDED_PLANS.pro, interval: "yearly" }), "invalid_state");
    await expectCode(requestPlanInvoice(s.owner.userId, s.storeId, { planId: SEEDED_PLANS.founders, interval: "monthly" }), "validation");

    await expectCode(markInvoicePaid(admin, invoice.id, { method: "bank_transfer", reference: "" }), "validation");
    await markInvoicePaid(admin, invoice.id, { method: "bank_transfer", reference: "TRX-1001" });
    await expectCode(markInvoicePaid(admin, invoice.id, { method: "bank_transfer", reference: "TRX-1001" }), "invalid_state");
    const plan = await getStorePlan(s.storeId);
    expect(plan).toMatchObject({ status: "active", plan: { key: "basic" } });
    const firstEnd = plan.subscription!.currentPeriodEnd!;
    expect(plan.daysLeft).toBeGreaterThanOrEqual(28);

    const renewal = await requestPlanInvoice(s.owner.userId, s.storeId, { planId: SEEDED_PLANS.basic, interval: "monthly" });
    await markInvoicePaid(admin, renewal.id, { method: "waived" });
    const renewed = (await getStorePlan(s.storeId)).subscription!.currentPeriodEnd!;
    expect(renewed.getTime() - firstEnd.getTime()).toBeGreaterThan(27 * 86_400_000);

    const voided = await requestPlanInvoice(s.owner.userId, s.storeId, { planId: SEEDED_PLANS.pro, interval: "monthly" });
    await voidInvoice(admin, voided.id, "طلب خاطئ");
    expect((await getBillingOverview(s.owner.userId, s.storeId)).openInvoice).toBeNull();

    await setCancelAtPeriodEnd(s.owner.userId, s.storeId, true);
    expect((await getStorePlan(s.storeId)).subscription!.cancelAtPeriodEnd).toBe(true);
    const logs = await getAdminDb().execute<{ action: string; actor_type: string }>(sql`select action, actor_type from audit_logs where action like 'admin.invoice%' order by created_at`);
    expect(logs.rows.map((r) => r.action)).toEqual(["admin.invoice_paid", "admin.invoice_paid", "admin.invoice_voided"]);
    expect(logs.rows.every((r) => r.actor_type === "platform_admin")).toBe(true);
  });
});

describe("wallet and payouts", () => {
  async function paidOnlineOrder(s: Awaited<ReturnType<typeof shop>>) {
    process.env.PAYMENT_GATEWAY = "test";
    await savePaymentSettings(s.owner.userId, s.storeId, { codEnabled: true, bankEnabled: false, onlineEnabled: true });
    const placed = await order(s, "online");
    const pid = await withTenant({ storeId: s.storeId }, async (tx) => (await tx.select().from(payments).where(eq(payments.orderId, placed.orderId)))[0].providerPaymentId!);
    const event = { provider: "test", eventId: `evt-${placed.orderId}`, storeId: s.storeId, providerPaymentId: pid, status: "paid" as const, amount: placed.total, currency: "SAR" };
    expect(await applyPaymentEvent(event)).toBe("applied");
    return placed;
  }

  it("credits online sales minus the platform fee after the hold period, exactly once", async () => {
    const s = await shop();
    const placed = await paidOnlineOrder(s);
    const w = await getWallet(s.owner.userId, s.storeId);
    const fee = Math.round((placed.total * 250) / 10_000);
    expect(w).toMatchObject({ balance: placed.total - fee, available: 0, pending: placed.total - fee, sales: placed.total, fees: fee });
    expect(w.transactions.map((t) => t.type).sort()).toEqual(["fee", "sale"]);
  });

  it("reserves payout requests, allows one open request, and reverses on cancel or rejection", async () => {
    const admin = await platformOwner();
    await saveSetting(admin, "fees", { onlinePaymentFeeBps: "0", payoutHoldDays: "0", minPayout: "50" });
    const s = await shop();
    const placed = await paidOnlineOrder(s);
    expect((await getWallet(s.owner.userId, s.storeId)).available).toBe(placed.total);

    const valid = { amount: "100", bankName: "الراجحي", accountName: "تاجر", iban: saudiIban() };
    await expectCode(requestPayout(s.owner.userId, s.storeId, { ...valid, amount: "10" }), "validation");
    await expectCode(requestPayout(s.owner.userId, s.storeId, { ...valid, iban: "SA0000000000000000000000" }), "validation");
    await expectCode(requestPayout(s.owner.userId, s.storeId, { ...valid, amount: "100000" }), "validation");

    const first = await requestPayout(s.owner.userId, s.storeId, valid);
    expect((await getWallet(s.owner.userId, s.storeId)).available).toBe(placed.total - 10000);
    await expectCode(requestPayout(s.owner.userId, s.storeId, valid), "invalid_state");
    await cancelPayout(s.owner.userId, s.storeId, first.id);
    expect((await getWallet(s.owner.userId, s.storeId)).available).toBe(placed.total);

    const second = await requestPayout(s.owner.userId, s.storeId, valid);
    await expectCode(processPayout(admin, second.id, "reject", { note: "" }), "validation");
    await processPayout(admin, second.id, "reject", { note: "اسم الحساب لا يطابق" });
    expect((await getWallet(s.owner.userId, s.storeId)).available).toBe(placed.total);

    const third = await requestPayout(s.owner.userId, s.storeId, valid);
    await processPayout(admin, third.id, "approve");
    await expectCode(cancelPayout(s.owner.userId, s.storeId, third.id), "invalid_state");
    await processPayout(admin, third.id, "pay", { reference: "SARIE-77" });
    const payouts = await listPayouts(s.owner.userId, s.storeId);
    expect(payouts.payouts.map((p) => p.status)).toEqual(["paid", "rejected", "cancelled"]);
    expect(payouts.available).toBe(placed.total - 10000);
    expect((await listNotifications(s.owner.userId, s.storeId)).items.some((n) => n.type === "payout.paid")).toBe(true);
  });

  it("a store's wallet is invisible to another store", async () => {
    const a = await shop();
    await paidOnlineOrder(a);
    const b = await shop();
    expect((await getWallet(b.owner.userId, b.storeId)).transactions).toHaveLength(0);
    await expectCode(getWallet(b.owner.userId, a.storeId), "not_found");
  });
});

describe("referrals", () => {
  it("rewards the referrer once, on the referred store's first paid invoice", async () => {
    const admin = await platformOwner();
    const referrer = await shop();
    const { code } = await getReferralDashboard(referrer.owner.userId);
    const before = (await getStorePlan(referrer.storeId)).subscription!.trialEndsAt!;

    const referred = await shop({ ref: code });
    const dash = await getReferralDashboard(referrer.owner.userId);
    expect(dash.referred).toHaveLength(1);
    expect(dash.referred[0]).toMatchObject({ stores: 1, rewarded: false });

    const inv = await requestPlanInvoice(referred.owner.userId, referred.storeId, { planId: SEEDED_PLANS.basic, interval: "monthly" });
    await markInvoicePaid(admin, inv.id, { method: "waived" });
    const after = (await getStorePlan(referrer.storeId)).subscription!.trialEndsAt!;
    expect(Math.round((after.getTime() - before.getTime()) / 86_400_000)).toBe(30);

    const inv2 = await requestPlanInvoice(referred.owner.userId, referred.storeId, { planId: SEEDED_PLANS.basic, interval: "monthly" });
    await markInvoicePaid(admin, inv2.id, { method: "waived" });
    expect((await getStorePlan(referrer.storeId)).subscription!.trialEndsAt!.getTime()).toBe(after.getTime());
    expect((await getReferralDashboard(referrer.owner.userId)).rewards).toHaveLength(1);
  });

  it("registration links a valid referral code and ignores unknown ones", async () => {
    const referrer = await makeUser();
    const { code } = await getReferralDashboard(referrer.userId);
    const { register } = await import("@/server/auth/service");
    const a = await register({ name: "أحمد", email: `ref-a-${Date.now()}@example.com`, password: "correct horse battery", acceptTerms: true, ref: code.toLowerCase() });
    const b = await register({ name: "بدر", email: `ref-b-${Date.now()}@example.com`, password: "correct horse battery", acceptTerms: true, ref: "NOPE1234" });
    const rows = await getDb().select({ id: users.id, referredBy: users.referredBy }).from(users);
    expect(rows.find((r) => r.id === a.userId)?.referredBy).toBe(referrer.userId);
    expect(rows.find((r) => r.id === b.userId)?.referredBy).toBeNull();
  });
});

describe("support tickets and help center", () => {
  it("prioritises by impact, hides internal notes from merchants and isolates stores", async () => {
    const admin = await platformOwner();
    const s = await shop();
    const other = await shop();
    const t = await createTicket(s.owner.userId, s.storeId, { subject: "العملاء لا يستطيعون الدفع", category: "checkout", body: "يظهر خطأ عند إتمام الطلب منذ الصباح" });
    expect(t.priority).toBe(1);
    await expectCode(createTicket(s.owner.userId, s.storeId, { subject: "x", category: "question", body: "قصير" }), "validation");

    await replyAsSupport(admin, t.id, { body: "نراجع السجل الآن", internal: true });
    await replyAsSupport(admin, t.id, { body: "تم الإصلاح، جرّب مرة أخرى", internal: false });
    const merchantView = await getTicket(s.owner.userId, s.storeId, t.id);
    expect(merchantView.messages.map((m) => m.body)).toEqual(["يظهر خطأ عند إتمام الطلب منذ الصباح", "تم الإصلاح، جرّب مرة أخرى"]);
    expect(merchantView.ticket.status).toBe("waiting_merchant");
    expect((await getTicketAdmin(admin, t.id)).messages).toHaveLength(3);
    expect((await listNotifications(s.owner.userId, s.storeId)).items[0].type).toBe("support.reply");

    await expectCode(getTicket(other.owner.userId, other.storeId, t.id), "not_found");
    await replyToTicket(s.owner.userId, s.storeId, t.id, "شكراً، يعمل الآن");
    expect((await listTicketQueue(admin)).map((r) => r.ticket.id)).toContain(t.id);
    await closeTicket(s.owner.userId, s.storeId, t.id, 5);
    expect((await getTicket(s.owner.userId, s.storeId, t.id)).ticket).toMatchObject({ status: "closed", rating: 5 });
    await expectCode(replyToTicket(s.owner.userId, s.storeId, t.id, "مرحبا"), "invalid_state");
  });

  it("serves only published help articles and searches them", async () => {
    const admin = await platformOwner();
    await saveHelpArticle(admin, null, { title: "طريقة السحب", slug: "payout-how", category: "payments", body: "أدخل الآيبان", position: 0, published: true });
    await saveHelpArticle(admin, null, { title: "مسودة", slug: "draft-x", category: "payments", body: "الآيبان", position: 0, published: false });
    await expectCode(saveHelpArticle(admin, null, { title: "مكرر", slug: "payout-how", category: "start", body: "x", position: 0, published: true }), "validation");
    expect((await listHelpArticles({ q: "الآيبان" })).map((a) => a.slug)).toEqual(["payout-how"]);
    expect(await listHelpArticles({ category: "orders" })).toHaveLength(0);
  });
});

describe("platform admin", () => {
  it("is invisible to non-admins and limited by admin role", async () => {
    const s = await shop();
    await expectCode(getPlatformOverview(s.owner.userId), "not_found");
    const support = await makeUser();
    await makeAdmin(support.userId, "support");
    await expect(listStoresAdmin(support.userId)).resolves.toMatchObject({ total: 1 });
    await expectCode(markInvoicePaid(support.userId, s.storeId, { method: "waived" }), "forbidden");
    await expectCode(saveSetting(support.userId, "fees", {}), "forbidden");
  });

  it("suspends and reactivates a store with an audited reason", async () => {
    const admin = await platformOwner();
    const s = await shop();
    await expectCode(suspendStore(admin, s.storeId, "قصير"), "validation");
    await suspendStore(admin, s.storeId, "بلاغ عن منتجات مخالفة");
    const detail = await getStoreAdmin(admin, s.storeId);
    expect(detail.store).toMatchObject({ status: "suspended", suspendedReason: "بلاغ عن منتجات مخالفة" });
    await expectCode(order(s), "store_closed");
    await expectCode(publishStore(s.owner.userId, s.storeId), "forbidden");
    await reactivateStore(admin, s.storeId);
    expect((await getStoreAdmin(admin, s.storeId)).store.status).toBe("published");
    const logs = await getAdminDb().execute(sql`select action, reason, actor_id from audit_logs where store_id = ${s.storeId} and actor_type = 'platform_admin' order by created_at`);
    expect(logs.rows).toMatchObject([
      { action: "admin.store_suspended", reason: "بلاغ عن منتجات مخالفة", actor_id: admin },
      { action: "admin.store_reactivated" },
    ]);
  });

  it("reports platform totals across stores", async () => {
    const admin = await platformOwner();
    const a = await shop();
    await shop();
    await order(a);
    const o = await getPlatformOverview(admin);
    expect(o).toMatchObject({ stores: 2, published: 2, orders30: 1, gmv30: 12500 });
    expect(o.subscriptions.trialing).toBe(2);
    expect(o.daily).toHaveLength(30);
  });

  it("keeps at least one platform owner", async () => {
    const owner = await platformOwner();
    const second = await makeUser();
    await grantAdmin(owner, { email: second.email, role: "finance" });
    await expectCode(revokeAdmin(owner, owner), "invalid_state");
    await grantAdmin(owner, { email: second.email, role: "owner" });
    await revokeAdmin(second.userId, owner);
    await expectCode(revokeAdmin(second.userId, second.userId), "invalid_state");
    await expectCode(grantAdmin(second.userId, { email: "nobody@example.com", role: "support" }), "validation");
  });

  it("validates platform settings before saving", async () => {
    const admin = await platformOwner();
    await expectCode(saveSetting(admin, "billing", { bankName: "", accountName: "", iban: "SA12", vatBps: "0", vatNumber: "", graceDays: "7" }), "validation");
    await saveSetting(admin, "support", { email: "help@example.com", whatsapp: "966500000000" });
    expect((await getPlatformSettings()).support.email).toBe("help@example.com");
    // Platform-level audit rows (no store) are readable only through the admin role.
    expect(await getDb().select().from(auditLogs).where(eq(auditLogs.action, "admin.settings_updated"))).toHaveLength(0);
    const rows = await getAdminDb().select().from(auditLogs).where(eq(auditLogs.action, "admin.settings_updated"));
    expect(rows).toHaveLength(1);
  });
});

describe("product feed", () => {
  it("lists one item per active variant with sale prices and stock", async () => {
    const s = await shop();
    await makeProduct(s.owner.userId, s.storeId, shirtProduct());
    const items = await listFeedItems(s.storeId, "https://shop.example");
    expect(items).toHaveLength(5);
    const shirt = items.find((i) => i.id === "SH-0")!;
    expect(shirt).toMatchObject({ price: 15000, salePrice: 12000, inStock: true, title: "قميص قطني - أبيض / M" });
    expect(shirt.groupId).not.toBeNull();
  });
});

describe("storefront search", () => {
  it("matches name, description and SKU, only active products of this store", async () => {
    const s = await shop();
    await makeProduct(s.owner.userId, s.storeId, shirtProduct());
    const other = await shop();
    await makeProduct(other.owner.userId, other.storeId, shirtProduct({ name: "قميص آخر" }));
    const byName = await listStorefrontProducts(s.storeId, { q: "قميص" });
    expect(byName?.products.map((p) => p.name)).toEqual(["قميص قطني"]);
    expect((await listStorefrontProducts(s.storeId, { q: "sh-2" }))?.products).toHaveLength(1);
    expect((await listStorefrontProducts(s.storeId, { q: "شرقي فاخر" }))?.products).toHaveLength(2);
    expect((await listStorefrontProducts(s.storeId, { q: "100%_" }))?.products).toHaveLength(0);
  });
});

describe("subscriptions table", () => {
  it("is isolated per store under RLS", async () => {
    const a = await shop();
    await shop();
    const visible = await withTenant({ storeId: a.storeId }, (tx) => tx.select().from(subscriptions));
    expect(visible).toHaveLength(1);
    expect(await withTenant({}, (tx) => tx.select().from(subscriptions))).toHaveLength(0);
  });
});
