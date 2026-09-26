import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { orders, payments } from "../db/schema";
import { withTenant } from "../db/tenant";
import { AppError } from "../lib/errors";
import { uuidv7 } from "../lib/ids";

/**
 * A payment gateway takes the shopper to a hosted payment page and later
 * reports the result through a signed server-to-server notification. Card
 * data never touches the platform.
 *
 * Only the "test" gateway is implemented: it simulates a provider end to end
 * (hosted page, signed callback, retries) so checkout can be built and tested
 * before a provider contract exists. Real providers (Moyasar, Tap, HyperPay…)
 * implement the same interface once credentials and sandbox access are
 * available.
 */
export interface PaymentGateway {
  key: string;
  label: string;
  /** Creates a payment attempt for the order and returns the URL to send the shopper to. */
  startPayment(ref: { storeId: string; orderId: string }): Promise<string>;
}

function appUrl(path: string) {
  return new URL(path, process.env.APP_URL ?? "http://localhost:3000").toString();
}

export function testGatewaySecret(): string {
  const secret = process.env.PAYMENT_TEST_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_TEST_GATEWAY !== "1") {
    throw new Error("PAYMENT_TEST_SECRET is required for the test gateway in production");
  }
  return "dev-only-test-gateway-secret";
}

export function signTestPayload(payload: string): string {
  return createHmac("sha256", testGatewaySecret()).update(payload).digest("hex");
}

export function verifyTestSignature(payload: string, signature: string): boolean {
  const expected = Buffer.from(signTestPayload(payload), "hex");
  const given = Buffer.from(signature, "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

class TestGateway implements PaymentGateway {
  key = "test";
  label = "بوابة الدفع التجريبية";

  async startPayment({ storeId, orderId }: { storeId: string; orderId: string }) {
    const providerPaymentId = `tst_${randomBytes(12).toString("hex")}`;
    await withTenant({ storeId }, async (tx) => {
      const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).limit(1);
      if (!order || order.paymentMethod !== "online") throw new AppError("not_found", "الطلب غير موجود.");
      if (!["pending", "failed"].includes(order.paymentStatus) || order.status === "cancelled") {
        throw new AppError("invalid_state", "لا يمكن الدفع لهذا الطلب.");
      }
      // Reuse the pending attempt created at checkout, otherwise open a new one (retry after failure).
      const [pending] = await tx
        .select()
        .from(payments)
        .where(and(eq(payments.orderId, orderId), eq(payments.provider, this.key), inArray(payments.status, ["pending"])))
        .limit(1);
      if (pending) {
        await tx.update(payments).set({ providerPaymentId }).where(eq(payments.id, pending.id));
      } else {
        await tx.insert(payments).values({
          id: uuidv7(),
          storeId,
          orderId,
          provider: this.key,
          providerPaymentId,
          amount: order.total,
          currency: order.currency,
          status: "pending",
        });
      }
    });
    const ref = `${storeId}.${providerPaymentId}`;
    return appUrl(`/pay/test?ref=${encodeURIComponent(ref)}&sig=${signTestPayload(ref)}`);
  }
}

let gateway: PaymentGateway | undefined;

export function getPaymentGateway(): PaymentGateway {
  if (!gateway) {
    const key = process.env.PAYMENT_GATEWAY;
    if (key === "test") gateway = new TestGateway();
    else throw new AppError("payments_unavailable", "الدفع الإلكتروني غير متاح حالياً.");
  }
  return gateway;
}
