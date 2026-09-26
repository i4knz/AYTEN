import { createHmac, timingSafeEqual } from "node:crypto";
import { and, desc, eq, isNotNull, isNull, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { audit, type RequestMeta } from "../audit";
import { fieldErrors } from "../auth/schemas";
import { getDb } from "../db/client";
import { CAMPAIGN_SEGMENTS, campaigns, customers, stores } from "../db/schema";
import { withTenant } from "../db/tenant";
import { getEmailProvider } from "../email";
import { campaignMessage } from "../email/templates";
import { AppError, notFound, rateLimited } from "../lib/errors";
import { isUuid, uuidv7 } from "../lib/ids";
import { consume } from "../lib/rate-limit";
import { requireStoreAccess } from "../stores/service";
import { storefrontUrl } from "../urls";

export const SEGMENT_LABELS: Record<(typeof CAMPAIGN_SEGMENTS)[number], string> = {
  subscribers: "كل المشتركين في العروض",
  repeat: "المشتركون المتكررون (طلبان أو أكثر)",
  inactive: "المشتركون الذين لم يشتروا منذ 90 يوماً",
  new: "المشتركون الجدد (آخر 30 يوماً)",
};

export const MAX_CAMPAIGN_RECIPIENTS = 2000;
const CAMPAIGNS_PER_DAY = { limit: 3, windowSeconds: 24 * 3600 };

export const campaignSchema = z.object({
  name: z.string().trim().min(1, { error: "اسم الحملة مطلوب." }).max(100),
  subject: z.string().trim().min(3, { error: "عنوان الرسالة مطلوب." }).max(150),
  body: z.string().trim().min(10, { error: "اكتب نص الرسالة (10 أحرف على الأقل)." }).max(5000),
  buttonText: z.string().trim().max(40).optional().transform((v) => v || null),
  buttonLink: z
    .string()
    .trim()
    .max(300)
    .optional()
    .transform((v) => v || null)
    .refine((v) => v === null || v.startsWith("/") || /^https:\/\/\S+$/.test(v), { error: "رابط غير صالح." }),
  segment: z.enum(CAMPAIGN_SEGMENTS),
});

// Marketing email goes only to customers who opted in and have not unsubscribed.
function audience(segment: (typeof CAMPAIGN_SEGMENTS)[number]): SQL {
  const base = and(eq(customers.acceptsMarketing, true), isNotNull(customers.email), isNull(customers.unsubscribedAt), isNull(customers.anonymizedAt))!;
  switch (segment) {
    case "repeat":
      return and(base, sql`${customers.ordersCount} >= 2`)!;
    case "inactive":
      return and(base, sql`${customers.lastOrderAt} < now() - interval '90 days'`)!;
    case "new":
      return and(base, sql`${customers.firstOrderAt} >= now() - interval '30 days'`)!;
    default:
      return base;
  }
}

export async function countAudience(userId: string, storeId: string) {
  await requireStoreAccess(userId, storeId, "marketing.write");
  return withTenant({ storeId, userId }, async (tx) => {
    const out: Record<string, number> = {};
    for (const seg of CAMPAIGN_SEGMENTS) {
      const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(customers).where(audience(seg));
      out[seg] = n;
    }
    return out as Record<(typeof CAMPAIGN_SEGMENTS)[number], number>;
  });
}

export async function listCampaigns(userId: string, storeId: string) {
  await requireStoreAccess(userId, storeId, "marketing.write");
  return withTenant({ storeId, userId }, (tx) => tx.select().from(campaigns).orderBy(desc(campaigns.createdAt)).limit(100));
}

export async function getCampaign(userId: string, storeId: string, campaignId: string) {
  await requireStoreAccess(userId, storeId, "marketing.write");
  if (!isUuid(campaignId)) throw notFound();
  return withTenant({ storeId, userId }, async (tx) => {
    const [row] = await tx.select().from(campaigns).where(eq(campaigns.id, campaignId)).limit(1);
    if (!row) throw notFound();
    return row;
  });
}

export async function saveCampaign(userId: string, storeId: string, campaignId: string | null, input: unknown) {
  await requireStoreAccess(userId, storeId, "marketing.write");
  const parsed = campaignSchema.safeParse(input);
  if (!parsed.success) throw new AppError("validation", "راجع الحقول المظللة.", fieldErrors(parsed.error));
  return withTenant({ storeId, userId }, async (tx) => {
    if (campaignId) {
      if (!isUuid(campaignId)) throw notFound();
      const rows = await tx.update(campaigns).set(parsed.data).where(and(eq(campaigns.id, campaignId), eq(campaigns.status, "draft"))).returning({ id: campaigns.id });
      if (!rows.length) throw new AppError("invalid_state", "لا يمكن تعديل حملة مُرسلة.");
      return { campaignId };
    }
    const id = uuidv7();
    await tx.insert(campaigns).values({ id, storeId, createdBy: userId, ...parsed.data });
    return { campaignId: id };
  });
}

export function unsubscribeToken(storeId: string, customerId: string) {
  const secret = process.env.UNSUBSCRIBE_SECRET ?? process.env.PAYMENT_TEST_SECRET ?? "dev-unsubscribe-secret";
  return createHmac("sha256", secret).update(`${storeId}:${customerId}`).digest("base64url").slice(0, 32);
}

export async function unsubscribe(storeId: string, customerId: string, token: string) {
  if (!isUuid(customerId)) return false;
  const expected = Buffer.from(unsubscribeToken(storeId, customerId));
  const given = Buffer.from(token);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return false;
  await withTenant({ storeId }, (tx) =>
    tx.update(customers).set({ acceptsMarketing: false, unsubscribedAt: sql`now()` }).where(eq(customers.id, customerId)),
  );
  return true;
}

/**
 * Sends a draft campaign by email to its segment. Every message carries a
 * one-click unsubscribe link. The status moves draft → sending → sent in
 * separate steps so a crash never re-sends a finished campaign.
 */
export async function sendCampaign(userId: string, storeId: string, campaignId: string, meta: RequestMeta = {}) {
  await requireStoreAccess(userId, storeId, "marketing.write");
  if (!isUuid(campaignId)) throw notFound();
  if (!(await consume(`campaigns:${storeId}`, CAMPAIGNS_PER_DAY))) throw rateLimited();
  const [store] = await getDb().select().from(stores).where(eq(stores.id, storeId)).limit(1);
  if (store.status !== "published") throw new AppError("precondition", "انشر المتجر قبل إرسال الحملات.");

  const { campaign, recipients } = await withTenant({ storeId, userId }, async (tx) => {
    const [c] = await tx.update(campaigns).set({ status: "sending" }).where(and(eq(campaigns.id, campaignId), eq(campaigns.status, "draft"))).returning();
    if (!c) throw new AppError("invalid_state", "الحملة أُرسلت من قبل.");
    const list = await tx
      .select({ id: customers.id, name: customers.name, email: customers.email })
      .from(customers)
      .where(audience(c.segment))
      .limit(MAX_CAMPAIGN_RECIPIENTS);
    await tx.update(campaigns).set({ recipientsCount: list.length }).where(eq(campaigns.id, c.id));
    return { campaign: c, recipients: list };
  });

  const base = storefrontUrl(store.slug);
  let sent = 0;
  for (const r of recipients) {
    const unsubscribeUrl = `${base}/unsubscribe?c=${r.id}&t=${unsubscribeToken(storeId, r.id)}`;
    const link = campaign.buttonLink ? (campaign.buttonLink.startsWith("/") ? base + campaign.buttonLink : campaign.buttonLink) : null;
    try {
      await getEmailProvider().send(campaignMessage(r.email!, r.name, store.name, campaign.subject, campaign.body, campaign.buttonText, link, unsubscribeUrl));
      sent++;
    } catch (err) {
      console.error("[campaign] send failed", err);
    }
  }
  await withTenant({ storeId, userId }, async (tx) => {
    await tx.update(campaigns).set({ status: sent || !recipients.length ? "sent" : "failed", sentCount: sent, sentAt: sql`now()` }).where(eq(campaigns.id, campaignId));
    await audit({ storeId, actorId: userId, action: "campaign.sent", targetType: "campaign", targetId: campaignId, metadata: { recipients: recipients.length, sent }, meta }, tx);
  });
  return { recipients: recipients.length, sent };
}
