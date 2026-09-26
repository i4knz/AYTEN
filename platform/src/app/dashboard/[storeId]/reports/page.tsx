import type { Metadata } from "next";
import { BarChart } from "@/components/bar-chart";
import { Card, Stat, Tabs } from "@/components/ui";
import { PERIODS, type Period } from "@/server/commerce/analytics";
import { PAYMENT_METHOD_LABELS } from "@/server/commerce/checkout";
import { getSalesReport } from "@/server/commerce/reports";
import { formatMoney } from "@/server/lib/money";
import { loadStore } from "../access";

export const metadata: Metadata = { title: "التقارير" };
const dayFmt = new Intl.DateTimeFormat("ar-SA-u-nu-latn", { day: "numeric", month: "short", timeZone: "UTC" });

function Table({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  if (!rows.length) return <p className="text-sm text-ink-soft">لا توجد بيانات.</p>;
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-xs text-ink-soft">{head.map((h, i) => <th key={h} className={`pb-2 font-medium ${i ? "text-end" : "text-start"}`}>{h}</th>)}</tr>
      </thead>
      <tbody className="divide-y divide-line">
        {rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className={`py-1.5 ${j ? "text-end" : ""}`}>{c}</td>)}</tr>)}
      </tbody>
    </table>
  );
}

export default async function ReportsPage({ params, searchParams }: PageProps<"/dashboard/[storeId]/reports">) {
  const { storeId } = await params;
  const sp = await searchParams;
  const { session } = await loadStore(storeId);
  const period = (Object.keys(PERIODS).includes(String(sp.period)) ? sp.period : "30d") as Period;
  const r = await getSalesReport(session.user.id, storeId, period);
  const s = r.summary;
  const base = `/dashboard/${storeId}/reports`;
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">التقارير</h1>
          <p className="text-xs text-ink-soft">الطلبات غير الملغاة المنشأة خلال الفترة (بتوقيت الرياض).</p>
        </div>
        <div className="flex items-center gap-3">
          <Tabs current={period} items={Object.entries(PERIODS).map(([k, l]) => ({ key: k, label: l, href: `${base}?period=${k}` }))} />
          <a href={`/dashboard/${storeId}/orders/export`} className="text-sm text-brand">تصدير الطلبات</a>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="صافي المبيعات" value={formatMoney(s.net)} hint="المنتجات − الخصومات + الشحن − المسترد" />
        <Stat label="الطلبات" value={s.orders} hint={`${s.items} قطعة · ${s.cancelled} ملغي`} />
        <Stat label="الخصومات" value={formatMoney(s.discounts)} />
        <Stat label="ضريبة القيمة المضافة" value={formatMoney(s.tax)} hint="المحصلة ضمن الطلبات" />
      </div>
      <Card>
        <h2 className="mb-3 font-semibold">المبيعات اليومية</h2>
        <BarChart label="المبيعات اليومية" data={r.daily.map((d) => ({ key: d.day, label: dayFmt.format(new Date(`${d.day}T00:00:00Z`)), value: d.sales }))} format={(v) => formatMoney(v)} />
      </Card>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-semibold">المنتجات</h2>
          <Table
            head={["المنتج", "الكمية", "الإيراد", "هامش تقريبي"]}
            rows={r.byProduct.map((p) => [p.name, p.quantity, formatMoney(p.revenue), p.cost === null ? "—" : formatMoney(p.revenue - p.cost)])}
          />
          <p className="mt-2 text-xs text-ink-soft">الهامش = الإيراد − (الكمية × التكلفة الحالية المسجلة للنسخة).</p>
        </Card>
        <Card>
          <h2 className="mb-3 font-semibold">طرق الدفع</h2>
          <Table head={["الطريقة", "الطلبات", "المبلغ"]} rows={r.byPayment.map((p) => [PAYMENT_METHOD_LABELS[p.method as keyof typeof PAYMENT_METHOD_LABELS] ?? p.method, p.orders, formatMoney(p.total)])} />
        </Card>
        <Card>
          <h2 className="mb-3 font-semibold">المدن</h2>
          <Table head={["المدينة", "الطلبات", "المبلغ"]} rows={r.byCity.map((c) => [c.city, c.orders, formatMoney(c.total)])} />
        </Card>
        <Card>
          <h2 className="mb-3 font-semibold">الكوبونات</h2>
          <Table head={["الكوبون", "الطلبات", "الخصم"]} rows={r.byCoupon.map((c) => [c.code, c.orders, formatMoney(c.discount)])} />
        </Card>
      </div>
    </div>
  );
}
