import { describe, expect, it } from "vitest";
import { parseBody } from "@/server/design/pages";
import { contrastRatio, contrastWarnings, defaultSection, onColor, PRESETS, readTheme, themeSchema } from "@/themes/config";

describe("theme config", () => {
  it("every preset is valid and has unique section ids", () => {
    for (const p of PRESETS) {
      const t = p.build();
      expect(themeSchema.safeParse(t).success, p.key).toBe(true);
      expect(new Set(t.sections.map((s) => s.id)).size).toBe(t.sections.length);
    }
  });

  it("falls back to the default theme for missing or invalid data", () => {
    expect(readTheme(null, "#123456").colors.primary).toBe("#123456");
    expect(readTheme({ sections: [{ type: "script", html: "<script>" }] }).preset).toBe("classic");
  });

  it("rejects unsafe links and foreign image keys", () => {
    const hero = defaultSection("hero");
    const bad = (settings: object) => themeSchema.safeParse({ sections: [{ ...hero, settings: { ...hero.settings, ...settings } }] }).success;
    expect(bad({ buttonLink: "javascript:alert(1)" })).toBe(false);
    expect(bad({ buttonLink: "http://insecure.example" })).toBe(false);
    expect(bad({ buttonLink: "/categories/x" })).toBe(true);
    expect(bad({ buttonLink: "#products" })).toBe(true);
    expect(bad({ buttonLink: "//evil.example" })).toBe(false);
    expect(bad({ image: "../../etc/passwd" })).toBe(false);
  });

  it("computes WCAG contrast and readable text on the primary color", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0);
    expect(onColor("#0f766e")).toBe("#ffffff");
    expect(onColor("#fde047")).toBe("#111111");
    const t = PRESETS[0].build();
    expect(contrastWarnings(t)).toEqual([]);
    expect(contrastWarnings({ ...t, colors: { ...t.colors, text: "#eeeeee" } }).length).toBeGreaterThan(0);
  });
});

describe("page markup", () => {
  it("parses headings, lists and paragraphs without HTML", () => {
    expect(parseBody("## عنوان\nفقرة أولى\nسطر ثاني\n\n- أ\n- ب\n\n1. واحد\n2. اثنان\n\n<script>x</script>")).toEqual([
      { type: "h", text: "عنوان" },
      { type: "p", text: "فقرة أولى\nسطر ثاني" },
      { type: "ul", items: ["أ", "ب"] },
      { type: "ol", items: ["واحد", "اثنان"] },
      { type: "p", text: "<script>x</script>" },
    ]);
  });
});
