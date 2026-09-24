import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { audit, type RequestMeta } from "../audit";
import { fieldErrors } from "../auth/schemas";
import { inventoryLevels, inventoryMovements, products, productVariants } from "../db/schema";
import { withTenant } from "../db/tenant";
import { AppError, notFound } from "../lib/errors";
import { isUuid, uuidv7 } from "../lib/ids";
import { requireStoreAccess } from "../stores/service";
import { inventoryAdjustSchema } from "./schemas";

export const variantTitle = (v: { option1: string | null; option2: string | null; option3: string | null }) =>
  [v.option1, v.option2, v.option3].filter(Boolean).join(" / ");

/**
 * Sets or adds stock for one variant. The change is a single conditional
 * UPDATE, so it is safe against concurrent orders: the row lock serializes
 * writers and the CHECK constraints keep on_hand ≥ reserved ≥ 0.
 */
export async function adjustInventory(userId: string, storeId: string, variantId: string, input: unknown, meta: RequestMeta = {}) {
  await requireStoreAccess(userId, storeId, "inventory.write");
  if (!isUuid(variantId)) throw notFound();
  const parsed = inventoryAdjustSchema.safeParse(input);
  if (!parsed.success) throw new AppError("validation", "راجع الحقول المظللة.", fieldErrors(parsed.error));
  const { mode, quantity, note } = parsed.data;
  if (mode === "set" && quantity < 0) throw new AppError("validation", "الكمية لا تقل عن صفر.", { quantity: "الكمية لا تقل عن صفر." });

  return withTenant({ storeId, userId }, async (tx) => {
    const [current] = await tx
      .select()
      .from(inventoryLevels)
      .where(eq(inventoryLevels.variantId, variantId))
      .for("update")
      .limit(1);
    if (!current) throw notFound();
    const target = mode === "set" ? quantity : current.onHand + quantity;
    if (target < 0) throw new AppError("validation", `الكمية الحالية ${current.onHand} فقط.`, { quantity: "الخصم أكبر من الكمية المتوفرة." });
    if (target < current.reserved) {
      throw new AppError("validation", `لا يمكن أن تقل الكمية عن ${current.reserved} لأنها محجوزة لطلبات قائمة.`, { quantity: "أقل من المحجوز." });
    }
    const delta = target - current.onHand;
    if (delta === 0 && current.trackInventory) return { onHand: target };
    await tx.update(inventoryLevels).set({ onHand: target, trackInventory: true }).where(eq(inventoryLevels.variantId, variantId));
    if (delta !== 0) {
      await tx.insert(inventoryMovements).values({
        id: uuidv7(),
        storeId,
        variantId,
        delta,
        onHandAfter: target,
        reason: "manual_adjust",
        actorUserId: userId,
        note,
      });
    }
    await audit(
      { storeId, actorId: userId, action: "inventory.adjusted", targetType: "variant", targetId: variantId, metadata: { delta, onHand: target }, meta },
      tx,
    );
    return { onHand: target };
  });
}

export async function listInventory(userId: string, storeId: string, { lowOnly = false } = {}) {
  await requireStoreAccess(userId, storeId, "products.read");
  return withTenant({ storeId, userId }, async (tx) => {
    const rows = await tx
      .select({
        variantId: productVariants.id,
        productId: products.id,
        productName: products.name,
        productStatus: products.status,
        option1: productVariants.option1,
        option2: productVariants.option2,
        option3: productVariants.option3,
        sku: productVariants.sku,
        trackInventory: inventoryLevels.trackInventory,
        onHand: inventoryLevels.onHand,
        reserved: inventoryLevels.reserved,
        lowStockThreshold: inventoryLevels.lowStockThreshold,
      })
      .from(productVariants)
      .innerJoin(products, eq(products.id, productVariants.productId))
      .innerJoin(inventoryLevels, eq(inventoryLevels.variantId, productVariants.id))
      .where(
        and(
          isNull(productVariants.archivedAt),
          sql`${products.status} <> 'archived'`,
          lowOnly
            ? sql`${inventoryLevels.trackInventory} and ${inventoryLevels.onHand} - ${inventoryLevels.reserved} <= coalesce(${inventoryLevels.lowStockThreshold}, ${DEFAULT_LOW_STOCK})`
            : undefined,
        ),
      )
      .orderBy(asc(products.name), asc(productVariants.position))
      .limit(500);
    return rows.map((r) => ({ ...r, title: variantTitle(r), available: r.onHand - r.reserved }));
  });
}

export const DEFAULT_LOW_STOCK = 3;

export async function listMovements(userId: string, storeId: string, variantId: string) {
  await requireStoreAccess(userId, storeId, "products.read");
  if (!isUuid(variantId)) throw notFound();
  return withTenant({ storeId, userId }, (tx) =>
    tx.select().from(inventoryMovements).where(eq(inventoryMovements.variantId, variantId)).orderBy(desc(inventoryMovements.createdAt)).limit(50),
  );
}

export async function countLowStock(userId: string, storeId: string) {
  return (await listInventory(userId, storeId, { lowOnly: true })).length;
}
