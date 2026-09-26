import { randomInt } from "node:crypto";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "../db/client";
import { referralRewards, stores, users } from "../db/schema";
import { isUniqueViolation } from "../lib/errors";

// No 0/O or 1/I so codes survive being read aloud or typed from a screenshot.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateReferralCode(length = 8): string {
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

export function normalizeReferralCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const code = value.trim().toUpperCase();
  return /^[A-Z0-9]{6,12}$/.test(code) ? code : null;
}

/** The user's referral code, created on first use. */
export async function ensureReferralCode(userId: string): Promise<string> {
  const [user] = await getDb().select({ code: users.referralCode }).from(users).where(eq(users.id, userId)).limit(1);
  if (user?.code) return user.code;
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateReferralCode();
    try {
      const [row] = await getDb()
        .update(users)
        .set({ referralCode: code })
        .where(and(eq(users.id, userId), isNull(users.referralCode)))
        .returning({ code: users.referralCode });
      if (row?.code) return row.code;
      const [again] = await getDb().select({ code: users.referralCode }).from(users).where(eq(users.id, userId)).limit(1);
      if (again?.code) return again.code;
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
    }
  }
  throw new Error("Could not allocate a referral code");
}

/** Links a newly registered user to the owner of `code`. Unknown codes are ignored. */
export async function attachReferrer(userId: string, code: string | null) {
  if (!code) return;
  const [referrer] = await getDb().select({ id: users.id }).from(users).where(eq(users.referralCode, code)).limit(1);
  if (!referrer || referrer.id === userId) return;
  await getDb().update(users).set({ referredBy: referrer.id }).where(and(eq(users.id, userId), isNull(users.referredBy)));
}

export async function getReferralDashboard(userId: string) {
  const code = await ensureReferralCode(userId);
  const db = getDb();
  const [referred, rewards] = await Promise.all([
    db
      .select({
        id: users.id,
        name: users.name,
        createdAt: users.createdAt,
        stores: sql<number>`(select count(*)::int from ${stores} where owner_user_id = users.id)`,
        rewarded: sql<boolean>`exists (select 1 from ${referralRewards} r where r.referred_user_id = users.id)`,
      })
      .from(users)
      .where(eq(users.referredBy, userId))
      .orderBy(desc(users.createdAt))
      .limit(100),
    db.select().from(referralRewards).where(eq(referralRewards.referrerId, userId)).orderBy(asc(referralRewards.createdAt)),
  ]);
  return { code, referred, rewards };
}

/** First name only, so a referrer never sees the full identity of people they invited. */
export function maskName(name: string): string {
  const first = name.trim().split(/\s+/)[0] ?? "";
  return first.length > 1 ? `${first.slice(0, 1)}${"•".repeat(Math.min(first.length - 1, 4))}` : first;
}
