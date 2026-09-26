// Storefront theme configuration. Pure module (no server imports) so the
// same schema, presets and helpers run on the server, in the storefront and
// in the live editor preview. Merchants only choose from controlled options
// and plain-text content: no HTML or CSS input, so a theme cannot break the
// layout or inject scripts.

import { z } from "zod";

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const text = (max: number) => z.string().max(max).default("");
// Links are either store paths ("/categories/…") or https URLs.
const link = z
  .string()
  .max(300)
  .default("")
  .refine((v) => v === "" || /^#[a-z0-9-]{1,40}$/.test(v) || (v.startsWith("/") && !v.startsWith("//")) || /^https:\/\/[^\s]+$/.test(v), { error: "رابط غير صالح" });
const imageKey = z
  .string()
  .regex(/^stores\/[0-9a-f-]{36}\/theme\/[0-9a-f-]{36}\.webp$/)
  .nullable()
  .default(null);

export const FONTS = {
  "ibm-plex": { label: "IBM Plex عربي", family: '"IBM Plex Sans Arabic"' },
  cairo: { label: "القاهرة (Cairo)", family: '"Cairo"' },
  tajawal: { label: "تجوال (Tajawal)", family: '"Tajawal"' },
  almarai: { label: "المراعي (Almarai)", family: '"Almarai"' },
} as const;
export type FontKey = keyof typeof FONTS;

// Containers use --radius (capped so large boxes never become pills);
// buttons use --radius-btn, which can be fully rounded.
export const RADII = { none: "0px", sm: "0.375rem", md: "0.75rem", lg: "1.25rem", full: "1.5rem" } as const;
const BUTTON_RADII = { none: "0px", sm: "0.375rem", md: "0.75rem", lg: "1.25rem", full: "999px" } as const;

export const FEATURE_ICONS = ["truck", "shield", "return", "support", "gift", "clock"] as const;

const section = <T extends string, S extends z.ZodRawShape>(type: T, settings: S) =>
  z.object({ id: z.string().regex(/^[a-z0-9]{6,20}$/), type: z.literal(type), visible: z.boolean().default(true), settings: z.object(settings) });

export const sectionSchema = z.discriminatedUnion("type", [
  section("announcement", { text: text(140), link }),
  section("hero", {
    title: text(80),
    subtitle: text(200),
    buttonText: text(30),
    buttonLink: link,
    image: imageKey,
    align: z.enum(["start", "center"]).default("start"),
    height: z.enum(["sm", "md", "lg"]).default("md"),
    overlay: z.number().int().min(0).max(80).default(35),
  }),
  section("categories", { title: text(60), style: z.enum(["circles", "cards"]).default("circles") }),
  section("products", {
    title: text(60),
    source: z.enum(["latest", "sale", "category"]).default("latest"),
    categorySlug: text(100),
    limit: z.number().int().min(2).max(24).default(8),
    columns: z.number().int().min(2).max(5).default(4),
  }),
  section("image_text", { title: text(80), body: text(600), image: imageKey, imageSide: z.enum(["start", "end"]).default("start"), buttonText: text(30), buttonLink: link }),
  section("features", {
    items: z
      .array(z.object({ icon: z.enum(FEATURE_ICONS), title: text(40), body: text(100) }))
      .max(4)
      .default([]),
  }),
  section("reviews", { title: text(60), limit: z.number().int().min(2).max(12).default(6) }),
  section("faq", { title: text(60), items: z.array(z.object({ q: text(150), a: text(600) })).max(12).default([]) }),
  section("rich_text", { title: text(80), body: text(2000), align: z.enum(["start", "center"]).default("center") }),
  section("whatsapp_cta", { title: text(80), body: text(200), buttonText: text(30) }),
]);
export type Section = z.infer<typeof sectionSchema>;
export type SectionType = Section["type"];

export const themeSchema = z.object({
  preset: z.string().max(20).default("classic"),
  colors: z
    .object({ primary: hex, background: hex, surface: hex, text: hex, muted: hex })
    .default({ primary: "#0f766e", background: "#ffffff", surface: "#f6f7f9", text: "#111827", muted: "#6b7280" }),
  font: z.enum(Object.keys(FONTS) as [FontKey, ...FontKey[]]).default("ibm-plex"),
  radius: z.enum(Object.keys(RADII) as [keyof typeof RADII, ...(keyof typeof RADII)[]]).default("md"),
  header: z.object({ align: z.enum(["start", "center"]).default("start"), showCategories: z.boolean().default(true) }).default({ align: "start", showCategories: true }),
  productCard: z.object({ aspect: z.enum(["square", "portrait"]).default("square"), style: z.enum(["plain", "card"]).default("plain") }).default({ aspect: "square", style: "plain" }),
  sections: z.array(sectionSchema).max(20).default([]),
  footer: z
    .object({
      about: text(300),
      instagram: text(60),
      tiktok: text(60),
      snapchat: text(60),
      x: text(60),
    })
    .default({ about: "", instagram: "", tiktok: "", snapchat: "", x: "" }),
});
export type ThemeConfig = z.infer<typeof themeSchema>;

export const SECTION_LABELS: Record<SectionType, string> = {
  announcement: "شريط إعلان",
  hero: "بانر رئيسي",
  categories: "التصنيفات",
  products: "شبكة منتجات",
  image_text: "صورة ونص",
  features: "مزايا المتجر",
  reviews: "آراء العملاء",
  faq: "الأسئلة الشائعة",
  rich_text: "نص",
  whatsapp_cta: "دعوة للتواصل عبر واتساب",
};

let counter = 0;
export function newSectionId(): string {
  counter = (counter + 1) % 1000;
  return (Date.now().toString(36) + counter.toString(36) + Math.random().toString(36).slice(2, 6)).slice(0, 20);
}

export function defaultSection(type: SectionType, id = newSectionId()): Section {
  const base = { id, visible: true };
  switch (type) {
    case "announcement":
      return { ...base, type, settings: { text: "شحن مجاني للطلبات فوق 200 ر.س", link: "" } };
    case "hero":
      return { ...base, type, settings: { title: "تشكيلة جديدة وصلت", subtitle: "اكتشف أحدث المنتجات بأسعار مميزة", buttonText: "تسوق الآن", buttonLink: "#products", image: null, align: "start", height: "md", overlay: 35 } };
    case "categories":
      return { ...base, type, settings: { title: "تسوق حسب القسم", style: "circles" } };
    case "products":
      return { ...base, type, settings: { title: "أحدث المنتجات", source: "latest", categorySlug: "", limit: 8, columns: 4 } };
    case "image_text":
      return { ...base, type, settings: { title: "قصتنا", body: "اكتب هنا نبذة عن متجرك وما يميز منتجاتك.", image: null, imageSide: "start", buttonText: "", buttonLink: "" } };
    case "features":
      return {
        ...base,
        type,
        settings: {
          items: [
            { icon: "truck", title: "توصيل سريع", body: "لجميع مدن المملكة" },
            { icon: "shield", title: "دفع آمن", body: "مدى وبطاقات ودفع عند الاستلام" },
            { icon: "return", title: "استرجاع سهل", body: "حسب سياسة المتجر" },
          ],
        },
      };
    case "reviews":
      return { ...base, type, settings: { title: "آراء عملائنا", limit: 6 } };
    case "faq":
      return { ...base, type, settings: { title: "الأسئلة الشائعة", items: [{ q: "كم تستغرق مدة التوصيل؟", a: "من يومين إلى خمسة أيام عمل حسب المدينة." }] } };
    case "rich_text":
      return { ...base, type, settings: { title: "مرحباً بك", body: "", align: "center" } };
    case "whatsapp_cta":
      return { ...base, type, settings: { title: "عندك سؤال؟", body: "فريقنا يرد عليك مباشرة عبر واتساب.", buttonText: "راسلنا" } };
  }
}

export interface ThemePreset {
  key: string;
  label: string;
  description: string;
  build: () => ThemeConfig;
}

const withSections = (types: SectionType[]) => types.map((t, i) => defaultSection(t, `sec${i}${t.replace(/_/g, "").slice(0, 10)}`));

export const PRESETS: ThemePreset[] = [
  {
    key: "classic",
    label: "كلاسيك",
    description: "متوازن ومناسب لكل الأنشطة",
    build: () =>
      themeSchema.parse({
        preset: "classic",
        colors: { primary: "#0f766e", background: "#ffffff", surface: "#f6f7f9", text: "#111827", muted: "#6b7280" },
        font: "ibm-plex",
        radius: "md",
        sections: withSections(["announcement", "hero", "categories", "products", "features", "reviews"]),
      }),
  },
  {
    key: "luxe",
    label: "فخم",
    description: "للعطور والتجميل: داكن وأنيق",
    build: () =>
      themeSchema.parse({
        preset: "luxe",
        colors: { primary: "#b08d57", background: "#0f0f10", surface: "#1a1a1c", text: "#f5f1ea", muted: "#a8a29e" },
        font: "tajawal",
        radius: "sm",
        productCard: { aspect: "portrait", style: "plain" },
        sections: withSections(["hero", "products", "image_text", "reviews", "whatsapp_cta"]),
      }),
  },
  {
    key: "bold",
    label: "جريء",
    description: "للأزياء والشباب: ألوان قوية وزوايا دائرية",
    build: () =>
      themeSchema.parse({
        preset: "bold",
        colors: { primary: "#e11d48", background: "#ffffff", surface: "#fff1f2", text: "#111111", muted: "#6b7280" },
        font: "cairo",
        radius: "lg",
        productCard: { aspect: "portrait", style: "card" },
        sections: withSections(["announcement", "hero", "categories", "products", "faq"]),
      }),
  },
  {
    key: "fresh",
    label: "طبيعي",
    description: "للأغذية والمنتجات المنزلية: ألوان هادئة",
    build: () =>
      themeSchema.parse({
        preset: "fresh",
        colors: { primary: "#4d7c0f", background: "#fbfaf5", surface: "#f1efe4", text: "#1c1917", muted: "#78716c" },
        font: "almarai",
        radius: "full",
        productCard: { aspect: "square", style: "card" },
        sections: withSections(["hero", "features", "categories", "products", "rich_text", "whatsapp_cta"]),
      }),
  },
];

export const defaultTheme = (brandColor?: string): ThemeConfig => {
  const t = PRESETS[0].build();
  if (brandColor && /^#[0-9a-fA-F]{6}$/.test(brandColor)) t.colors.primary = brandColor;
  return t;
};

/** Parses stored JSON, falling back to the default theme (never throws). */
export function readTheme(raw: unknown, brandColor?: string): ThemeConfig {
  if (!raw || typeof raw !== "object" || !("sections" in raw)) return defaultTheme(brandColor);
  const parsed = themeSchema.safeParse(raw);
  return parsed.success ? parsed.data : defaultTheme(brandColor);
}

// --- Color helpers (WCAG relative luminance) ---

function luminance(hexColor: string): number {
  const n = parseInt(hexColor.slice(1), 16);
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

export function contrastRatio(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

/** Text color to put on top of `bg`: whichever of white / near-black contrasts more. */
export function onColor(bg: string): string {
  return contrastRatio(bg, "#ffffff") >= contrastRatio(bg, "#111111") ? "#ffffff" : "#111111";
}

/** CSS custom properties that skin the storefront. */
export function themeCssVars(t: ThemeConfig): Record<string, string> {
  return {
    "--store": t.colors.primary,
    "--on-store": onColor(t.colors.primary),
    "--radius": RADII[t.radius],
    "--radius-btn": BUTTON_RADII[t.radius],
    "--color-surface": t.colors.background,
    "--color-canvas": t.colors.background,
    "--color-muted": t.colors.surface,
    "--color-ink": t.colors.text,
    "--color-ink-soft": t.colors.muted,
    "--color-ink-faint": t.colors.muted,
    "--color-line": `color-mix(in srgb, ${t.colors.text} 12%, transparent)`,
    "--font-store": `${FONTS[t.font].family}, system-ui, sans-serif`,
  };
}

export function contrastWarnings(t: ThemeConfig): string[] {
  const w: string[] = [];
  if (contrastRatio(t.colors.text, t.colors.background) < 4.5) w.push("لون النص على الخلفية ضعيف الوضوح (أقل من 4.5:1).");
  if (contrastRatio(t.colors.muted, t.colors.background) < 3) w.push("اللون الثانوي باهت جداً على الخلفية.");
  if (contrastRatio(t.colors.primary, t.colors.background) < 1.6) w.push("اللون الأساسي قريب جداً من لون الخلفية؛ قد لا تظهر الأزرار بوضوح.");
  return w;
}
