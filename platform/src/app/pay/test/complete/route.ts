import { randomBytes } from "node:crypto";
import { applyPaymentEvent } from "@/server/commerce/payments";
import { resolveTestPayment } from "@/server/payments/test-flow";

// The test provider "decides" the outcome and notifies us, exactly like a
// real provider's server-to-server callback would, then sends the shopper back.
export async function POST(request: Request) {
  if (process.env.PAYMENT_GATEWAY !== "test") return new Response("Not Found", { status: 404 });
  const form = await request.formData();
  const data = await resolveTestPayment(String(form.get("ref") ?? ""), String(form.get("sig") ?? ""));
  if (!data) return new Response("Invalid payment reference", { status: 400 });
  const outcome = form.get("outcome") === "paid" ? "paid" : "failed";
  await applyPaymentEvent({
    provider: "test",
    eventId: `evt_${randomBytes(12).toString("hex")}`,
    storeId: data.storeId,
    providerPaymentId: data.providerPaymentId,
    status: outcome,
    amount: data.payment.amount,
    currency: data.payment.currency,
    failureReason: outcome === "failed" ? "رفض البنك المُصدر للبطاقة (محاكاة)" : undefined,
  });
  return Response.redirect(data.returnUrl, 303);
}
