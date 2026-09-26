import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, Pagination, Tabs } from "@/components/ui";
import { PAYMENT_METHOD_LABELS } from "@/server/commerce/checkout";
import { FULFILLMENT_LABELS, listOrders, ORDER_TABS, PAYMENT_STATUS_LABELS, type OrderTab } from "@/server/commerce/orders";
import { formatMoney } from "@/server/lib/money";
import { loadStore } from "../access";
import { FULFILLMENT_TONES, PAYMENT_TONES } from "./labels";

export const metadata: Metadata = { title: "الطلبات" };
const fmt = new Intl.DateTimeFormat("ar-SA-u-nu-latn", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" });

export default async function OrdersPage({ params, searchParams }: PageProps<"/dashboard/[storeId]/orders">) {
  const { storeId } = await params;
  const sp = await searchParams;
  const { session } = await loadStore(storeId);
  const tab = (Object.keys(ORDER_TABS).includes(String(sp.tab)) ? sp.tab : "all") as OrderTab;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 60) : "";
  const page = Number(sp.page) || 1;
  const list = await listOrders(session.user.id, storeId, { tab, q, page });
  const base = `/dashboard/${storeId}/orders`;
  const href = (over: Record<string, string | number>) => {
    const u = new URLSearchParams({ ...(tab !== "all" && { tab }), ...(q && { q }), ...Object.fromEntries(Object.entries(over).map(([k, v]) => [k, String(v)])) });
    if (u.get("tab") === "all") u.delete("tab");
    return u.toString() ? `${base}?${u}` : base;
  };

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">الطلبات</h1>
        <a href={`${base}/export`} className="text-sm text-brand">
          تصدير CSV
        </a>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs
          current={tab}
          items={Object.entries(ORDER_TABS).map(([key, label]) => ({
            key,
            label,
            href: href({ tab: key, page: 1 }),
            count: key === "new" ? list.counts.new : key === "processing" ? list.counts.processing : undefined,
          }))}
        />
        <form role="search" className="w-full sm:w-72">
          {tab !== "all" && <input type="hidden" name="tab" value={tab} />}
          <input name="q" defaultValue={q} placeholder="رقم الطلب، اسم العميل أو الجوال" aria-label="بحث في الطلبات" className="w-full rounded-xl border border-line bg-surface px-3.5 py-2 text-sm outline-none focus:border-brand" />
        </form>
      </div>

      {list.rows.length === 0 ? (
        <Card className="py-14 text-center text-sm text-ink-soft">{q || tab !== "all" ? "لا توجد طلبات مطابقة." : "لم تصلك طلبات بعد. شارك رابط متجرك مع عملائك!"}</Card>
      ) : (
        <Card className="p-0">
          <div className="hidden grid-cols-[6rem_1.5fr_1fr_1fr_1fr_1fr] gap-3 border-b border-line px-4 py-2 text-xs text-ink-soft lg:grid">
            <span>الطلب</span>
            <span>العميل</span>
            <span>المبلغ</span>
            <span>الدفع</span>
            <span>التنفيذ</span>
            <span>التاريخ</span>
          </div>
          <ul className="divide-y divide-line">
            {list.rows.map((o) => (
              <li key={o.id}>
                <Link href={`${base}/${o.id}`} className="grid grid-cols-2 gap-x-3 gap-y-1 px-4 py-3 hover:bg-muted/60 lg:grid-cols-[6rem_1.5fr_1fr_1fr_1fr_1fr] lg:items-center">
                  <span className="font-semibold">#{o.number}</span>
                  <span className="truncate text-end lg:text-start">{o.customer.name}</span>
                  <span className="text-sm">
                    {formatMoney(o.total, o.currency)} <span className="text-xs text-ink-soft">({o.itemCount})</span>
                  </span>
                  <span className="flex flex-wrap justify-end gap-1 lg:justify-start">
                    <Badge tone={PAYMENT_TONES[o.paymentStatus]}>{PAYMENT_STATUS_LABELS[o.paymentStatus]}</Badge>
                    <span className="text-[11px] text-ink-soft lg:hidden">{PAYMENT_METHOD_LABELS[o.paymentMethod]}</span>
                  </span>
                  <span>
                    <Badge tone={FULFILLMENT_TONES[o.fulfillmentStatus]}>{FULFILLMENT_LABELS[o.fulfillmentStatus]}</Badge>
                  </span>
                  <span className="text-end text-xs text-ink-soft lg:text-start">{fmt.format(o.createdAt)}</span>
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
