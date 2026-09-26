import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, Input, Pagination, Select } from "@/components/ui";
import { listStoresAdmin } from "@/server/admin/stores";
import { STATUS_LABELS } from "@/server/billing/rules";
import { formatMoney } from "@/server/lib/money";
import { loadAdmin } from "../access";
import { dateFmt, num, STORE_STATUS, SUB_TONE } from "../format";

export const metadata: Metadata = { title: "المتاجر" };

export default async function AdminStoresPage({ searchParams }: PageProps<"/admin/stores">) {
  const { session } = await loadAdmin("stores.read");
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const status = typeof sp.status === "string" ? sp.status : "";
  const page = Math.max(1, Number(sp.page) || 1);
  const data = await listStoresAdmin(session.user.id, { q, status, page });
  const href = (p: number) => `/admin/stores?${new URLSearchParams({ ...(q && { q }), ...(status && { status }), page: String(p) })}`;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <h1 className="text-2xl font-bold">المتاجر ({num(data.total)})</h1>
      <form className="flex flex-wrap gap-2" role="search">
        <Input name="q" defaultValue={q} placeholder="اسم المتجر، الرابط، بريد المالك" aria-label="بحث" className="max-w-sm" />
        <Select name="status" defaultValue={status} aria-label="الحالة" className="w-auto">
          <option value="">كل الحالات</option>
          {Object.entries(STORE_STATUS).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </Select>
        <button type="submit" className="rounded-xl bg-ink px-4 text-sm font-semibold text-white">
          بحث
        </button>
      </form>
      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[56rem] text-sm">
          <thead className="bg-muted/60 text-ink-soft">
            <tr>
              <th className="px-4 py-2.5 text-start font-medium">المتجر</th>
              <th className="px-2 py-2.5 text-start font-medium">المالك</th>
              <th className="px-2 py-2.5 text-start font-medium">الحالة</th>
              <th className="px-2 py-2.5 text-start font-medium">الباقة</th>
              <th className="px-2 py-2.5 text-end font-medium">منتجات</th>
              <th className="px-2 py-2.5 text-end font-medium">طلبات</th>
              <th className="px-2 py-2.5 text-end font-medium">المبيعات</th>
              <th className="px-4 py-2.5 text-end font-medium">أُنشئ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {data.stores.map((s) => (
              <tr key={s.id} className="hover:bg-muted/40">
                <td className="px-4 py-2.5">
                  <Link href={`/admin/stores/${s.id}`} className="font-medium text-brand">
                    {s.name}
                  </Link>
                  <span className="ltr block text-end text-xs text-ink-soft">{s.slug}</span>
                </td>
                <td className="px-2 py-2.5">
                  {s.ownerName}
                  <span className="ltr block text-end text-xs text-ink-soft">{s.ownerEmail}</span>
                </td>
                <td className="px-2 py-2.5">
                  <Badge tone={STORE_STATUS[s.status].tone}>{STORE_STATUS[s.status].label}</Badge>
                </td>
                <td className="px-2 py-2.5">
                  {s.planName ?? "—"}
                  {s.subscriptionStatus && (
                    <span className="block">
                      <Badge tone={SUB_TONE[s.subscriptionStatus]}>{STATUS_LABELS[s.subscriptionStatus]}</Badge>
                    </span>
                  )}
                </td>
                <td className="px-2 py-2.5 text-end">{num(s.products)}</td>
                <td className="px-2 py-2.5 text-end">{num(s.orders)}</td>
                <td className="px-2 py-2.5 text-end">{formatMoney(s.gmv)}</td>
                <td className="px-4 py-2.5 text-end text-ink-soft">{dateFmt.format(s.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data.stores.length === 0 && <p className="p-6 text-center text-sm text-ink-soft">لا توجد متاجر مطابقة.</p>}
      </Card>
      <Pagination page={data.page} pageCount={data.pageCount} href={href} />
    </div>
  );
}
