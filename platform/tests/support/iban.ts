/** Builds a valid Saudi IBAN (correct mod-97 check digits) from a 20-digit BBAN. */
export function saudiIban(bban = "80000000608010167519"): string {
  const numeric = (bban + "SA00").replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let remainder = 0;
  for (const ch of numeric) remainder = (remainder * 10 + Number(ch)) % 97;
  return `SA${String(98 - remainder).padStart(2, "0")}${bban}`;
}
