import { and, eq } from "drizzle-orm";
import { orders, payments, stores } from "../db/schema";
import { getDb } from "../db/client";
import { withTenant } from "../db/tenant";
import { isUuid } from "../lib/ids";
import { storefrontUrl } from "../urls";
import { verifyTestSignature } from "./gateway";

/** Resolves a signed test-gateway reference ("<storeId>.<providerPaymentId>") to the payment and order. */
export async function resolveTestPayment(ref: string, sig: string) {
  if (!/^[0-9a-f-]{36}\.tst_[0-9a-f]{24}$/.test(ref) || !/^[0-9a-f]{64}$/.test(sig) || !verifyTestSignature(ref, sig)) return null;
  const [storeId, providerPaymentId] = ref.split(".");
  if (!isUuid(storeId)) return null;
  const [store] = await getDb().select({ name: stores.name, slug: stores.slug }).from(stores).where(eq(stores.id, storeId)).limit(1);
  if (!store) return null;
  return withTenant({ storeId }, async (tx) => {
    const [row] = await tx
      .select({ payment: payments, number: orders.number, accessKey: orders.accessKey })
      .from(payments)
      .innerJoin(orders, eq(orders.id, payments.orderId))
      .where(and(eq(payments.provider, "test"), eq(payments.providerPaymentId, providerPaymentId)))
      .limit(1);
    if (!row) return null;
    return {
      storeId,
      storeName: store.name,
      providerPaymentId,
      payment: row.payment,
      returnUrl: `${storefrontUrl(store.slug)}/orders/${row.number}?key=${row.accessKey}`,
    };
  });
}
