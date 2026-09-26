import { createHash } from "node:crypto";
import { and, gte, lt, sql } from "drizzle-orm";
import { pageViews, PAGE_TYPES, TRAFFIC_SOURCES } from "../db/schema";
import { withTenant } from "../db/tenant";
import { isUuid } from "../lib/ids";
import { requireStoreAccess } from "../stores/service";
import { periodRange, type Period } from "../commerce/analytics";

const BOT = /bot|crawler|spider|crawling|preview|facebookexternalhit|whatsapp\/|headless|lighthouse|pingdom|curl|wget|python-requests/i;

export function classifySource(referrer: string | null | undefined, utmSource: string | null | undefined): (typeof TRAFFIC_SOURCES)[number] {
  const s = `${utmSource ?? ""} ${referrer ?? ""}`.toLowerCase();
  if (!s.trim()) return "direct";
  if (/google\./.test(s) || /\bgoogle\b/.test(s)) return "google";
  if (/instagram|l\.instagram/.test(s)) return "instagram";
  if (/tiktok/.test(s)) return "tiktok";
  if (/snapchat|snap\b/.test(s)) return "snapchat";
  if (/whatsapp|wa\.me/.test(s)) return "whatsapp";
  if (/(^|\W)(x\.com|t\.co|twitter)/.test(s) || utmSource?.toLowerCase() === "x") return "x";
  if (/facebook|fb\.|l\.facebook/.test(s)) return "facebook";
  return "other";
}

export function classifyPath(path: string): { pageType: (typeof PAGE_TYPES)[number]; productSlug: string | null } {
  const p = path.split("?")[0];
  if (p === "/" || p === "") return { pageType: "home", productSlug: null };
  const m = p.match(/^\/products\/([^/]+)\/?$/);
  if (m) return { pageType: "product", productSlug: decodeURIComponent(m[1]) };
  if (p.startsWith("/categories/")) return { pageType: "category", productSlug: null };
  if (p === "/cart") return { pageType: "cart", productSlug: null };
  if (p === "/checkout") return { pageType: "checkout", productSlug: null };
  if (p.startsWith("/orders/")) return { pageType: "order", productSlug: null };
  if (p.startsWith("/pages/")) return { pageType: "page", productSlug: null };
  return { pageType: "other", productSlug: null };
}

function visitorHash(day: string, ip: string, ua: string) {
  const salt = process.env.ANALYTICS_SALT ?? process.env.PAYMENT_TEST_SECRET ?? "ayten-analytics";
  return createHash("sha256").update(`${salt}|${day}|${ip}|${ua}`).digest().subarray(0, 16);
}

/** Records one storefront page view. Bots are ignored; no IP or user agent is stored. */
export async function recordPageView(
  storeId: string,
  input: { path: string; referrer?: string | null; utmSource?: string | null; utmCampaign?: string | null; ip: string | null; userAgent: string | null; productId?: string | null },
) {
  const ua = input.userAgent ?? "";
  if (!ua || BOT.test(ua)) return false;
  const now = new Date();
  const day = new Date(now.getTime() + 3 * 3600_000).toISOString().slice(0, 10); // Riyadh date
  const { pageType } = classifyPath(input.path);
  // Referrers from the store itself are internal navigation, not a source.
  const referrer = input.referrer && !/localhost|\.ayten|^\s*$/.test(new URL(input.referrer, "http://x").host) ? input.referrer : null;
  await withTenant({ storeId }, (tx) =>
    tx.insert(pageViews).values({
      storeId,
      day,
      visitor: visitorHash(day, input.ip ?? "", ua),
      pageType,
      productId: input.productId && isUuid(input.productId) ? input.productId : null,
      source: classifySource(referrer, input.utmSource),
      campaign: input.utmCampaign?.slice(0, 60) || null,
      device: /mobi|android|iphone|ipad/i.test(ua) ? "mobile" : "desktop",
    }),
  );
  return true;
}

export const SOURCE_LABELS: Record<(typeof TRAFFIC_SOURCES)[number], string> = {
  direct: "مباشر",
  google: "جوجل",
  instagram: "إنستغرام",
  tiktok: "تيك توك",
  snapchat: "سناب شات",
  whatsapp: "واتساب",
  x: "إكس",
  facebook: "فيسبوك",
  other: "مواقع أخرى",
};

export async function getTrafficReport(userId: string, storeId: string, period: Period) {
  await requireStoreAccess(userId, storeId, "reports.read");
  const r = periodRange(period);
  const fromDay = new Date(r.from.getTime() + 3 * 3600_000).toISOString().slice(0, 10);
  const toDay = new Date(r.to.getTime() + 3 * 3600_000).toISOString().slice(0, 10);
  return withTenant({ storeId, userId }, async (tx) => {
    const inRange = and(gte(pageViews.day, fromDay), lt(pageViews.day, toDay));
    const [totals] = await tx
      .select({
        views: sql<number>`count(*)::int`,
        visitors: sql<number>`count(distinct (day, visitor))::int`,
        productViews: sql<number>`count(*) filter (where page_type = 'product')::int`,
        checkoutVisitors: sql<number>`count(distinct (day, visitor)) filter (where page_type = 'checkout')::int`,
        cartVisitors: sql<number>`count(distinct (day, visitor)) filter (where page_type = 'cart')::int`,
        mobile: sql<number>`count(distinct (day, visitor)) filter (where device = 'mobile')::int`,
      })
      .from(pageViews)
      .where(inRange);
    const [{ orders }] = await tx.execute<{ orders: number }>(
      sql`select count(*)::int as orders from orders where created_at >= ${r.from} and created_at < ${r.to} and status <> 'cancelled'`,
    ).then((x) => x.rows);
    // A visitor is attributed to the source of their first page view of the day.
    const sources = await tx.execute<{ source: (typeof TRAFFIC_SOURCES)[number]; visitors: number }>(sql`
      select source, count(*)::int as visitors from (
        select distinct on (day, visitor) source from page_views
        where day >= ${fromDay}::date and day < ${toDay}::date
        order by day, visitor, created_at
      ) first_views group by source order by visitors desc`).then((x) => x.rows);
    const daily = await tx.execute<{ day: string; visitors: number }>(sql`
      select to_char(d::date, 'YYYY-MM-DD') as day, coalesce(v.visitors, 0)::int as visitors
      from generate_series(${fromDay}::date, ${toDay}::date - 1, interval '1 day') d
      left join (select day, count(distinct visitor) as visitors from page_views where day >= ${fromDay}::date and day < ${toDay}::date group by day) v on v.day = d::date
      order by d`).then((x) => x.rows);
    const topProducts = await tx.execute<{ name: string; views: number; product_id: string }>(sql`
      select p.name, p.id as product_id, count(*)::int as views
      from page_views v join products p on p.id = v.product_id
      where v.day >= ${fromDay}::date and v.day < ${toDay}::date
      group by p.id, p.name order by views desc limit 8`).then((x) => x.rows);
    const campaigns = await tx
      .select({ campaign: pageViews.campaign, visitors: sql<number>`count(distinct (day, visitor))::int` })
      .from(pageViews)
      .where(and(inRange, sql`${pageViews.campaign} is not null`))
      .groupBy(pageViews.campaign)
      .orderBy(sql`2 desc`)
      .limit(10);
    return {
      totals: { ...totals, orders, conversion: totals.visitors ? orders / totals.visitors : null },
      sources,
      daily,
      topProducts,
      campaigns,
    };
  });
}
