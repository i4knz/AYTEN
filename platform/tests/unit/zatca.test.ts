import { describe, expect, it } from "vitest";
import { decodeTlv, VAT_NUMBER_PATTERN, zatcaQrPayload } from "@/server/commerce/zatca";

describe("ZATCA phase 1 QR", () => {
  it("encodes the five TLV fields and round-trips Arabic seller names", () => {
    const payload = zatcaQrPayload({ sellerName: "متجر الورد", vatNumber: "310122393500003", timestamp: new Date("2026-09-26T10:15:30.123Z"), total: 11500, vat: 1500 });
    expect(decodeTlv(payload)).toEqual({ 1: "متجر الورد", 2: "310122393500003", 3: "2026-09-26T10:15:30Z", 4: "115.00", 5: "15.00" });
  });

  it("validates VAT numbers (15 digits starting and ending with 3)", () => {
    expect(VAT_NUMBER_PATTERN.test("310122393500003")).toBe(true);
    expect(VAT_NUMBER_PATTERN.test("123")).toBe(false);
    expect(VAT_NUMBER_PATTERN.test("210122393500003")).toBe(false);
  });
});
