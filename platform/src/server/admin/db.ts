import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import type { Db, Tx } from "../db/client";
import { auditLogs } from "../db/schema";
import * as schema from "../db/schema";
import type { RequestMeta } from "../audit";
import { uuidv7 } from "../lib/ids";

// The platform admin panel connects as ayten_admin, a role that may read
// across stores (BYPASSRLS) but has only narrow write grants (see
// 0006_platform.sql). Only code in src/server/admin uses it, and only after
// requireAdmin() has checked the signed-in user.
const globalForAdmin = globalThis as unknown as { __aytenAdminPool?: Pool; __aytenAdminDb?: Db };

export function getAdminDb(): Db {
  if (!globalForAdmin.__aytenAdminDb) {
    const connectionString = process.env.ADMIN_DATABASE_URL;
    if (!connectionString) throw new Error("ADMIN_DATABASE_URL is not set");
    globalForAdmin.__aytenAdminPool = new Pool({ connectionString, max: Number(process.env.ADMIN_DATABASE_POOL_MAX ?? 3) });
    globalForAdmin.__aytenAdminDb = drizzle(globalForAdmin.__aytenAdminPool, { schema });
  }
  return globalForAdmin.__aytenAdminDb;
}

export async function closeAdminDb() {
  await globalForAdmin.__aytenAdminPool?.end();
  globalForAdmin.__aytenAdminPool = undefined;
  globalForAdmin.__aytenAdminDb = undefined;
}

export function adminTx<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return getAdminDb().transaction(fn);
}

/** Every admin write is recorded, in the same transaction, as a platform_admin action. */
export async function adminAudit(
  tx: Tx,
  entry: { adminId: string; action: string; storeId?: string | null; targetType?: string; targetId?: string; reason?: string; metadata?: Record<string, unknown>; meta?: RequestMeta },
) {
  await tx.insert(auditLogs).values({
    id: uuidv7(),
    storeId: entry.storeId ?? null,
    actorType: "platform_admin",
    actorId: entry.adminId,
    action: entry.action,
    targetType: entry.targetType,
    targetId: entry.targetId,
    reason: entry.reason,
    ip: entry.meta?.ip ?? null,
    userAgent: entry.meta?.userAgent?.slice(0, 500) ?? null,
    metadata: entry.metadata ?? {},
  });
}
