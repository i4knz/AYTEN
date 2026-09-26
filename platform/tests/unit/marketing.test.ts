import { describe, expect, it } from "vitest";
import { upcomingOccasions } from "@/server/marketing/occasions";
import { classifyPath, classifySource } from "@/server/marketing/traffic";

describe("traffic classification", () => {
  it("maps referrers and utm_source to sources", () => {
    expect(classifySource(null, null)).toBe("direct");
    expect(classifySource("https://www.google.com.sa/", null)).toBe("google");
    expect(classifySource("https://l.instagram.com/?u=x", null)).toBe("instagram");
    expect(classifySource(null, "tiktok")).toBe("tiktok");
    expect(classifySource("https://t.co/abc", null)).toBe("x");
    expect(classifySource("https://example.org", null)).toBe("other");
  });

  it("classifies storefront paths", () => {
    expect(classifyPath("/")).toEqual({ pageType: "home", productSlug: null });
    expect(classifyPath("/products/%D8%B9%D8%B7%D8%B1?x=1")).toEqual({ pageType: "product", productSlug: "عطر" });
    expect(classifyPath("/checkout").pageType).toBe("checkout");
  });
});

describe("occasions", () => {
  it("finds Saudi National Day and orders by date", () => {
    const list = upcomingOccasions(new Date("2026-09-01T09:00:00Z"), 60);
    const national = list.find((o) => o.title === "اليوم الوطني السعودي")!;
    expect(national.daysLeft).toBe(22);
    expect(list.map((o) => o.date.getTime())).toEqual([...list.map((o) => o.date.getTime())].sort((a, b) => a - b));
  });

  it("computes Ramadan 1447 from the Umm al-Qura calendar (approximate)", () => {
    const list = upcomingOccasions(new Date("2026-01-15T09:00:00Z"), 60);
    const ramadan = list.find((o) => o.key === "ramadan");
    expect(ramadan?.approximate).toBe(true);
    // 1 Ramadan 1447 AH ≈ 18–19 Feb 2026.
    expect(ramadan!.date.toISOString().slice(0, 10) >= "2026-02-17").toBe(true);
    expect(ramadan!.date.toISOString().slice(0, 10) <= "2026-02-19").toBe(true);
  });
});
