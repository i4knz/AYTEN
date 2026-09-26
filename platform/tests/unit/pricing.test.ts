import { describe, expect, it } from "vitest";
import { allocate, priceOrder, type PricingCoupon, type PricingLine } from "@/server/commerce/pricing";

const line = (over: Partial<PricingLine> = {}): PricingLine => ({
  key: "a",
  productId: "p1",
  categoryIds: [],
  unitPrice: 10000,
  quantity: 1,
  taxable: true,
  ...over,
});
const noTax = { enabled: false, rateBps: 1500, pricesIncludeTax: true };
const coupon = (over: Partial<PricingCoupon> = {}): PricingCoupon => ({
  code: "SAVE",
  type: "percent",
  value: 10,
  maxDiscount: null,
  minSubtotal: null,
  productIds: [],
  categoryIds: [],
  ...over,
});

describe("allocate", () => {
  it("splits exactly, never losing a halala", () => {
    expect(allocate(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(allocate(7, [0, 5, 5])).toEqual([0, 4, 3]);
    expect(allocate(0, [1, 2])).toEqual([0, 0]);
    for (const amount of [1, 99, 1001, 12345]) {
      expect(allocate(amount, [3, 7, 11, 13]).reduce((a, b) => a + b)).toBe(amount);
    }
  });
});

describe("priceOrder", () => {
  it("sums lines and shipping without tax", () => {
    const r = priceOrder({
      lines: [line({ quantity: 2 }), line({ key: "b", unitPrice: 2550 })],
      shipping: { type: "flat", price: 2500, freeThreshold: null },
      tax: noTax,
    });
    expect(r).toMatchObject({ subtotal: 22550, discountTotal: 0, shippingTotal: 2500, taxTotal: 0, total: 25050 });
  });

  it("free-over shipping uses the discounted subtotal", () => {
    const shipping = { type: "free_over" as const, price: 2500, freeThreshold: 20000 };
    expect(priceOrder({ lines: [line({ quantity: 2 })], shipping, tax: noTax }).shippingTotal).toBe(0);
    expect(priceOrder({ lines: [line({ quantity: 2 })], shipping, coupon: coupon(), tax: noTax }).shippingTotal).toBe(2500);
    expect(priceOrder({ lines: [line()], shipping: { type: "pickup", price: 0, freeThreshold: null }, tax: noTax }).shippingTotal).toBe(0);
  });

  it("applies percent coupons with a cap and fixed coupons capped at the subtotal", () => {
    const lines = [line({ quantity: 3 })];
    expect(priceOrder({ lines, coupon: coupon({ value: 20 }), tax: noTax }).discountTotal).toBe(6000);
    expect(priceOrder({ lines, coupon: coupon({ value: 20, maxDiscount: 5000 }), tax: noTax }).discountTotal).toBe(5000);
    expect(priceOrder({ lines, coupon: coupon({ type: "fixed", value: 99999999 }), tax: noTax })).toMatchObject({ discountTotal: 30000, total: 0 });
  });

  it("restricts coupons to listed products or categories", () => {
    const lines = [line({ productId: "p1", categoryIds: ["c1"] }), line({ key: "b", productId: "p2", categoryIds: ["c2"] })];
    const byCat = priceOrder({ lines, coupon: coupon({ value: 50, categoryIds: ["c2"] }), tax: noTax });
    expect(byCat.lines.map((l) => l.discount)).toEqual([0, 5000]);
    const none = priceOrder({ lines, coupon: coupon({ productIds: ["p9"] }), tax: noTax });
    expect(none.coupon).toEqual({ code: "SAVE", applied: false, reason: "no_eligible_items" });
  });

  it("rejects coupons below the minimum subtotal", () => {
    const r = priceOrder({ lines: [line()], coupon: coupon({ minSubtotal: 20000 }), tax: noTax });
    expect(r).toMatchObject({ discountTotal: 0, coupon: { applied: false, reason: "min_subtotal" } });
  });

  it("free-shipping coupons zero the shipping", () => {
    const r = priceOrder({
      lines: [line()],
      coupon: coupon({ type: "free_shipping", value: 0 }),
      shipping: { type: "flat", price: 3000, freeThreshold: null },
      tax: noTax,
    });
    expect(r).toMatchObject({ shippingTotal: 0, total: 10000 });
  });

  it("extracts 15% VAT from tax-inclusive prices without changing the total", () => {
    const r = priceOrder({
      lines: [line({ unitPrice: 11500 })],
      shipping: { type: "flat", price: 2300, freeThreshold: null },
      tax: { enabled: true, rateBps: 1500, pricesIncludeTax: true },
    });
    expect(r).toMatchObject({ taxTotal: 1500 + 300, total: 13800 });
  });

  it("adds 15% VAT on top of tax-exclusive prices, after discounts, skipping non-taxable lines", () => {
    const r = priceOrder({
      lines: [line(), line({ key: "b", productId: "p2", taxable: false })],
      coupon: coupon({ type: "fixed", value: 2000, productIds: ["p1"] }),
      paymentFee: 1000,
      tax: { enabled: true, rateBps: 1500, pricesIncludeTax: false },
    });
    // p1: 10000 - 2000 = 8000 → tax 1200; p2 not taxable; fee 1000 → tax 150.
    expect(r).toMatchObject({ subtotal: 20000, discountTotal: 2000, taxTotal: 1350, total: 18000 + 1000 + 1350 });
  });
});
