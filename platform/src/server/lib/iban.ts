/** Removes spaces and upper-cases, so "sa03 8000 ..." is accepted as typed on a bank card. */
export function normalizeIban(value: string): string {
  return value.replace(/[\s-]/g, "").toUpperCase();
}

/** Saudi IBAN: "SA" + 2 check digits + 20 characters (all digits in practice), validated with ISO 13616 mod-97. */
export function isValidSaudiIban(raw: string): boolean {
  const iban = normalizeIban(raw);
  if (!/^SA\d{22}$/.test(iban)) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  const digits = rearranged.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let remainder = 0;
  for (const ch of digits) remainder = (remainder * 10 + Number(ch)) % 97;
  return remainder === 1;
}

export function maskIban(iban: string): string {
  return iban.length > 8 ? `${iban.slice(0, 4)} •••• ${iban.slice(-4)}` : iban;
}
