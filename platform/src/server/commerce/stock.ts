import { and, eq, sql } from "drizzle-orm";
import type { Tx } from "../db/client";
import { inventoryLevels, inventoryMovements, orderItems } from "../db/schema";
import { AppError } from "../lib/errors";
import { uuidv7 } from "../lib/ids";

// Order stock lifecycle, per order line:
//   none      → the variant does not track inventory (or it was deleted)
//   reserved  → counted in inventory_levels.reserved at order creation
//   committed → removed from on_hand when shipped
//   released  → reservation returned (cancel/payment failure) or stock returned after a committed line
// Each transition is guarded by the current stock_state, so repeating an
// action (double click, webhook retry) never moves stock twice.

/**
 * Reserves stock for one line with a single conditional UPDATE. Two
 * concurrent checkouts for the last unit cannot both succeed: the second
 * UPDATE re-evaluates the WHERE after the first commits and matches no row.
 * Returns whether the variant is tracked.
 */
export async function reserveStock(tx: Tx, variantId: string, quantity: number, productName: string): Promise<boolean> {
  const [level] = await tx.select({ track: inventoryLevels.trackInventory }).from(inventoryLevels).where(eq(inventoryLevels.variantId, variantId)).limit(1);
  if (!level || !level.track) return false;
  const updated = await tx
    .update(inventoryLevels)
    .set({ reserved: sql`${inventoryLevels.reserved} + ${quantity}` })
    .where(and(eq(inventoryLevels.variantId, variantId), sql`${inventoryLevels.onHand} - ${inventoryLevels.reserved} >= ${quantity}`))
    .returning({ variantId: inventoryLevels.variantId });
  if (!updated.length) {
    throw new AppError("out_of_stock", `الكمية المطلوبة من «${productName}» لم تعد متوفرة. حدّث سلتك وحاول مرة أخرى.`);
  }
  return true;
}

type LineRef = { id: string; variantId: string | null; quantity: number; stockState: string };

/** Shipped: reserved → committed (leaves the warehouse). */
export async function commitOrderStock(tx: Tx, storeId: string, orderId: string, lines: LineRef[], actorUserId: string | null) {
  for (const line of lines) {
    if (line.stockState !== "reserved" || !line.variantId) continue;
    const [level] = await tx
      .update(inventoryLevels)
      .set({
        onHand: sql`${inventoryLevels.onHand} - ${line.quantity}`,
        reserved: sql`greatest(${inventoryLevels.reserved} - ${line.quantity}, 0)`,
      })
      .where(eq(inventoryLevels.variantId, line.variantId))
      .returning({ onHand: inventoryLevels.onHand });
    await tx.update(orderItems).set({ stockState: "committed" }).where(eq(orderItems.id, line.id));
    if (level) {
      await tx.insert(inventoryMovements).values({
        id: uuidv7(),
        storeId,
        variantId: line.variantId,
        delta: -line.quantity,
        onHandAfter: level.onHand,
        reason: "order_committed",
        orderId,
        actorUserId,
      });
    }
  }
}

/**
 * Cancellation / failed payment: returns stock. Reserved lines just drop the
 * reservation. Committed lines (already shipped) go back on the shelf only
 * when `restockCommitted` is true, i.e. the goods actually came back.
 */
export async function releaseOrderStock(
  tx: Tx,
  storeId: string,
  orderId: string,
  lines: LineRef[],
  opts: { restockCommitted: boolean; actorUserId: string | null },
) {
  for (const line of lines) {
    if (!line.variantId) continue;
    if (line.stockState === "reserved") {
      await tx
        .update(inventoryLevels)
        .set({ reserved: sql`greatest(${inventoryLevels.reserved} - ${line.quantity}, 0)` })
        .where(eq(inventoryLevels.variantId, line.variantId));
      await tx.update(orderItems).set({ stockState: "released" }).where(eq(orderItems.id, line.id));
    } else if (line.stockState === "committed" && opts.restockCommitted) {
      const [level] = await tx
        .update(inventoryLevels)
        .set({ onHand: sql`${inventoryLevels.onHand} + ${line.quantity}` })
        .where(eq(inventoryLevels.variantId, line.variantId))
        .returning({ onHand: inventoryLevels.onHand });
      await tx.update(orderItems).set({ stockState: "released" }).where(eq(orderItems.id, line.id));
      if (level) {
        await tx.insert(inventoryMovements).values({
          id: uuidv7(),
          storeId,
          variantId: line.variantId,
          delta: line.quantity,
          onHandAfter: level.onHand,
          reason: "return_restock",
          orderId,
          actorUserId: opts.actorUserId,
        });
      }
    }
  }
}
