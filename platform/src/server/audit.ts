import { getDb, type Tx } from "./db/client";
import { auditLogs } from "./db/schema";
import { uuidv7 } from "./lib/ids";

export interface RequestMeta {
  ip?: string | null;
  userAgent?: string | null;
}

export interface AuditEntry {
  storeId?: string | null;
  actorType?: "user" | "platform_admin" | "system";
  actorId?: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
  meta?: RequestMeta;
}

/**
 * Appends an audit record. Pass `tx` to make the record part of the same
 * transaction as the change it describes (the store-scoped RLS policy then
 * requires that transaction's tenant context to match `storeId`).
 */
export async function audit(entry: AuditEntry, tx?: Tx): Promise<void> {
  await (tx ?? getDb()).insert(auditLogs).values({
    id: uuidv7(),
    storeId: entry.storeId ?? null,
    actorType: entry.actorType ?? "user",
    actorId: entry.actorId ?? null,
    action: entry.action,
    targetType: entry.targetType,
    targetId: entry.targetId,
    reason: entry.reason,
    ip: entry.meta?.ip ?? null,
    userAgent: entry.meta?.userAgent?.slice(0, 500) ?? null,
    metadata: entry.metadata ?? {},
  });
}
