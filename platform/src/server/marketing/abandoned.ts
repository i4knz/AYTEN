import { and, desc, eq, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { audit, type RequestMeta } from "../audit";
import { loadCartLines } from "../commerce/cart";
import { carts, stores } from "../db/schema";
import { getDb } from "../db/client";
import { withTenant } from "../db/tenant";
import { getEmailProvider } from "../email";
import { abandonedCartMessage } from "../email/templates";
import { AppError, notFound } from "../lib/errors";
import { isUuid } from "../lib/ids";
import { formatMoney } from "../lib/money";
import { requireStoreAccess } from "../stores/service";
import { storefrontUrl } from "../urls";

/** Carts where the shopper reached checkout, left contact details, and did not order within an hour. */
export async function listAbandonedCarts(userId: string, storeId: string) {
  await requireStoreAccess(userId, storeId, "marketing.write");
  return withTenant({ storeId, userId }, async (tx) => {
    const rows = await tx
      .select()
      .from(carts)
      .where(
        and(
          isNull(carts.convertedOrderId),
          isNotNull(carts.contactPhone),
          lt(carts.checkoutStartedAt, sql`now() - interval '1 hour'`),
          sql`${carts.checkoutStartedAt} > now() - interval '30 days'`,
        ),
      )
      .orderBy(desc(carts.checkoutStartedAt))
      .limit(100);
    const result = [];
    for (const cart of rows) {
      const lines = await loadCartLines(tx, cart.id);
      if (!lines.length) continue;
      result.push({
        id: cart.id,
        name: cart.contactName,
        phone: cart.contactPhone!,
        email: cart.contactEmail,
        updatedAt: cart.checkoutStartedAt!,
        remindedAt: cart.remindedAt,
        items: lines.map((l) => ({ name: l.productName, quantity: l.quantity, slug: l.productSlug })),
        value: lines.reduce((a, l) => a + l.unitPrice * l.quantity, 0),
      });
    }
    const recovered = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(carts)
      .where(and(isNotNull(carts.remindedAt), isNotNull(carts.convertedOrderId), sql`${carts.remindedAt} > now() - interval '30 days'`));
    return { carts: result, recovered: recovered[0].n };
  });
}

export async function markCartReminded(userId: string, storeId: string, cartId: string, via: "whatsapp" | "email", meta: RequestMeta = {}) {
  await requireStoreAccess(userId, storeId, "marketing.write");
  if (!isUuid(cartId)) throw notFound();
  const cart = await withTenant({ storeId, userId }, async (tx) => {
    const [row] = await tx.update(carts).set({ remindedAt: sql`now()` }).where(and(eq(carts.id, cartId), isNull(carts.convertedOrderId))).returning();
    if (!row) throw notFound();
    await audit({ storeId, actorId: userId, action: "cart.reminded", targetType: "cart", targetId: cartId, metadata: { via }, meta }, tx);
    return row;
  });
  if (via === "email") {
    if (!cart.contactEmail) throw new AppError("validation", "لا يوجد بريد إلكتروني لهذه السلة.");
    const [store] = await getDb().select().from(stores).where(eq(stores.id, storeId)).limit(1);
    const lines = await withTenant({ storeId }, (tx) => loadCartLines(tx, cartId));
    await getEmailProvider().send(
      abandonedCartMessage(cart.contactEmail, cart.contactName ?? "", store.name, lines.map((l) => l.productName), formatMoney(lines.reduce((a, l) => a + l.unitPrice * l.quantity, 0)), storefrontUrl(store.slug)),
    );
  }
}
