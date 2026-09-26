import { inArray } from "drizzle-orm";
import { getDb, type Db, type Tx } from "../db/client";
import { platformSettings } from "../db/schema";

export interface FeeSettings {
  /** Platform fee on online payments, in basis points (250 = 2.5%). */
  onlinePaymentFeeBps: number;
  /** Days before an online sale becomes withdrawable. */
  payoutHoldDays: number;
  /** Minimum payout request, in halalas. */
  minPayout: number;
}

export interface BillingSettings {
  bankName: string;
  accountName: string;
  iban: string;
  vatBps: number;
  vatNumber: string;
  /** Days after a paid period ends before the store stops taking orders. */
  graceDays: number;
}

export interface SupportSettings {
  email: string;
  whatsapp: string;
}

export interface ReferralSettings {
  rewardDays: number;
}

export interface PlatformSettings {
  fees: FeeSettings;
  billing: BillingSettings;
  support: SupportSettings;
  referrals: ReferralSettings;
}

export const PLATFORM_SETTING_DEFAULTS: PlatformSettings = {
  fees: { onlinePaymentFeeBps: 250, payoutHoldDays: 7, minPayout: 10_000 },
  billing: { bankName: "", accountName: "", iban: "", vatBps: 0, vatNumber: "", graceDays: 7 },
  support: { email: "", whatsapp: "" },
  referrals: { rewardDays: 30 },
};

const KEYS = Object.keys(PLATFORM_SETTING_DEFAULTS) as (keyof PlatformSettings)[];

/** All platform settings merged over defaults, so a missing key never breaks a page. */
export async function getPlatformSettings(db: Db | Tx = getDb()): Promise<PlatformSettings> {
  const rows = await db.select().from(platformSettings).where(inArray(platformSettings.key, KEYS));
  const out = structuredClone(PLATFORM_SETTING_DEFAULTS);
  for (const row of rows) {
    const key = row.key as keyof PlatformSettings;
    Object.assign(out[key], row.value as object);
  }
  return out;
}
