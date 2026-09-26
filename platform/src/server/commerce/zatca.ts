// ZATCA e-invoicing Phase 1 ("generation") QR payload for simplified tax
// invoices: TLV (tag, length, UTF-8 value) for seller name, VAT number,
// timestamp, total including VAT and VAT amount, base64-encoded.
// Phase 2 ("integration": cryptographic stamp, XML, reporting to ZATCA) is
// NOT implemented and requires onboarding with ZATCA. [Verify obligations
// with an accountant before issuing tax invoices.]

function tlv(tag: number, value: string): Buffer {
  const bytes = Buffer.from(value, "utf8");
  if (bytes.length > 255) throw new Error(`TLV value too long for tag ${tag}`);
  return Buffer.concat([Buffer.from([tag, bytes.length]), bytes]);
}

export function zatcaQrPayload(input: { sellerName: string; vatNumber: string; timestamp: Date; total: number; vat: number }): string {
  const amount = (minor: number) => (minor / 100).toFixed(2);
  return Buffer.concat([
    tlv(1, input.sellerName),
    tlv(2, input.vatNumber),
    tlv(3, input.timestamp.toISOString().replace(/\.\d{3}Z$/, "Z")),
    tlv(4, amount(input.total)),
    tlv(5, amount(input.vat)),
  ]).toString("base64");
}

export function decodeTlv(base64: string): Record<number, string> {
  const buf = Buffer.from(base64, "base64");
  const out: Record<number, string> = {};
  for (let i = 0; i < buf.length; ) {
    const tag = buf[i];
    const len = buf[i + 1];
    out[tag] = buf.subarray(i + 2, i + 2 + len).toString("utf8");
    i += 2 + len;
  }
  return out;
}

export const VAT_NUMBER_PATTERN = /^3\d{13}3$/;
