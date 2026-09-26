import type { Metadata } from "next";
import Link from "next/link";
import { Card, Pagination, Tabs } from "@/components/ui";
import { listCustomers, SEGMENTS, type Segment } from "@/server/commerce/customers";
import { formatMoney } from "@/server/lib/money";
import { roleHas } from "@/server/stores/permissions";
import { loadStore } from "../access";

export const metadata: Metadata = { title: "العملاء" };
const fmt = new Intl.DateTimeFormat("ar-SA-u-nu-latn", { dateStyle: "medium", timeZone: "Asia/Riyadh" });

export default async function CustomersPage({ params, searchParams }: PageProps<"/dashboard/[storeId]/customers">) {
  const { storeId } = await params;
  const sp = await searchParams;
  const { session, access } = await loadStore(storeId);
  const segment = (Object.keys(SEGMENTS).includes(String(sp.segment)) ? sp.segment : "all") as Segment;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 60) : "";
  const list = await listCustomers(session.user.id, storeId, { segment, q, page: Number(sp.page) || 1 });
  const base = `/dashboard/${storeId}/customers`;
  const href = (over: Record<string, string | number>) => {
    const u = new URLSearchParams({ ...(segment !== "all" && { segment }), ...(q && { q }), ...Object.fromEntries(Object.entries(over).map(([k, v]) => [k, String(v)])) });
    if (u.get("segment") === "all") u.delete("segment");
    return u.toString() ? `${base}?${u}` : base;
  };

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">العملاء</h1>
        {roleHas(access.role, "customers.export") && (
          <a href={`${base}/export`} className="text-sm text-brand">
            تصدير CSV
          </a>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs current={segment} items={Object.entries(SEGMENTS).map(([key, s]) => ({ key, label: s.label, href: href({ segment: key, page: 1 }) }))} />
        <form role="search" className="w-full sm:w-64">
          {segment !== "all" && <input type="hidden" name="segment" value={segment} />}
          <input name="q" defaultValue={q} placeholder="الاسم أو الجوال" aria-label="بحث في العملاء" className="w-full rounded-xl border border-line bg-surface px-3.5 py-2 text-sm outline-none focus:border-brand" />
        </form>
      </div>
      {SEGMENTS[segment].rule && <p className="text-xs text-ink-soft">القاعدة: {SEGMENTS[segment].rule}</p>}
      {list.rows.length === 0 ? (
        <Card className="py-14 text-center text-sm text-ink-soft">لا يوجد عملاء في هذا القسم.</Card>
      ) : (
        <Card className="p-0">
          <ul className="divide-y divide-line">
            {list.rows.map((c) => (
              <li key={c.id}>
                <Link href={`${base}/${c.id}`} className="grid grid-cols-2 gap-2 px-4 py-3 hover:bg-muted/60 sm:grid-cols-4 sm:items-center">
                  <span>
                    <span className="block font-medium">{c.name}</span>
                    <span className="ltr block text-end text-xs text-ink-soft sm:text-start">{c.phone}</span>
                  </span>
                  <span className="text-end text-sm sm:text-start">{c.ordersCount} طلب</span>
                  <span className="text-sm">{formatMoney(c.totalSpent)}</span>
                  <span className="text-end text-xs text-ink-soft sm:text-start">{c.lastOrderAt ? `آخر طلب ${fmt.format(c.lastOrderAt)}` : "—"}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Pagination page={list.page} pageCount={list.pageCount} href={(p) => href({ page: p })} />
    </div>
  );
}
