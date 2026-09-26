import { describe, expect, it } from "vitest";
import { addInterval, canTakeOrders, daysLeft, effectiveStatus, invoiceAmounts, nextPeriodEnd, paymentFee, withinLimit } from "@/server/billing/rules";
import { escapeXml, renderGoogleFeed } from "@/server/catalog/feed";
import { isValidSaudiIban, maskIban, normalizeIban } from "@/server/lib/iban";
import { generateReferralCode, maskName, normalizeReferralCode } from "@/server/referrals/service";
import { saudiIban } from "../support/iban";

const d = (s: string) => new Date(s);
const base = { trialEndsAt: null, currentPeriodEnd: null, cancelAtPeriodEnd: false };

describe("effectiveStatus", () => {
  const now = d("2026-05-10T00:00:00Z");
  it("expires a trial after its end date", () => {
    expect(effectiveStatus({ ...base, status: "trialing", trialEndsAt: d("2026-05-11T00:00:00Z") }, now, 7)).toBe("trialing");
    expect(effectiveStatus({ ...base, status: "trialing", trialEndsAt: d("2026-05-09T00:00:00Z") }, now, 7)).toBe("expired");
  });
  it("gives a paid period a grace window, then expires it", () => {
    const sub = { ...base, status: "active" as const, currentPeriodEnd: d("2026-05-05T00:00:00Z") };
    expect(effectiveStatus(sub, d("2026-05-04T00:00:00Z"), 7)).toBe("active");
    expect(effectiveStatus(sub, now, 7)).toBe("past_due");
    expect(effectiveStatus(sub, d("2026-05-13T00:00:00Z"), 7)).toBe("expired");
    expect(effectiveStatus(sub, now, 0)).toBe("expired");
  });
  it("ends a cancelled-at-period-end subscription without grace", () => {
    expect(effectiveStatus({ ...base, status: "active", currentPeriodEnd: d("2026-05-05T00:00:00Z"), cancelAtPeriodEnd: true }, now, 7)).toBe("cancelled");
  });
  it("treats an active subscription without an end date as open-ended", () => {
    expect(effectiveStatus({ ...base, status: "active" }, now, 7)).toBe("active");
  });
  it("only expired and cancelled stop orders", () => {
    expect(["trialing", "active", "past_due", "expired", "cancelled"].map((s) => canTakeOrders(s as "active"))).toEqual([true, true, true, false, false]);
  });
});

describe("periods and amounts", () => {
  it("stacks an early renewal on the current end", () => {
    const now = d("2026-05-10T00:00:00Z");
    expect(nextPeriodEnd(d("2026-05-20T00:00:00Z"), now, "monthly").toISOString()).toBe("2026-06-20T00:00:00.000Z");
    expect(nextPeriodEnd(d("2026-04-01T00:00:00Z"), now, "monthly").toISOString()).toBe("2026-06-10T00:00:00.000Z");
    expect(addInterval(now, "yearly").toISOString()).toBe("2027-05-10T00:00:00.000Z");
  });
  it("computes VAT and fees in halalas", () => {
    expect(invoiceAmounts(9900, 1500)).toEqual({ subtotal: 9900, tax: 1485, total: 11385 });
    expect(invoiceAmounts(9900, 0)).toEqual({ subtotal: 9900, tax: 0, total: 9900 });
    expect(paymentFee(12500, 250)).toBe(313);
    expect(paymentFee(10000, 0)).toBe(0);
  });
  it("counts days left and treats a null limit as unlimited", () => {
    expect(daysLeft(d("2026-05-12T12:00:00Z"), d("2026-05-10T00:00:00Z"))).toBe(3);
    expect(daysLeft(d("2026-05-01T00:00:00Z"), d("2026-05-10T00:00:00Z"))).toBe(0);
    expect(withinLimit(null, 10_000)).toBe(true);
    expect(withinLimit(3, 2)).toBe(true);
    expect(withinLimit(3, 3)).toBe(false);
  });
});

describe("IBAN", () => {
  it("accepts valid Saudi IBANs as typed and rejects bad check digits", () => {
    const iban = saudiIban();
    expect(isValidSaudiIban(iban)).toBe(true);
    expect(isValidSaudiIban(iban.toLowerCase().replace(/(.{4})/g, "$1 "))).toBe(true);
    const wrong = iban.slice(0, 2) + ((Number(iban.slice(2, 4)) + 1) % 100).toString().padStart(2, "0") + iban.slice(4);
    expect(isValidSaudiIban(wrong)).toBe(false);
    expect(isValidSaudiIban("AE070331234567890123456")).toBe(false);
    expect(normalizeIban(" sa12 34-56 ")).toBe("SA123456");
    expect(maskIban(iban)).toBe(`SA${iban.slice(2, 4)} •••• ${iban.slice(-4)}`);
  });
});

describe("referral codes", () => {
  it("generates unambiguous codes and normalizes input", () => {
    const code = generateReferralCode();
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    expect(normalizeReferralCode(" abcd1234 ")).toBe("ABCD1234");
    expect(normalizeReferralCode("x")).toBeNull();
    expect(normalizeReferralCode(42)).toBeNull();
    expect(maskName("محمد العتيبي")).toBe("م•••");
  });
});

describe("Google feed", () => {
  it("escapes text, uses sale_price for discounts and skips items without images", () => {
    const xml = renderGoogleFeed({ name: "متجر <نور> & شركاه", url: "https://noor.example", currency: "SAR" }, [
      { id: "SKU-1", groupId: "p1", title: 'قميص "أبيض"', description: "قطن", link: "https://noor.example/products/x", imageLink: "https://m/x.webp", price: 15000, salePrice: 12000, inStock: true, sku: "SKU-1", barcode: null },
      { id: "v2", groupId: null, title: "بدون صورة", description: "", link: "https://noor.example/products/y", imageLink: null, price: 1000, salePrice: null, inStock: false, sku: null, barcode: null },
    ]);
    expect(xml).toContain("<title>متجر &lt;نور&gt; &amp; شركاه</title>");
    expect(xml).toContain("<g:price>150.00 SAR</g:price><g:sale_price>120.00 SAR</g:sale_price>");
    expect(xml).toContain("<g:title>قميص &quot;أبيض&quot;</g:title>");
    expect(xml).toContain("<g:identifier_exists>no</g:identifier_exists>");
    expect(xml).not.toContain("بدون صورة");
    expect(escapeXml("a'b")).toBe("a&apos;b");
  });
});
