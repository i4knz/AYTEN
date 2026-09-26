// Pure pricing engine. Given current catalog prices (read from the database,
// never from the browser), a coupon and a shipping method, it computes every
// amount on the order. All values are integers in minor units (halalas).
//
// VAT handling follows the store setting:
// - prices include tax: tax is extracted from each line (and shipping/fee) as
//   amount * rate / (1 + rate); the total is unchanged.
// - prices exclude tax: tax is added on top of each line (and shipping/fee).
// [Needs accountant review before launch: VAT on shipping and COD fees.]

import type { CouponType } from "../db/schema";

export interface PricingLine {
  key: string;
  productId: string;
  categoryIds: string[];
  unitPrice: number;
  quantity: number;
  taxable: boolean;
}

export interface PricingCoupon {
  code: string;
  type: CouponType;
  value: number;
  maxDiscount: number | null;
  minSubtotal: number | null;
  productIds: string[];
  categoryIds: string[];
}

export interface PricingShipping {
  type: "flat" | "free_over" | "pickup";
  price: number;
  freeThreshold: number | null;
}

export interface PricingInput {
  lines: PricingLine[];
  coupon?: PricingCoupon | null;
  shipping?: PricingShipping | null;
  paymentFee?: number;
  tax: { enabled: boolean; rateBps: number; pricesIncludeTax: boolean };
}

export interface PricedLine extends PricingLine {
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
}

export interface PricingResult {
  lines: PricedLine[];
  subtotal: number;
  discountTotal: number;
  shippingTotal: number;
  paymentFee: number;
  taxTotal: number;
  total: number;
  coupon: { code: string; applied: boolean; reason?: string } | null;
}

/** Splits `amount` across `weights` proportionally, exactly (largest remainder). */
export function allocate(amount: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (amount <= 0 || sum <= 0) return weights.map(() => 0);
  const raw = weights.map((w) => (amount * w) / sum);
  const floored = raw.map(Math.floor);
  let rest = amount - floored.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => [r - floored[i], i] as const).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) {
    if (rest <= 0) break;
    floored[i] += 1;
    rest -= 1;
  }
  return floored;
}

function taxOf(amount: number, rateBps: number, inclusive: boolean): number {
  if (amount <= 0 || rateBps <= 0) return 0;
  return inclusive ? Math.round((amount * rateBps) / (10000 + rateBps)) : Math.round((amount * rateBps) / 10000);
}

/** No restrictions = every line. Otherwise a line qualifies if its product or any of its categories is listed. */
function isEligible(line: PricingLine, coupon: PricingCoupon): boolean {
  if (coupon.productIds.length === 0 && coupon.categoryIds.length === 0) return true;
  return coupon.productIds.includes(line.productId) || line.categoryIds.some((c) => coupon.categoryIds.includes(c));
}

export function priceOrder(input: PricingInput): PricingResult {
  const lines = input.lines.map((l) => ({ ...l, subtotal: l.unitPrice * l.quantity }));
  const subtotal = lines.reduce((a, l) => a + l.subtotal, 0);

  // Coupon
  let discounts = lines.map(() => 0);
  let freeShipping = false;
  let couponResult: PricingResult["coupon"] = null;
  const coupon = input.coupon;
  if (coupon) {
    const eligible = lines.map((l) => (isEligible(l, coupon) ? l.subtotal : 0));
    const eligibleSubtotal = eligible.reduce((a, b) => a + b, 0);
    if (coupon.minSubtotal && subtotal < coupon.minSubtotal) {
      couponResult = { code: coupon.code, applied: false, reason: "min_subtotal" };
    } else if (eligibleSubtotal === 0) {
      couponResult = { code: coupon.code, applied: false, reason: "no_eligible_items" };
    } else {
      let amount = 0;
      if (coupon.type === "percent") {
        amount = Math.floor((eligibleSubtotal * coupon.value) / 100);
        if (coupon.maxDiscount) amount = Math.min(amount, coupon.maxDiscount);
      } else if (coupon.type === "fixed") {
        amount = Math.min(coupon.value, eligibleSubtotal);
      } else {
        freeShipping = true;
      }
      discounts = allocate(amount, eligible);
      couponResult = { code: coupon.code, applied: true };
    }
  }
  const discountTotal = discounts.reduce((a, b) => a + b, 0);
  const afterDiscount = subtotal - discountTotal;

  // Shipping
  let shippingTotal = 0;
  const s = input.shipping;
  if (s && !freeShipping && s.type !== "pickup") {
    shippingTotal = s.type === "free_over" && s.freeThreshold !== null && afterDiscount >= s.freeThreshold ? 0 : s.price;
  }
  const paymentFee = input.paymentFee ?? 0;

  // Tax
  const { enabled, rateBps, pricesIncludeTax } = input.tax;
  const rate = enabled ? rateBps : 0;
  const priced: PricedLine[] = lines.map((l, i) => {
    const net = l.subtotal - discounts[i];
    const tax = l.taxable ? taxOf(net, rate, pricesIncludeTax) : 0;
    return { ...l, discount: discounts[i], tax, total: pricesIncludeTax ? net : net + tax };
  });
  const extrasTax = taxOf(shippingTotal, rate, pricesIncludeTax) + taxOf(paymentFee, rate, pricesIncludeTax);
  const linesTax = priced.reduce((a, l) => a + l.tax, 0);
  const taxTotal = linesTax + extrasTax;
  const total = afterDiscount + shippingTotal + paymentFee + (pricesIncludeTax ? 0 : taxTotal);

  return { lines: priced, subtotal, discountTotal, shippingTotal, paymentFee, taxTotal, total, coupon: couponResult };
}
