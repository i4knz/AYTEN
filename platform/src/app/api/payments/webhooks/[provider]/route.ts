import { z } from "zod";
import { applyPaymentEvent } from "@/server/commerce/payments";
import { verifyTestSignature } from "@/server/payments/gateway";

const testEvent = z.object({
  id: z.string().min(4).max(100),
  type: z.enum(["payment.paid", "payment.failed"]),
  data: z.object({
    store_id: z.uuid(),
    payment_id: z.string().max(100),
    amount: z.number().int().nonnegative(),
    currency: z.string().length(3),
    failure_reason: z.string().max(300).optional(),
  }),
});

/**
 * Provider webhooks. The raw body is verified against the provider's
 * signature before anything is parsed or trusted. Processing is idempotent,
 * so provider retries are safe; we answer 200 for duplicates.
 */
export async function POST(request: Request, { params }: RouteContext<"/api/payments/webhooks/[provider]">) {
  const { provider } = await params;
  if (provider !== "test" || process.env.PAYMENT_GATEWAY !== "test") return new Response("Not Found", { status: 404 });
  const raw = await request.text();
  if (raw.length > 20_000) return new Response("Payload too large", { status: 413 });
  const signature = request.headers.get("x-signature") ?? "";
  if (!/^[0-9a-f]{64}$/.test(signature) || !verifyTestSignature(raw, signature)) return new Response("Invalid signature", { status: 401 });
  const parsed = testEvent.safeParse(JSON.parse(raw));
  if (!parsed.success) return new Response("Invalid payload", { status: 400 });
  const e = parsed.data;
  const result = await applyPaymentEvent({
    provider: "test",
    eventId: e.id,
    storeId: e.data.store_id,
    providerPaymentId: e.data.payment_id,
    status: e.type === "payment.paid" ? "paid" : "failed",
    amount: e.data.amount,
    currency: e.data.currency,
    failureReason: e.data.failure_reason,
  });
  return Response.json({ result });
}
