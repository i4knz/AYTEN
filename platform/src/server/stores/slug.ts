// Store slugs become subdomains (<slug>.<root domain>), so they follow DNS
// label rules: lowercase latin letters, digits and single hyphens, 3–40 chars.
// Keep SLUG_PATTERN identical to the CHECK constraint on stores.slug.
export const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){2,39}$/;

// Hostnames the platform needs for itself, plus names likely to be used for
// phishing or confused with the platform. Extend as needed.
export const RESERVED_SLUGS = new Set([
  "www", "app", "admin", "api", "cdn", "static", "assets", "img", "images", "media", "files",
  "mail", "email", "smtp", "imap", "pop", "mx", "ns", "ns1", "ns2", "dns",
  "help", "support", "docs", "blog", "status", "about", "pricing", "careers", "jobs", "legal",
  "terms", "privacy", "security", "billing", "pay", "payment", "payments", "checkout", "cart",
  "account", "accounts", "login", "logout", "signin", "signup", "register", "auth", "oauth", "sso",
  "dashboard", "panel", "console", "store", "stores", "shop", "shops", "merchant", "merchants",
  "partner", "partners", "dev", "developer", "developers", "staging", "test", "demo", "sandbox",
  "internal", "system", "root", "official", "team", "staff", "ayten", "platform",
  "google", "apple", "meta", "facebook", "instagram", "tiktok", "snapchat", "whatsapp", "twitter",
  "salla", "zid", "shopify", "amazon", "noon", "mada", "stcpay", "tabby", "tamara",
]);

export function slugProblem(slug: string): string | null {
  if (slug.length < 3) return "الرابط يجب أن يكون 3 أحرف على الأقل.";
  if (slug.length > 40) return "الرابط يجب ألا يزيد على 40 حرفاً.";
  if (!SLUG_PATTERN.test(slug)) {
    return "استخدم أحرفاً إنجليزية صغيرة وأرقاماً وشرطة (-) بين الكلمات فقط.";
  }
  if (RESERVED_SLUGS.has(slug)) return "هذا الرابط محجوز. اختر رابطاً آخر.";
  return null;
}

// Simple Arabic → Latin transliteration, only used to suggest a slug the
// merchant can edit. It is not meant to be a linguistic standard.
const AR_TO_LATIN: Record<string, string> = {
  ا: "a", أ: "a", إ: "e", آ: "a", ٱ: "a", ء: "", ؤ: "o", ئ: "e", ب: "b", ت: "t", ث: "th", ج: "j",
  ح: "h", خ: "kh", د: "d", ذ: "th", ر: "r", ز: "z", س: "s", ش: "sh", ص: "s", ض: "d", ط: "t",
  ظ: "z", ع: "a", غ: "gh", ف: "f", ق: "q", ك: "k", ل: "l", م: "m", ن: "n", ه: "h", ة: "a",
  و: "w", ي: "y", ى: "a", "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4", "٥": "5", "٦": "6",
  "٧": "7", "٨": "8", "٩": "9",
};

export function suggestSlug(name: string): string {
  const stripped = name
    .normalize("NFKD")
    .replace(/[ً-ٰٟـ]/g, "") // Arabic diacritics and tatweel
    .replace(/^ال(?=\S)/, "") // leading definite article
    .replace(/\s+ال(?=\S)/g, " ");
  const latin = Array.from(stripped)
    .map((ch) => AR_TO_LATIN[ch] ?? ch)
    .join("")
    .toLowerCase()
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  if (latin.length >= 3 && !RESERVED_SLUGS.has(latin)) return latin;
  if (latin.length >= 3) return `${latin.slice(0, 34)}-store`;
  return latin ? `${latin}-store` : "my-store";
}
