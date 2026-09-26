import { beforeEach, describe, expect, it } from "vitest";
import { verifyEmail } from "@/server/auth/service";
import { getProduct } from "@/server/catalog/products";
import { addToCart, recordCheckoutContact } from "@/server/commerce/cart";
import { placeOrder } from "@/server/commerce/checkout";
import { cancelOrder } from "@/server/commerce/orders";
import { getSalesReport } from "@/server/commerce/reports";
import { saveCoupon } from "@/server/commerce/coupons";
import { setCartCoupon } from "@/server/commerce/cart";
import { saveShippingMethod } from "@/server/commerce/shipping";
import { withTenant } from "@/server/db/tenant";
import { AppError } from "@/server/lib/errors";
import { listAbandonedCarts, markCartReminded } from "@/server/marketing/abandoned";
import { countAudience, saveCampaign, sendCampaign, unsubscribe, unsubscribeToken } from "@/server/marketing/campaigns";
import { getTrafficReport, recordPageView } from "@/server/marketing/traffic";
import { publishStore } from "@/server/stores/service";
import { makeProduct, simpleProduct } from "../support/catalog";
import { lastTokenFromOutbox, outbox } from "../support/db";
import { makeStore, makeUser } from "../support/factories";

async function expectCode(p: Promise<unknown>, code: string) {
  await expect(p).rejects.toSatisfy((e: unknown) => e instanceof AppError && e.code === code);
}

const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile Safari";
let n = 0;

async function shop() {
  const owner = await makeUser();
  await verifyEmail(lastTokenFromOutbox("email_verify"));
  const { storeId } = await makeStore(owner.userId);
  const { productId } = await makeProduct(owner.userId, storeId, simpleProduct({ variants: [{ ...simpleProduct().variants[0], quantity: 50 }] }));
  const variantId = (await getProduct(owner.userId, storeId, productId)).variants[0].variant.id;
  const { methodId } = await saveShippingMethod(owner.userId, storeId, null, { name: "توصيل", type: "flat", price: "20" });
  await publishStore(owner.userId, storeId);
  return { owner, storeId, productId, variantId, methodId };
}

async function buy(s: Awaited<ReturnType<typeof shop>>, over: Record<string, unknown> = {}, coupon?: string) {
  const { token } = await addToCart(s.storeId, null, s.variantId);
  if (coupon) await setCartCoupon(s.storeId, token, coupon);
  return placeOrder(s.storeId, token, { name: "عميل", phone: "0551234567", city: "الرياض", shippingMethodId: s.methodId, paymentMethod: "cod", idempotencyKey: `mk-${Date.now()}-${++n}`, ...over });
}

beforeEach(() => {
  n = 0;
});

describe("traffic analytics", () => {
  it("records anonymous views, ignores bots, and computes visitors, sources and conversion", async () => {
    const s = await shop();
    await recordPageView(s.storeId, { path: "/", referrer: "https://www.instagram.com/", ip: "203.0.113.1", userAgent: UA });
    await recordPageView(s.storeId, { path: "/products/x", ip: "203.0.113.1", userAgent: UA, productId: s.productId });
    await recordPageView(s.storeId, { path: "/", referrer: "https://google.com/", ip: "203.0.113.2", userAgent: "Mozilla/5.0 (Windows NT 10.0)" });
    expect(await recordPageView(s.storeId, { path: "/", ip: "203.0.113.3", userAgent: "Googlebot/2.1" })).toBe(false);
    await buy(s);
    const r = await getTrafficReport(s.owner.userId, s.storeId, "7d");
    expect(r.totals).toMatchObject({ views: 3, visitors: 2, productViews: 1, orders: 1, conversion: 0.5, mobile: 1 });
    expect(r.sources.map((x) => x.source).sort()).toEqual(["google", "instagram"]);
    expect(r.topProducts[0]).toMatchObject({ views: 1 });
    // Nothing identifying is stored.
    const rows = await withTenant({ storeId: s.storeId }, (tx) => tx.execute(`select * from page_views` as never));
    expect(JSON.stringify(rows.rows)).not.toContain("203.0.113");
  });
});

describe("abandoned carts", () => {
  it("lists carts that reached checkout with contact details and sends one email reminder", async () => {
    const s = await shop();
    const { token } = await addToCart(s.storeId, null, s.variantId, 2);
    await recordCheckoutContact(s.storeId, token, { name: "هند", phone: "+966551112222", email: "hind@example.com" });
    await withTenant({ storeId: s.storeId }, (tx) => tx.execute(`update carts set checkout_started_at = now() - interval '2 hours'` as never));
    const { carts } = await listAbandonedCarts(s.owner.userId, s.storeId);
    expect(carts).toHaveLength(1);
    expect(carts[0]).toMatchObject({ name: "هند", value: 50000, items: [{ quantity: 2 }] });
    await markCartReminded(s.owner.userId, s.storeId, carts[0].id, "email");
    expect(outbox.some((m) => m.tag === "abandoned_cart" && m.to === "hind@example.com")).toBe(true);
  });
});

describe("campaigns", () => {
  it("emails only opted-in customers once, with a working unsubscribe link", async () => {
    const s = await shop();
    await buy(s, { email: "yes@example.com", acceptsMarketing: true });
    await buy(s, { phone: "0552223333", email: "no@example.com", acceptsMarketing: false });
    await buy(s, { phone: "0553334444", acceptsMarketing: true }); // no email
    expect((await countAudience(s.owner.userId, s.storeId)).subscribers).toBe(1);

    const { campaignId } = await saveCampaign(s.owner.userId, s.storeId, null, { name: "العيد", subject: "عرض العيد", body: "خصم 10% على كل المنتجات", buttonText: "تسوق", buttonLink: "/", segment: "subscribers" });
    outbox.length = 0;
    expect(await sendCampaign(s.owner.userId, s.storeId, campaignId)).toEqual({ recipients: 1, sent: 1 });
    expect(outbox.map((m) => m.to)).toEqual(["yes@example.com"]);
    await expectCode(sendCampaign(s.owner.userId, s.storeId, campaignId), "invalid_state");
    await expectCode(saveCampaign(s.owner.userId, s.storeId, campaignId, { name: "x", subject: "xxx", body: "xxxxxxxxxxxx", segment: "subscribers" }), "invalid_state");

    const link = new URL(outbox[0].text.match(/https?:\/\/\S+unsubscribe\S+/)![0]);
    const customerId = link.searchParams.get("c")!;
    expect(await unsubscribe(s.storeId, customerId, "forged-token-forged-token-forged")).toBe(false);
    expect(await unsubscribe(s.storeId, customerId, unsubscribeToken(s.storeId, customerId))).toBe(true);
    expect((await countAudience(s.owner.userId, s.storeId)).subscribers).toBe(0);
  });
});

describe("sales report", () => {
  it("summarises net sales, cancellations, payment methods, cities and coupons", async () => {
    const s = await shop();
    await saveCoupon(s.owner.userId, s.storeId, null, { code: "TEN", type: "fixed", value: "10" });
    await buy(s, {}, "TEN");
    await buy(s, { city: "جدة" });
    const c = await buy(s);
    await cancelOrder(s.owner.userId, s.storeId, c.orderId, { reason: "تجربة" });
    const r = await getSalesReport(s.owner.userId, s.storeId, "7d");
    // 2 orders × 250 − 10 coupon + 2 × 20 shipping
    expect(r.summary).toMatchObject({ orders: 2, cancelled: 1, gross: 50000, discounts: 1000, shipping: 4000, net: 53000, items: 2 });
    expect(r.byCity.map((x) => x.city).sort()).toEqual(["الرياض", "جدة"]);
    expect(r.byCoupon).toEqual([{ code: "TEN", orders: 1, discount: 1000 }]);
    expect(r.byPayment).toEqual([{ method: "cod", orders: 2, total: 53000 }]);
  });
});
