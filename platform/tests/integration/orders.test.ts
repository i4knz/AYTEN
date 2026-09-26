import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { verifyEmail } from "@/server/auth/service";
import { getProduct } from "@/server/catalog/products";
import { addToCart, getCart, setCartCoupon, updateCartQuantity } from "@/server/commerce/cart";
import { getCheckoutOptions, placeOrder } from "@/server/commerce/checkout";
import { saveCoupon } from "@/server/commerce/coupons";
import { anonymizeCustomer, exportCustomersCsv, listCustomers } from "@/server/commerce/customers";
import {
  cancelOrder,
  findOrderForTracking,
  getOrder,
  getOrderForShopper,
  listOrders,
  markOrderDelivered,
  markOrderPaid,
  recordRefund,
  setOrderPreparation,
  shipOrder,
} from "@/server/commerce/orders";
import { applyPaymentEvent, expireUnpaidOnlineOrders } from "@/server/commerce/payments";
import { savePaymentSettings, saveShippingMethod } from "@/server/commerce/shipping";
import { inventoryLevels, orders, payments } from "@/server/db/schema";
import { withTenant } from "@/server/db/tenant";
import { AppError } from "@/server/lib/errors";
import { listNotifications } from "@/server/notifications";
import { getPaymentGateway } from "@/server/payments/gateway";
import { publishStore } from "@/server/stores/service";
import { makeProduct, simpleProduct } from "../support/catalog";
import { lastTokenFromOutbox, outbox } from "../support/db";
import { makeStore, makeUser } from "../support/factories";

async function expectCode(p: Promise<unknown>, code: string) {
  await expect(p).rejects.toSatisfy((e: unknown) => e instanceof AppError && e.code === code);
}

let seq = 0;
const key = () => `idem-${Date.now()}-${++seq}`;

/** A published store with one product (price 100 SAR, stock `qty`), flat shipping 25 SAR and COD. */
async function shop({ qty = 5, price = "100" } = {}) {
  const owner = await makeUser();
  await verifyEmail(lastTokenFromOutbox("email_verify"));
  const { storeId } = await makeStore(owner.userId);
  const { productId } = await makeProduct(owner.userId, storeId, simpleProduct({ variants: [{ ...simpleProduct().variants[0], price, quantity: qty }] }));
  const variantId = (await getProduct(owner.userId, storeId, productId)).variants[0].variant.id;
  const { methodId } = await saveShippingMethod(owner.userId, storeId, null, { name: "توصيل", type: "flat", price: "25", cities: "" });
  await publishStore(owner.userId, storeId);
  return { owner, storeId, productId, variantId, methodId };
}

const checkout = (methodId: string, over: Record<string, unknown> = {}) => ({
  name: "خالد",
  phone: "0551234567",
  email: "",
  city: "الرياض",
  district: "العليا",
  street: "طريق الملك فهد",
  details: "",
  postalCode: "",
  shippingMethodId: methodId,
  paymentMethod: "cod",
  note: "",
  acceptsMarketing: true,
  idempotencyKey: key(),
  ...over,
});

async function stock(storeId: string, variantId: string) {
  return withTenant({ storeId }, async (tx) => (await tx.select().from(inventoryLevels).where(eq(inventoryLevels.variantId, variantId)))[0]);
}

async function cartWith(storeId: string, variantId: string, qty = 1) {
  const { token } = await addToCart(storeId, null, variantId, qty);
  return token!;
}

beforeEach(() => {
  delete process.env.PAYMENT_GATEWAY;
});

describe("cart", () => {
  it("re-reads live prices and flags stock problems", async () => {
    const s = await shop({ qty: 2 });
    const token = await cartWith(s.storeId, s.variantId, 2);
    let cart = await getCart(s.storeId, token);
    expect(cart).toMatchObject({ itemCount: 2, canCheckout: true, pricing: { subtotal: 20000 } });
    await expectCode(addToCart(s.storeId, token, s.variantId, 1), "out_of_stock");
    await updateCartQuantity(s.storeId, token, s.variantId, 5);
    cart = await getCart(s.storeId, token);
    expect(cart.lines[0].problem).toBe("insufficient_stock");
    expect(cart.canCheckout).toBe(false);
    await updateCartQuantity(s.storeId, token, s.variantId, 0);
    expect((await getCart(s.storeId, token)).lines).toHaveLength(0);
  });

  it("a cart token is useless in another store", async () => {
    const a = await shop();
    const b = await shop();
    const token = await cartWith(a.storeId, a.variantId);
    expect((await getCart(b.storeId, token)).lines).toHaveLength(0);
    await expectCode(addToCart(b.storeId, token, a.variantId), "unavailable");
  });
});

describe("checkout", () => {
  it("creates an order with correct totals, reserves stock, records the customer and notifies the merchant", async () => {
    const s = await shop();
    const token = await cartWith(s.storeId, s.variantId, 2);
    const placed = await placeOrder(s.storeId, token, checkout(s.methodId));
    expect(placed).toMatchObject({ number: 1001, total: 22500, paymentRedirect: null, reused: false });

    const { order, items, customer } = await getOrder(s.owner.userId, s.storeId, placed.orderId);
    expect(order).toMatchObject({ subtotal: 20000, shippingTotal: 2500, total: 22500, paymentStatus: "pending", fulfillmentStatus: "unfulfilled", status: "open" });
    expect(items[0]).toMatchObject({ productName: "عطر العود الملكي", unitPrice: 10000, quantity: 2, stockState: "reserved" });
    expect(customer).toMatchObject({ phone: "+966551234567", ordersCount: 1, totalSpent: 22500, acceptsMarketing: true });
    expect(await stock(s.storeId, s.variantId)).toMatchObject({ onHand: 5, reserved: 2 });
    expect((await getCart(s.storeId, token)).lines).toHaveLength(0);
    expect((await listNotifications(s.owner.userId, s.storeId)).unread).toBe(1);
    await new Promise((r) => setTimeout(r, 50));
    expect(outbox.some((m) => m.tag === "order_created_merchant" && m.to === s.owner.email)).toBe(true);

    const second = await placeOrder(s.storeId, await cartWith(s.storeId, s.variantId), checkout(s.methodId));
    expect(second.number).toBe(1002);
  });

  it("is idempotent: retrying the same submission returns the same order", async () => {
    const s = await shop();
    const token = await cartWith(s.storeId, s.variantId);
    const input = checkout(s.methodId);
    const first = await placeOrder(s.storeId, token, input);
    const retry = await placeOrder(s.storeId, token, input);
    expect(retry).toMatchObject({ orderId: first.orderId, reused: true });
    expect((await listOrders(s.owner.userId, s.storeId)).total).toBe(1);
    expect(await stock(s.storeId, s.variantId)).toMatchObject({ reserved: 1 });
  });

  it("never sells the last unit twice under concurrent checkouts", async () => {
    const s = await shop({ qty: 1 });
    const tokens = await Promise.all(Array.from({ length: 5 }, () => cartWith(s.storeId, s.variantId)));
    const results = await Promise.allSettled(tokens.map((t, i) => placeOrder(s.storeId, t, checkout(s.methodId, { phone: `05500000${10 + i}` }))));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    for (const r of results.filter((r) => r.status === "rejected")) {
      expect((r as PromiseRejectedResult).reason).toBeInstanceOf(AppError);
    }
    expect(await stock(s.storeId, s.variantId)).toMatchObject({ onHand: 1, reserved: 1 });
  });

  it("ignores prices from the browser and rejects unknown shipping or disabled payment", async () => {
    const s = await shop();
    const token = await cartWith(s.storeId, s.variantId);
    await expectCode(placeOrder(s.storeId, token, checkout(s.methodId, { paymentMethod: "bank_transfer" })), "validation");
    await expectCode(placeOrder(s.storeId, token, checkout("0192b1d0-0000-7000-8000-000000000000")), "validation");
    await expectCode(placeOrder(s.storeId, token, checkout(s.methodId, { phone: "123" })), "validation");
    const placed = await placeOrder(s.storeId, token, { ...checkout(s.methodId), total: 1, price: 1, subtotal: 1 });
    expect(placed.total).toBe(12500);
  });

  it("filters shipping by city and applies COD fees and free-over thresholds", async () => {
    const s = await shop();
    await saveShippingMethod(s.owner.userId, s.storeId, null, { name: "جدة فقط", type: "free_over", price: "30", freeThreshold: "150", cities: "جدة" });
    await savePaymentSettings(s.owner.userId, s.storeId, { codEnabled: true, codFee: "10", bankEnabled: false, onlineEnabled: false });
    expect((await getCheckoutOptions(s.storeId, "الرياض")).shippingMethods.map((m) => m.name)).toEqual(["توصيل"]);
    const jeddah = (await getCheckoutOptions(s.storeId, "جدة")).shippingMethods.find((m) => m.name === "جدة فقط")!;
    const placed = await placeOrder(s.storeId, await cartWith(s.storeId, s.variantId, 2), checkout(s.methodId === jeddah.id ? "" : jeddah.id, { city: "جدة" }));
    expect(placed.total).toBe(20000 + 0 + 1000);
    await expectCode(placeOrder(s.storeId, await cartWith(s.storeId, s.variantId), checkout(jeddah.id, { city: "الرياض" })), "validation");
  });

  it("adds VAT on tax-exclusive stores", async () => {
    const s = await shop();
    await withTenant({ storeId: s.storeId }, (tx) => tx.execute(`update store_settings set tax_enabled = true, prices_include_tax = false` as never));
    const placed = await placeOrder(s.storeId, await cartWith(s.storeId, s.variantId), checkout(s.methodId));
    // (100 + 25 shipping) + 15% = 143.75
    expect(placed.total).toBe(14375);
  });

  it("refuses orders on unpublished stores", async () => {
    const s = await shop();
    const token = await cartWith(s.storeId, s.variantId);
    await withTenant({ storeId: s.storeId }, (tx) => tx.execute(`update stores set status = 'paused'` as never));
    await expectCode(placeOrder(s.storeId, token, checkout(s.methodId)), "store_closed");
  });
});

describe("coupons at checkout", () => {
  it("applies discounts, counts usage and enforces total and per-customer limits", async () => {
    const s = await shop({ qty: 50 });
    await saveCoupon(s.owner.userId, s.storeId, null, { code: "eid20", type: "percent", value: "20", usageLimit: "2", usageLimitPerCustomer: "1" });
    const token = await cartWith(s.storeId, s.variantId);
    await setCartCoupon(s.storeId, token, "EID20");
    expect((await getCart(s.storeId, token)).pricing.discountTotal).toBe(2000);
    const first = await placeOrder(s.storeId, token, checkout(s.methodId));
    expect(first.total).toBe(10500);

    const again = await cartWith(s.storeId, s.variantId);
    await setCartCoupon(s.storeId, again, "EID20");
    await expectCode(placeOrder(s.storeId, again, checkout(s.methodId)), "coupon"); // same phone

    const other = await cartWith(s.storeId, s.variantId);
    await setCartCoupon(s.storeId, other, "EID20");
    await placeOrder(s.storeId, other, checkout(s.methodId, { phone: "0559999999" }));

    const third = await cartWith(s.storeId, s.variantId);
    await expectCode(setCartCoupon(s.storeId, third, "EID20"), "validation"); // limit 2 reached
    await expectCode(setCartCoupon(s.storeId, third, "NOPE"), "validation");
  });

  it("does not exceed the usage limit under concurrent checkouts", async () => {
    const s = await shop({ qty: 50 });
    await saveCoupon(s.owner.userId, s.storeId, null, { code: "ONCE", type: "fixed", value: "10", usageLimit: "1" });
    const tokens = await Promise.all(Array.from({ length: 4 }, async () => {
      const t = await cartWith(s.storeId, s.variantId);
      await setCartCoupon(s.storeId, t, "ONCE");
      return t;
    }));
    const results = await Promise.allSettled(tokens.map((t, i) => placeOrder(s.storeId, t, checkout(s.methodId, { phone: `05511111${10 + i}` }))));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  });

  it("rejects expired and inactive coupons", async () => {
    const s = await shop();
    await saveCoupon(s.owner.userId, s.storeId, null, { code: "OLD", type: "fixed", value: "5", startsAt: "2020-01-01T00:00", endsAt: "2020-02-01T00:00" });
    await saveCoupon(s.owner.userId, s.storeId, null, { code: "OFF", type: "fixed", value: "5", active: false });
    const t = await cartWith(s.storeId, s.variantId);
    await expectCode(setCartCoupon(s.storeId, t, "OLD"), "validation");
    await expectCode(setCartCoupon(s.storeId, t, "OFF"), "validation");
  });
});

describe("order lifecycle", () => {
  it("prepare → ship (commits stock) → deliver (COD becomes paid) → completed", async () => {
    const s = await shop();
    const { orderId } = await placeOrder(s.storeId, await cartWith(s.storeId, s.variantId, 2), checkout(s.methodId));
    await setOrderPreparation(s.owner.userId, s.storeId, orderId, "processing");
    await expectCode(markOrderDelivered(s.owner.userId, s.storeId, orderId), "invalid_state");
    await shipOrder(s.owner.userId, s.storeId, orderId, { carrier: "سمسا", trackingNumber: "123", trackingUrl: "https://example.com/t/123" });
    expect(await stock(s.storeId, s.variantId)).toMatchObject({ onHand: 3, reserved: 0 });
    await shipOrder(s.owner.userId, s.storeId, orderId, {}).catch(() => undefined); // repeat is refused, stock unchanged
    expect(await stock(s.storeId, s.variantId)).toMatchObject({ onHand: 3, reserved: 0 });
    await markOrderDelivered(s.owner.userId, s.storeId, orderId);
    const { order, events } = await getOrder(s.owner.userId, s.storeId, orderId);
    expect(order).toMatchObject({ fulfillmentStatus: "delivered", paymentStatus: "paid", status: "completed" });
    expect(events.map((e) => e.type)).toEqual(["created", "fulfillment.processing", "fulfillment.shipped", "fulfillment.delivered", "payment.paid", "completed"]);
  });

  it("cancel releases reserved stock; cancel after shipping restocks only when asked", async () => {
    const s = await shop();
    const a = await placeOrder(s.storeId, await cartWith(s.storeId, s.variantId, 2), checkout(s.methodId));
    await cancelOrder(s.owner.userId, s.storeId, a.orderId, { reason: "طلب العميل" });
    expect(await stock(s.storeId, s.variantId)).toMatchObject({ onHand: 5, reserved: 0 });
    await expectCode(cancelOrder(s.owner.userId, s.storeId, a.orderId, { reason: "مرة ثانية" }), "invalid_state");

    const b = await placeOrder(s.storeId, await cartWith(s.storeId, s.variantId, 1), checkout(s.methodId));
    await shipOrder(s.owner.userId, s.storeId, b.orderId, {});
    expect(await stock(s.storeId, s.variantId)).toMatchObject({ onHand: 4 });
    await cancelOrder(s.owner.userId, s.storeId, b.orderId, { reason: "مرتجع", restock: true });
    expect(await stock(s.storeId, s.variantId)).toMatchObject({ onHand: 5, reserved: 0 });
    expect((await getOrder(s.owner.userId, s.storeId, b.orderId)).order.fulfillmentStatus).toBe("returned");
  });

  it("records partial and full refunds, never above what was paid", async () => {
    const s = await shop();
    const { orderId } = await placeOrder(s.storeId, await cartWith(s.storeId, s.variantId), checkout(s.methodId));
    await expectCode(recordRefund(s.owner.userId, s.storeId, orderId, { amount: "10" }), "invalid_state");
    await markOrderPaid(s.owner.userId, s.storeId, orderId);
    await recordRefund(s.owner.userId, s.storeId, orderId, { amount: "25", reason: "تأخر الشحن" });
    expect((await getOrder(s.owner.userId, s.storeId, orderId)).order).toMatchObject({ paymentStatus: "partially_refunded", refundedTotal: 2500 });
    await expectCode(recordRefund(s.owner.userId, s.storeId, orderId, { amount: "101" }), "validation");
    await recordRefund(s.owner.userId, s.storeId, orderId, { amount: "100" });
    expect((await getOrder(s.owner.userId, s.storeId, orderId)).order.paymentStatus).toBe("refunded");
  });

  it("staff permissions and store isolation apply to orders", async () => {
    const s = await shop();
    const other = await shop();
    const { orderId } = await placeOrder(s.storeId, await cartWith(s.storeId, s.variantId), checkout(s.methodId));
    await expectCode(getOrder(other.owner.userId, s.storeId, orderId), "not_found");
    await expectCode(getOrder(other.owner.userId, other.storeId, orderId), "not_found");
    await expectCode(cancelOrder(other.owner.userId, other.storeId, orderId, { reason: "hack" }), "not_found");
    expect((await listOrders(other.owner.userId, other.storeId)).total).toBe(0);
  });

  it("lists by tab and searches by number and phone", async () => {
    const s = await shop();
    const a = await placeOrder(s.storeId, await cartWith(s.storeId, s.variantId), checkout(s.methodId));
    const b = await placeOrder(s.storeId, await cartWith(s.storeId, s.variantId), checkout(s.methodId, { phone: "0501112222", name: "نورة" }));
    await setOrderPreparation(s.owner.userId, s.storeId, b.orderId, "processing");
    expect((await listOrders(s.owner.userId, s.storeId, { tab: "new" })).rows.map((r) => r.id)).toEqual([a.orderId]);
    expect((await listOrders(s.owner.userId, s.storeId, { tab: "processing" })).rows.map((r) => r.id)).toEqual([b.orderId]);
    expect((await listOrders(s.owner.userId, s.storeId, { q: "#1002" })).rows.map((r) => r.id)).toEqual([b.orderId]);
    expect((await listOrders(s.owner.userId, s.storeId, { q: "0501112222" })).rows.map((r) => r.id)).toEqual([b.orderId]);
    expect((await listOrders(s.owner.userId, s.storeId, { q: "نورة" })).rows.map((r) => r.id)).toEqual([b.orderId]);
  });
});

describe("shopper order pages", () => {
  it("needs the access key, or number + phone for tracking", async () => {
    const s = await shop();
    const placed = await placeOrder(s.storeId, await cartWith(s.storeId, s.variantId), checkout(s.methodId));
    expect(await getOrderForShopper(s.storeId, placed.number, placed.accessKey)).not.toBeNull();
    expect(await getOrderForShopper(s.storeId, placed.number, "x".repeat(24))).toBeNull();
    expect(await findOrderForTracking(s.storeId, placed.number, "+966551234567")).toMatchObject({ accessKey: placed.accessKey });
    expect(await findOrderForTracking(s.storeId, placed.number, "+966500000000")).toBeNull();
    const other = await shop();
    expect(await getOrderForShopper(other.storeId, placed.number, placed.accessKey)).toBeNull();
  });
});

describe("online payments (test gateway)", () => {
  async function onlineShop() {
    process.env.PAYMENT_GATEWAY = "test";
    const s = await shop();
    await savePaymentSettings(s.owner.userId, s.storeId, { codEnabled: true, bankEnabled: false, onlineEnabled: true });
    return s;
  }
  async function providerId(storeId: string, orderId: string) {
    return withTenant({ storeId }, async (tx) => (await tx.select().from(payments).where(eq(payments.orderId, orderId)))[0].providerPaymentId!);
  }

  it("redirects to the gateway, then a verified paid event marks the order paid exactly once", async () => {
    const s = await onlineShop();
    const placed = await placeOrder(s.storeId, await cartWith(s.storeId, s.variantId), checkout(s.methodId, { paymentMethod: "online" }));
    expect(placed.paymentRedirect).toMatch(/\/pay\/test\?ref=.+&sig=[0-9a-f]{64}$/);
    const pid = await providerId(s.storeId, placed.orderId);
    const event = { provider: "test", eventId: "evt_1", storeId: s.storeId, providerPaymentId: pid, status: "paid" as const, amount: 12500, currency: "SAR" };
    expect(await applyPaymentEvent(event)).toBe("applied");
    expect(await applyPaymentEvent(event)).toBe("duplicate");
    expect((await getOrder(s.owner.userId, s.storeId, placed.orderId)).order.paymentStatus).toBe("paid");
  });

  it("ignores events with a wrong amount, and online orders cannot be marked paid by hand", async () => {
    const s = await onlineShop();
    const placed = await placeOrder(s.storeId, await cartWith(s.storeId, s.variantId), checkout(s.methodId, { paymentMethod: "online" }));
    const pid = await providerId(s.storeId, placed.orderId);
    expect(await applyPaymentEvent({ provider: "test", eventId: "evt_x", storeId: s.storeId, providerPaymentId: pid, status: "paid", amount: 1, currency: "SAR" })).toBe("ignored");
    expect((await getOrder(s.owner.userId, s.storeId, placed.orderId)).order.paymentStatus).toBe("pending");
    await expectCode(markOrderPaid(s.owner.userId, s.storeId, placed.orderId), "invalid_state");
    await expectCode(shipOrder(s.owner.userId, s.storeId, placed.orderId, {}), "invalid_state");
  });

  it("failed payments can be retried; unpaid orders expire and release stock", async () => {
    const s = await onlineShop();
    const placed = await placeOrder(s.storeId, await cartWith(s.storeId, s.variantId), checkout(s.methodId, { paymentMethod: "online" }));
    const pid = await providerId(s.storeId, placed.orderId);
    await applyPaymentEvent({ provider: "test", eventId: "evt_f", storeId: s.storeId, providerPaymentId: pid, status: "failed", amount: 12500, currency: "SAR", failureReason: "رفض البنك" });
    expect((await getOrder(s.owner.userId, s.storeId, placed.orderId)).order.paymentStatus).toBe("failed");
    const retry = await getPaymentGateway().startPayment({ storeId: s.storeId, orderId: placed.orderId });
    expect(retry).toContain("/pay/test");

    expect(await expireUnpaidOnlineOrders(new Date(Date.now() + 61 * 60_000))).toBe(1);
    const { order } = await getOrder(s.owner.userId, s.storeId, placed.orderId);
    expect(order).toMatchObject({ status: "cancelled", paymentStatus: "voided" });
    expect(await stock(s.storeId, s.variantId)).toMatchObject({ reserved: 0 });
    await withTenant({ storeId: s.storeId }, async (tx) => expect((await tx.select().from(orders)).length).toBe(1));
  });
});

describe("customers", () => {
  it("segments, exports safe CSV, and anonymizes on request", async () => {
    const s = await shop({ qty: 50 });
    await placeOrder(s.storeId, await cartWith(s.storeId, s.variantId), checkout(s.methodId));
    await placeOrder(s.storeId, await cartWith(s.storeId, s.variantId), checkout(s.methodId));
    await placeOrder(s.storeId, await cartWith(s.storeId, s.variantId), checkout(s.methodId, { phone: "0507777777", name: "=HYPERLINK(1)", acceptsMarketing: false }));
    const repeat = await listCustomers(s.owner.userId, s.storeId, { segment: "repeat" });
    expect(repeat.rows.map((c) => c.phone)).toEqual(["+966551234567"]);
    expect((await listCustomers(s.owner.userId, s.storeId, { segment: "subscribers" })).total).toBe(1);
    const csv = await exportCustomersCsv(s.owner.userId, s.storeId);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain("'=HYPERLINK(1)");

    const target = (await listCustomers(s.owner.userId, s.storeId, { q: "0507777777" })).rows[0];
    await anonymizeCustomer(s.owner.userId, s.storeId, target.id);
    expect((await listCustomers(s.owner.userId, s.storeId)).total).toBe(1);
    const orderList = await listOrders(s.owner.userId, s.storeId);
    expect(orderList.rows.find((o) => o.customer.name === "عميل محذوف")).toBeTruthy();
  });
});
