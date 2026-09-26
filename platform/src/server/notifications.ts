import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type { Tx } from "./db/client";
import { notifications } from "./db/schema";
import { withTenant } from "./db/tenant";
import { uuidv7 } from "./lib/ids";
import { requireStoreAccess } from "./stores/service";

export async function notify(tx: Tx, storeId: string, n: { type: string; title: string; body?: string; link?: string }) {
  await tx.insert(notifications).values({ id: uuidv7(), storeId, type: n.type, title: n.title, body: n.body ?? "", link: n.link });
}

export async function listNotifications(userId: string, storeId: string) {
  await requireStoreAccess(userId, storeId);
  return withTenant({ storeId, userId }, async (tx) => {
    const items = await tx.select().from(notifications).orderBy(desc(notifications.createdAt)).limit(30);
    const [{ unread }] = await tx.select({ unread: sql<number>`count(*)::int` }).from(notifications).where(isNull(notifications.readAt));
    return { items, unread };
  });
}

export async function markNotificationsRead(userId: string, storeId: string) {
  await requireStoreAccess(userId, storeId);
  await withTenant({ storeId, userId }, (tx) =>
    tx.update(notifications).set({ readAt: sql`now()` }).where(and(eq(notifications.storeId, storeId), isNull(notifications.readAt))),
  );
}
