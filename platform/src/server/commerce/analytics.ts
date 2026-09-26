import { and, gte, lt, sql } from "drizzle-orm";
import { customers, orderItems, orders } from "../db/schema";
import { withTenant } from "../db/tenant";
import { requireStoreAccess } from "../stores/service";
import { DEFAULT_LOW_STOCK } from "../catalog/inventory";

export const PERIODS = { today: "اليوم", "7d": "آخر 7 أيام", "30d": "آخر 30 يوماً", "90d": "آخر 90 يوماً" } as const;
export type Period = keyof typeof PERIODS;

const DAY = 86_400_000;

/** Period boundaries in Riyadh time (UTC+3, no DST), plus the equally long previous period. */
export function periodRange(period: Period, now = new Date()) {
  const riyadhMidnight = new Date(Math.floor((now.getTime() + 3 * 3600_000) / DAY) * DAY - 3 * 3600_000);
  const days = period === "today" ? 1 : Number(period.replace("d", ""));
  const to = new Date(riyadhMidnight.getTime() + DAY);
  const from = new Date(to.getTime() - days * DAY);
  return { from, to, days, prevFrom: new Date(from.getTime() - days * DAY), prevTo: from };
}

// Metric definitions (shown to merchants next to each number):
// - Sales: order totals minus refunds, for orders placed in the period that were not cancelled.
// - Orders: orders placed in the period, not cancelled.
// - Average order value: sales ÷ orders.
// - New customers: customers whose first order falls in the period.
// - Completion rate: completed ÷ (completed + cancelled) among orders placed in the period.
export const METRIC_HELP = {
  sales: "مجموع الطلبات غير الملغاة خلال الفترة بعد خصم المبالغ المستردة.",
  orders: "عدد الطلبات غير الملغاة خلال الفترة.",
  aov: "إجمالي المبيعات ÷ عدد الطلبات.",
  newCustomers: "عملاء كان أول طلب لهم خلال الفترة.",
  completion: "الطلبات المكتملة ÷ (المكتملة + الملغاة) من طلبات الفترة.",
};

async function periodMetrics(storeId: string, userId: string, from: Date, to: Date) {
  return withTenant({ storeId, userId }, async (tx) => {
    const inRange = and(gte(orders.createdAt, from), lt(orders.createdAt, to));
    const [o] = await tx
      .select({
        sales: sql<string>`coalesce(sum(total - refunded_total) filter (where status <> 'cancelled'), 0)`,
        orders: sql<number>`count(*) filter (where status <> 'cancelled')::int`,
        completed: sql<number>`count(*) filter (where status = 'completed')::int`,
        cancelled: sql<number>`count(*) filter (where status = 'cancelled')::int`,
      })
      .from(orders)
      .where(inRange);
    const [c] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(customers)
      .where(and(gte(customers.firstOrderAt, from), lt(customers.firstOrderAt, to)));
    const sales = Number(o.sales);
    return {
      sales,
      orders: o.orders,
      aov: o.orders ? Math.round(sales / o.orders) : 0,
      newCustomers: c.n,
      completion: o.completed + o.cancelled ? o.completed / (o.completed + o.cancelled) : null,
    };
  });
}

export async function getDashboardMetrics(userId: string, storeId: string, period: Period) {
  await requireStoreAccess(userId, storeId, "reports.read");
  const r = periodRange(period);
  const [current, previous, live, series, topProducts] = await Promise.all([
    periodMetrics(storeId, userId, r.from, r.to),
    periodMetrics(storeId, userId, r.prevFrom, r.prevTo),
    withTenant({ storeId, userId }, async (tx) => {
      const [row] = await tx.execute<{ new: number; processing: number; low: number }>(sql`
        select
          (select count(*)::int from orders where status = 'open' and fulfillment_status = 'unfulfilled') as new,
          (select count(*)::int from orders where status = 'open' and fulfillment_status in ('processing', 'ready')) as processing,
          (select count(*)::int from inventory_levels l join product_variants v on v.id = l.variant_id join products p on p.id = v.product_id
             where l.track_inventory and v.archived_at is null and p.status = 'active'
               and l.on_hand - l.reserved <= coalesce(l.low_stock_threshold, ${DEFAULT_LOW_STOCK})) as low`).then((x) => x.rows);
      return row;
    }),
    withTenant({ storeId, userId }, (tx) =>
      tx.execute<{ day: string; sales: string; orders: number }>(sql`
        select to_char(d.day, 'YYYY-MM-DD') as day,
               coalesce(sum(o.total - o.refunded_total) filter (where o.status <> 'cancelled'), 0) as sales,
               count(o.id) filter (where o.status <> 'cancelled')::int as orders
        from generate_series(${r.from}::timestamptz, ${r.to}::timestamptz - interval '1 day', interval '1 day') as d(day)
        left join orders o on o.created_at >= d.day and o.created_at < d.day + interval '1 day'
        group by d.day order by d.day`).then((x) => x.rows.map((row) => ({ day: row.day, sales: Number(row.sales), orders: row.orders }))),
    ),
    withTenant({ storeId, userId }, (tx) =>
      tx
        .select({
          productId: orderItems.productId,
          name: sql<string>`max(${orderItems.productName})`,
          quantity: sql<number>`sum(${orderItems.quantity})::int`,
          revenue: sql<string>`sum(${orderItems.lineTotal})`,
        })
        .from(orderItems)
        .innerJoin(orders, sql`${orders.id} = ${orderItems.orderId}`)
        .where(and(gte(orders.createdAt, r.from), lt(orders.createdAt, r.to), sql`${orders.status} <> 'cancelled'`))
        .groupBy(orderItems.productId)
        .orderBy(sql`sum(${orderItems.quantity}) desc`)
        .limit(5),
    ),
  ]);
  const change = (a: number, b: number) => (b === 0 ? null : (a - b) / b);
  return {
    period,
    range: r,
    current,
    previous,
    changes: { sales: change(current.sales, previous.sales), orders: change(current.orders, previous.orders), aov: change(current.aov, previous.aov), newCustomers: change(current.newCustomers, previous.newCustomers) },
    live,
    series,
    topProducts: topProducts.map((p) => ({ ...p, revenue: Number(p.revenue) })),
  };
}
