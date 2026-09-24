// Money is stored as integers in the smallest currency unit (halalas for SAR,
// 1 SAR = 100 halalas). These helpers are the only place that converts.

const MINOR_UNITS: Record<string, number> = { SAR: 2, AED: 2, KWD: 3, BHD: 3, OMR: 3, QAR: 2, EGP: 2, USD: 2 };
export const MAX_AMOUNT_MAJOR = 10_000_000;

const toLatinDigits = (s: string) =>
  s.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));

/**
 * Parses a merchant-typed amount ("99", "99.5", "٩٩٫٥٠", "1,250.00") into
 * minor units. Returns null for empty input, NaN for invalid input.
 */
export function parseMoney(input: string, currency = "SAR"): number | null {
  const digits = MINOR_UNITS[currency] ?? 2;
  const s = toLatinDigits(input.trim()).replace(/[٬,\s]/g, "").replace("٫", ".");
  if (s === "") return null;
  const m = s.match(new RegExp(`^(\\d{1,9})(?:\\.(\\d{1,${digits}}))?$`));
  if (!m) return Number.NaN;
  const major = Number(m[1]);
  if (major > MAX_AMOUNT_MAJOR) return Number.NaN;
  return major * 10 ** digits + Number((m[2] ?? "").padEnd(digits, "0") || 0);
}

/** Minor units → plain decimal string for form inputs, e.g. 9950 → "99.50". */
export function toMajorString(minor: number | null | undefined, currency = "SAR"): string {
  if (minor == null) return "";
  const digits = MINOR_UNITS[currency] ?? 2;
  return (minor / 10 ** digits).toFixed(digits);
}

/** Display format for shoppers and merchants, e.g. "99.50 ر.س". Latin digits for readability of prices. */
export function formatMoney(minor: number, currency = "SAR"): string {
  const digits = MINOR_UNITS[currency] ?? 2;
  const value = minor / 10 ** digits;
  const hasFraction = minor % 10 ** digits !== 0;
  const formatted = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: hasFraction ? digits : 0,
    maximumFractionDigits: digits,
  }).format(value);
  const symbol = currency === "SAR" ? "ر.س" : currency;
  return `${formatted} ${symbol}`;
}
