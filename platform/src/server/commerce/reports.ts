import { sql } from "drizzle-orm";
import { withTenant } from "../db/tenant";
import { requireStoreAccess } from "../stores/service";
import { periodRange, type Period } from "./analytics";

export async function getSalesReport(userId: string, storeId: string, period: Period) {
  await requireStoreAccess(userId, storeId, "reports.read");
  const r = periodRange(period);
  return withTenant({ storeId, userId }, async (tx) => {
    const q = <T extends Record<string, unknown>>(query: ReturnType<typeof sql>) => tx.execute<T>(query).then((x) => x.rows);
    const inRange = sql`o.created_at >= ${r.from} and o.created_at < ${r.to} and o.status <> 'cancelled'`;
    const [summary] = await q<{ gross: string; discounts: string; shipping: string; tax: string; refunds: string; orders: number; items: number; cancelled: number }>(sql`
      select coalesce(sum(o.subtotal), 0) as gross, coalesce(sum(o.discount_total), 0) as discounts, coalesce(sum(o.shipping_total), 0) as shipping,
             coalesce(sum(o.tax_total), 0) as tax, coalesce(sum(o.refunded_total), 0) as refunds, count(*)::int as orders,
             coalesce((select sum(quantity) from order_items oi join orders o2 on o2.id = oi.order_id where o2.created_at >= ${r.from} and o2.created_at < ${r.to} and o2.status <> 'cancelled'), 0)::int as items,
             (select count(*)::int from orders o3 where o3.created_at >= ${r.from} and o3.created_at < ${r.to} and o3.status = 'cancelled') as cancelled
      from orders o where ${inRange}`);
    const byPayment = await q<{ method: string; orders: number; total: string }>(sql`
      select o.payment_method as method, count(*)::int as orders, sum(o.total - o.refunded_total) as total from orders o where ${inRange} group by 1 order by 3 desc`);
    const byCity = await q<{ city: string; orders: number; total: string }>(sql`
      select coalesce(nullif(o.shipping_address->>'city', ''), '—') as city, count(*)::int as orders, sum(o.total - o.refunded_total) as total
      from orders o where ${inRange} group by 1 order by 3 desc limit 10`);
    const byCoupon = await q<{ code: string; orders: number; discount: string }>(sql`
      select o.coupon_code as code, count(*)::int as orders, sum(o.discount_total) as discount from orders o where ${inRange} and o.coupon_code is not null group by 1 order by 2 desc limit 10`);
    const byProduct = await q<{ name: string; quantity: number; revenue: string; cost: string | null }>(sql`
      select max(oi.product_name) as name, sum(oi.quantity)::int as quantity, sum(oi.line_total) as revenue,
             sum(oi.quantity * v.cost) as cost
      from order_items oi join orders o on o.id = oi.order_id left join product_variants v on v.id = oi.variant_id
      where ${inRange} group by oi.product_id order by 3 desc limit 15`);
    const daily = await q<{ day: string; orders: number; sales: string }>(sql`
      select to_char(d.day, 'YYYY-MM-DD') as day, count(o.id)::int as orders, coalesce(sum(o.total - o.refunded_total), 0) as sales
      from generate_series(${r.from}::timestamptz, ${r.to}::timestamptz - interval '1 day', interval '1 day') d(day)
      left join orders o on o.created_at >= d.day and o.created_at < d.day + interval '1 day' and o.status <> 'cancelled'
      group by d.day order by d.day`);
    const n = (v: string | number | null) => Number(v ?? 0);
    const net = n(summary.gross) - n(summary.discounts) + n(summary.shipping) - n(summary.refunds);
    return {
      range: r,
      summary: { gross: n(summary.gross), discounts: n(summary.discounts), shipping: n(summary.shipping), tax: n(summary.tax), refunds: n(summary.refunds), net, orders: summary.orders, items: summary.items, cancelled: summary.cancelled },
      byPayment: byPayment.map((x) => ({ ...x, total: n(x.total) })),
      byCity: byCity.map((x) => ({ ...x, total: n(x.total) })),
      byCoupon: byCoupon.map((x) => ({ ...x, discount: n(x.discount) })),
      byProduct: byProduct.map((x) => ({ name: x.name, quantity: x.quantity, revenue: n(x.revenue), cost: x.cost === null ? null : n(x.cost) })),
      daily: daily.map((x) => ({ day: x.day, orders: x.orders, sales: n(x.sales) })),
    };
  });
}
