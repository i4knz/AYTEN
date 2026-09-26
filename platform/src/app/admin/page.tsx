import type { Metadata } from "next";
import Link from "next/link";
import { BarChart } from "@/components/bar-chart";
import { Badge, Card, Stat } from "@/components/ui";
import { getPlatformOverview } from "@/server/admin/stores";
import { STATUS_LABELS } from "@/server/billing/rules";
import { formatMoney } from "@/server/lib/money";
import { loadAdmin } from "./access";
import { dateFmt, num, STORE_STATUS, SUB_TONE } from "./format";

export const metadata: Metadata = { title: "نظرة عامة" };

export default async function AdminOverviewPage() {
  const { session } = await loadAdmin("stores.read");
  const o = await getPlatformOverview(session.user.id);
  const dayLabel = (d: string) => d.slice(8) + "/" + d.slice(5, 7);

  const alerts = [
    o.ticketsUrgent > 0 && { text: `${o.ticketsUrgent} تذكرة عاجلة (متجر لا يبيع)`, href: "/admin/tickets" },
    o.invoicesOpen > 0 && { text: `${o.invoicesOpen} فاتورة بانتظار تأكيد الدفع`, href: "/admin/invoices?status=issued" },
    o.payoutsPending > 0 && { text: `${o.payoutsPending} طلب سحب بقيمة ${formatMoney(o.payoutsPendingAmount)}`, href: "/admin/payouts" },
    o.webhookErrors7 > 0 && { text: `${o.webhookErrors7} إشعار دفع فشلت معالجته خلال 7 أيام`, href: "/admin/payments" },
    o.trialsEndingSoon > 0 && { text: `${o.trialsEndingSoon} فترة تجريبية تنتهي خلال 7 أيام`, href: "/admin/stores" },
  ].filter(Boolean) as { text: string; href: string }[];

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">نظرة عامة على المنصة</h1>
        <p className="text-sm text-ink-soft">الأرقام من قاعدة البيانات مباشرة. «آخر 30 يوماً» ما لم يُذكر غير ذلك.</p>
      </div>

      {alerts.length > 0 && (
        <Card className="border-amber-300 bg-amber-50/50">
          <h2 className="mb-2 font-semibold">يحتاج انتباهك</h2>
          <ul className="flex flex-col gap-1 text-sm">
            {alerts.map((a) => (
              <li key={a.href}>
                <Link href={a.href} className="text-amber-900 underline-offset-4 hover:underline">
                  • {a.text}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="التجار" value={num(o.merchants)} hint={`+${num(o.merchants30)} جديد`} />
        <Stat label="المتاجر" value={num(o.stores)} hint={`${num(o.published)} منشور · ${num(o.suspended)} موقوف`} />
        <Stat label="الإيراد الشهري المتكرر (MRR)" value={formatMoney(o.mrr)} hint="من الاشتراكات المدفوعة النشطة" />
        <Stat label="إيراد الاشتراكات" value={formatMoney(o.invoicesPaid30)} hint={`الإجمالي ${formatMoney(o.invoicesPaidAll)}`} />
        <Stat label="مبيعات المتاجر (GMV)" value={formatMoney(o.gmv30)} hint={`${num(o.orders30)} طلب`} />
        <Stat label="مدفوعات إلكترونية" value={formatMoney(o.onlinePaid30)} />
        <Stat label="أرصدة التجار لدى المنصة" value={formatMoney(o.walletLiability)} hint="التزام مستحق للتجار" />
        <Stat label="تذاكر مفتوحة" value={num(o.ticketsOpen)} hint={o.ticketsUrgent ? `${o.ticketsUrgent} عاجلة` : undefined} />
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-2 font-semibold">متاجر جديدة يومياً</h2>
          <BarChart data={o.daily.map((d) => ({ key: d.day, label: dayLabel(d.day), value: d.stores }))} format={(v) => num(v)} label="متاجر جديدة يومياً" />
        </Card>
        <Card>
          <h2 className="mb-2 font-semibold">طلبات يومياً (كل المتاجر)</h2>
          <BarChart data={o.daily.map((d) => ({ key: d.day, label: dayLabel(d.day), value: d.orders }))} format={(v) => num(v)} label="طلبات يومياً" />
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
        <Card>
          <h2 className="mb-3 font-semibold">الاشتراكات حسب الحالة</h2>
          <ul className="flex flex-col gap-2 text-sm">
            {(Object.keys(o.subscriptions) as (keyof typeof o.subscriptions)[]).map((s) => (
              <li key={s} className="flex items-center justify-between">
                <Badge tone={SUB_TONE[s]}>{STATUS_LABELS[s]}</Badge>
                <span className="font-semibold">{num(o.subscriptions[s])}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card className="p-0">
          <div className="flex items-center justify-between px-4 pt-4">
            <h2 className="font-semibold">أحدث المتاجر</h2>
            <Link href="/admin/stores" className="text-sm text-brand">
              الكل
            </Link>
          </div>
          <ul className="divide-y divide-line">
            {o.recentStores.map((s) => (
              <li key={s.id}>
                <Link href={`/admin/stores/${s.id}`} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm hover:bg-muted">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{s.name}</span>
                    <span className="block text-xs text-ink-soft">
                      {s.owner} · {dateFmt.format(s.createdAt)}
                    </span>
                  </span>
                  <Badge tone={STORE_STATUS[s.status].tone}>{STORE_STATUS[s.status].label}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
