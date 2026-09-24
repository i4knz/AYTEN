import { sql } from "drizzle-orm";
import { getDb, type Tx } from "./client";

export interface TenantContext {
  storeId?: string | null;
  userId?: string | null;
}

/**
 * Runs `fn` in a transaction with the tenant context applied to the database
 * session. Row-level security policies read these settings, so rows of other
 * stores are invisible even if a query forgets its `store_id` filter.
 *
 * The settings are transaction-local (`set_config(..., true)`), so they can
 * never leak to another request through a pooled connection.
 */
export async function withTenant<T>(ctx: TenantContext, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return getDb().transaction(async (tx) => {
    await tx.execute(
      sql`select set_config('app.store_id', ${ctx.storeId ?? ""}, true), set_config('app.user_id', ${ctx.userId ?? ""}, true)`,
    );
    return fn(tx);
  });
}
