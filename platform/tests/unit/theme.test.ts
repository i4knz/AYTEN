import { describe, expect, it } from "vitest";
import { parseBody } from "@/server/design/pages";
import {
  buttonClass,
  contrastRatio,
  contrastWarnings,
  defaultSection,
  onColor,
  parseLocalDateTime,
  PRESETS,
  readTheme,
  SECTION_LABELS,
  sectionSchema,
  themeCssVars,
  themeSchema,
  youtubeId,
  type SectionType,
} from "@/themes/config";

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

describe("theme v2 options and sections", () => {
  it("reads themes saved before the new options existed, filling defaults", () => {
    const old = {
      preset: "classic",
      colors: { primary: "#0f766e", background: "#ffffff", surface: "#f6f7f9", text: "#111827", muted: "#6b7280" },
      font: "cairo",
      radius: "md",
      header: { align: "center", showCategories: false },
      productCard: { aspect: "portrait", style: "card" },
      sections: [{ id: "sec0announcement", type: "announcement", visible: true, settings: { text: "مرحبا", link: "" } }],
      footer: { about: "", instagram: "", tiktok: "", snapchat: "", x: "" },
    };
    const t = readTheme(old);
    expect(t.font).toBe("cairo");
    expect(t.header).toEqual({ align: "center", showCategories: false, style: "light", showSearch: true });
    expect(t.productCard).toEqual({ aspect: "portrait", style: "card", align: "start", showBadge: true });
    expect(t.layout).toEqual({ width: "normal", spacing: "normal", buttons: "solid" });
    expect(t.headingFont).toBeNull();
    expect(t.sections[0]).toMatchObject({ type: "announcement", settings: { style: "static" } });
  });

  it("every preset and every default section is valid", () => {
    expect(PRESETS.map((p) => p.key)).toEqual(["classic", "luxe", "bold", "fresh", "minimal", "modest", "tech", "joy"]);
    for (const p of PRESETS) expect(themeSchema.safeParse(p.build()).success).toBe(true);
    for (const type of Object.keys(SECTION_LABELS)) {
      expect(sectionSchema.safeParse(defaultSection(type as SectionType)).success).toBe(true);
    }
  });

  it("accepts only YouTube links for videos", () => {
    expect(youtubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(youtubeId("https://youtu.be/dQw4w9WgXcQ?t=10")).toBe("dQw4w9WgXcQ");
    expect(youtubeId("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(youtubeId("https://evil.example/watch?v=dQw4w9WgXcQ")).toBeNull();
    expect(youtubeId("javascript:alert(1)")).toBeNull();
    const bad = { ...defaultSection("video"), settings: { title: "", url: "https://vimeo.com/1" } };
    expect(sectionSchema.safeParse(bad).success).toBe(false);
  });

  it("parses countdown end times in Saudi time and rejects nonsense", () => {
    expect(parseLocalDateTime("2026-10-01T21:00")?.toISOString()).toBe("2026-10-01T18:00:00.000Z");
    expect(parseLocalDateTime("2026-13-01T21:00")).toBeNull();
    expect(parseLocalDateTime("tomorrow")).toBeNull();
    const bad = { ...defaultSection("countdown"), settings: { ...defaultSection("countdown").settings, endsAt: "soon" } };
    expect(sectionSchema.safeParse(bad).success).toBe(false);
  });

  it("limits list sections and keeps images on the platform's own storage keys", () => {
    const slides = Array.from({ length: 6 }, () => ({ image: null, title: "x", subtitle: "", buttonText: "", buttonLink: "" }));
    expect(sectionSchema.safeParse({ ...defaultSection("slideshow"), settings: { slides, height: "md", overlay: 30 } }).success).toBe(false);
    const external = { ...defaultSection("gallery"), settings: { title: "", style: "grid", columns: 4, images: [{ image: "https://evil.example/x.png", title: "", link: "" }] } };
    expect(sectionSchema.safeParse(external).success).toBe(false);
  });

  it("maps button styles to distinct classes", () => {
    const t = PRESETS[0].build();
    const classes = (["solid", "outline", "soft"] as const).map((b) => buttonClass({ ...t, layout: { ...t.layout, buttons: b } }));
    expect(new Set(classes).size).toBe(3);
    expect(themeCssVars({ ...t, headingFont: "almarai" })["--font-heading"]).toContain("Almarai");
  });
});
