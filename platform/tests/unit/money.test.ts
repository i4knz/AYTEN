import { describe, expect, it } from "vitest";
import { toCatalogSlug } from "@/server/catalog/schemas";
import { formatMoney, parseMoney, toMajorString } from "@/server/lib/money";

describe("money", () => {
  it.each([
    ["99", 9900],
    ["99.5", 9950],
    ["99.50", 9950],
    ["٩٩٫٥٠", 9950],
    ["1,250.75", 125075],
    [" 0 ", 0],
  ])("parses %s", (input, minor) => expect(parseMoney(input)).toBe(minor));

  it("returns null for empty and NaN for junk", () => {
    expect(parseMoney("")).toBeNull();
    for (const bad of ["abc", "1.234", "-5", "1e3", "99.", "10000001"]) expect(parseMoney(bad), bad).toBeNaN();
  });

  it("formats for display and forms", () => {
    expect(formatMoney(9950)).toBe("99.50 ر.س");
    expect(formatMoney(25000)).toBe("250 ر.س");
    expect(toMajorString(9950)).toBe("99.50");
    expect(toMajorString(null)).toBe("");
  });
});

describe("catalog slugs", () => {
  it("keeps Arabic letters and strips delimiters and diacritics", () => {
    expect(toCatalogSlug("عطر العُود / الملكي؟")).toBe("عطر-العود-الملكي");
    expect(toCatalogSlug("T-Shirt #1")).toBe("t-shirt-1");
    expect(toCatalogSlug("???", "product")).toBe("product");
  });
});
