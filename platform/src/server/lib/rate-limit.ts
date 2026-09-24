import { sql } from "drizzle-orm";
import { getDb } from "../db/client";

export interface RateLimitRule {
  limit: number;
  windowSeconds: number;
}

export const RATE_LIMITS = {
  loginPerEmail: { limit: 5, windowSeconds: 15 * 60 },
  loginPerIp: { limit: 30, windowSeconds: 15 * 60 },
  registerPerIp: { limit: 10, windowSeconds: 60 * 60 },
  resetPerEmail: { limit: 3, windowSeconds: 60 * 60 },
  resetPerIp: { limit: 10, windowSeconds: 60 * 60 },
  verifyResendPerUser: { limit: 3, windowSeconds: 60 * 60 },
  storeCreatePerUser: { limit: 5, windowSeconds: 24 * 60 * 60 },
} satisfies Record<string, RateLimitRule>;

/**
 * RATE_LIMIT_SCALE multiplies every limit (default 1). Use it for automated
 * test environments, or temporarily when many real users share one IP
 * (e.g. an onboarding workshop). Never below 1.
 */
function scaled(rule: RateLimitRule): number {
  const scale = Number(process.env.RATE_LIMIT_SCALE ?? 1);
  return Math.max(1, Math.floor(rule.limit * (Number.isFinite(scale) && scale >= 1 ? scale : 1)));
}

/**
 * Atomically counts one hit in a fixed window and reports whether it is
 * within the limit. A single upsert, so concurrent requests cannot both
 * slip under the limit.
 */
export async function consume(key: string, rule: RateLimitRule): Promise<boolean> {
  const result = await getDb().execute<{ count: number }>(sql`
    insert into rate_limit_buckets (key, window_start, count)
    values (${key}, now(), 1)
    on conflict (key) do update set
      count = case when rate_limit_buckets.window_start < now() - make_interval(secs => ${rule.windowSeconds})
                   then 1 else rate_limit_buckets.count + 1 end,
      window_start = case when rate_limit_buckets.window_start < now() - make_interval(secs => ${rule.windowSeconds})
                   then now() else rate_limit_buckets.window_start end
    returning count`);
  return Number(result.rows[0].count) <= scaled(rule);
}

/** Whether the key is already at or over its limit, without counting a hit. */
export async function isLimited(key: string, rule: RateLimitRule): Promise<boolean> {
  const result = await getDb().execute<{ count: number }>(sql`
    select count from rate_limit_buckets
    where key = ${key} and window_start >= now() - make_interval(secs => ${rule.windowSeconds})`);
  return result.rows.length > 0 && Number(result.rows[0].count) >= scaled(rule);
}

export async function resetLimit(key: string): Promise<void> {
  await getDb().execute(sql`delete from rate_limit_buckets where key = ${key}`);
}
