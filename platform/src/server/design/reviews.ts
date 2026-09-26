import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { audit, type RequestMeta } from "../audit";
import { orderItems, orders, products, reviews } from "../db/schema";
import { withTenant } from "../db/tenant";
import { AppError, isUniqueViolation, notFound } from "../lib/errors";
import { isUuid, uuidv7 } from "../lib/ids";
import { notify } from "../notifications";
import { requireStoreAccess } from "../stores/service";

const reviewSchema = z.object({
  productId: z.uuid(),
  rating: z.coerce.number().int().min(1, { error: "اختر التقييم." }).max(5),
  body: z.string().trim().max(2000).default(""),
});

/**
 * A shopper reviews a product from their own order page. Authorization is the
 * order's access key, and the order must be delivered and contain the product,
 * so every review is from a verified buyer. One review per product per order.
 */
export async function submitReview(storeId: string, orderNumber: number, accessKey: string, input: unknown) {
  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) throw new AppError("validation", parsed.error.issues[0].message);
  const { productId, rating, body } = parsed.data;
  try {
    await withTenant({ storeId }, async (tx) => {
      const [order] = await tx
        .select()
        .from(orders)
        .where(and(eq(orders.number, orderNumber), eq(orders.accessKey, accessKey)))
        .limit(1);
      if (!order) throw notFound();
      if (!["delivered"].includes(order.fulfillmentStatus)) throw new AppError("not_eligible", "يمكنك التقييم بعد استلام الطلب.");
      const [item] = await tx.select().from(orderItems).where(and(eq(orderItems.orderId, order.id), eq(orderItems.productId, productId))).limit(1);
      if (!item) throw new AppError("not_eligible", "هذا المنتج ليس ضمن طلبك.");
      await tx.insert(reviews).values({
        id: uuidv7(),
        storeId,
        productId,
        orderId: order.id,
        customerId: order.customerId,
        // First name only, for privacy.
        authorName: order.customerSnapshot.name.split(/\s+/)[0].slice(0, 60) || "عميل",
        rating,
        body,
      });
      await notify(tx, storeId, { type: "review.created", title: `تقييم جديد (${rating}/5) بانتظار المراجعة`, body: item.productName, link: `/dashboard/${storeId}/reviews` });
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw new AppError("duplicate", "قيّمت هذا المنتج من قبل. شكراً لك!");
    throw err;
  }
}

export async function reviewedProductIds(storeId: string, orderId: string) {
  return withTenant({ storeId }, async (tx) =>
    (await tx.select({ productId: reviews.productId }).from(reviews).where(eq(reviews.orderId, orderId))).map((r) => r.productId),
  );
}

export async function listReviews(userId: string, storeId: string, status: "pending" | "approved" | "rejected" | "all" = "pending") {
  await requireStoreAccess(userId, storeId, "products.read");
  return withTenant({ storeId, userId }, async (tx) => {
    const rows = await tx
      .select({ review: reviews, productName: products.name })
      .from(reviews)
      .innerJoin(products, eq(products.id, reviews.productId))
      .where(status === "all" ? undefined : eq(reviews.status, status))
      .orderBy(desc(reviews.createdAt))
      .limit(200);
    const [counts] = await tx
      .select({
        pending: sql<number>`count(*) filter (where status = 'pending')::int`,
        approved: sql<number>`count(*) filter (where status = 'approved')::int`,
        average: sql<string | null>`round(avg(rating) filter (where status = 'approved'), 2)`,
      })
      .from(reviews);
    return { rows, counts: { ...counts, average: counts.average === null ? null : Number(counts.average) } };
  });
}

export async function moderateReview(userId: string, storeId: string, reviewId: string, decision: { status?: "approved" | "rejected"; reply?: string }, meta: RequestMeta = {}) {
  await requireStoreAccess(userId, storeId, "products.write");
  if (!isUuid(reviewId)) throw notFound();
  await withTenant({ storeId, userId }, async (tx) => {
    const set: Partial<typeof reviews.$inferInsert> = {};
    if (decision.status) set.status = decision.status;
    if (decision.reply !== undefined) {
      const reply = decision.reply.trim().slice(0, 2000);
      set.reply = reply || null;
      set.repliedAt = reply ? new Date() : null;
    }
    const rows = await tx.update(reviews).set(set).where(eq(reviews.id, reviewId)).returning({ id: reviews.id });
    if (!rows.length) throw notFound();
    await audit({ storeId, actorId: userId, action: "review.moderated", targetType: "review", targetId: reviewId, metadata: { status: decision.status ?? null }, meta }, tx);
  });
}

export async function getProductReviews(storeId: string, productId: string) {
  return withTenant({ storeId }, async (tx) => {
    const rows = await tx
      .select({ authorName: reviews.authorName, rating: reviews.rating, body: reviews.body, reply: reviews.reply, createdAt: reviews.createdAt })
      .from(reviews)
      .where(and(eq(reviews.productId, productId), eq(reviews.status, "approved")))
      .orderBy(desc(reviews.createdAt))
      .limit(50);
    const count = rows.length;
    const average = count ? rows.reduce((a, r) => a + r.rating, 0) / count : null;
    return { rows, count, average };
  });
}
