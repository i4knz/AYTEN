import type { Metadata } from "next";
import Link from "next/link";
import { BarChart } from "@/components/bar-chart";
import { Card, Stat, Tabs } from "@/components/ui";
import { PERIODS, type Period } from "@/server/commerce/analytics";
import { getTrafficReport, SOURCE_LABELS } from "@/server/marketing/traffic";
import { loadStore } from "../../access";

export const metadata: Metadata = { title: "تحليلات الزيارات" };
const dayFmt = new Intl.DateTimeFormat("ar-SA-u-nu-latn", { day: "numeric", month: "short", timeZone: "UTC" });
const pct = (v: number | null) => (v === null ? "—" : `${(v * 100).toFixed(1)}%`);

export default async function AnalyticsPage({ params, searchParams }: PageProps<"/dashboard/[storeId]/marketing/analytics">) {
  const { storeId } = await params;
  const sp = await searchParams;
  const { session } = await loadStore(storeId);
  const period = (Object.keys(PERIODS).includes(String(sp.period)) ? sp.period : "30d") as Period;
  const r = await getTrafficReport(session.user.id, storeId, period);
  const base = `/dashboard/${storeId}/marketing/analytics`;
  const maxSource = Math.max(1, ...r.sources.map((s) => s.visitors));
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href={`/dashboard/${storeId}/marketing`} className="text-sm text-brand">→ التسويق</Link>
          <h1 className="mt-1 text-2xl font-bold">تحليلات الزيارات</h1>
          <p className="text-xs text-ink-soft">نحسب الزوار دون تخزين عناوين IP أو ملفات تعريف ارتباط، ونستبعد برامج الزحف.</p>
        </div>
        <Tabs current={period} items={Object.entries(PERIODS).map(([k, l]) => ({ key: k, label: l, href: `${base}?period=${k}` }))} />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="الزوار" value={r.totals.visitors} hint="زائر فريد لكل يوم" />
        <Stat label="مشاهدات الصفحات" value={r.totals.views} />
        <Stat label="معدل التحويل" value={pct(r.totals.conversion)} hint={`${r.totals.orders} طلب ÷ الزوار`} />
        <Stat label="زوار الجوال" value={r.totals.visitors ? `${Math.round((r.totals.mobile / r.totals.visitors) * 100)}%` : "—"} />
      </div>
      <Card>
        <h2 className="mb-3 font-semibold">الزوار يومياً</h2>
        <BarChart label="الزوار يومياً" data={r.daily.map((d) => ({ key: d.day, label: dayFmt.format(new Date(`${d.day}T00:00:00Z`)), value: d.visitors }))} format={(v) => `${v}`} />
      </Card>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-semibold">مصادر الزيارات</h2>
          {r.sources.length === 0 ? (
            <p className="text-sm text-ink-soft">لا توجد زيارات في هذه الفترة.</p>
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {r.sources.map((s) => (
                <li key={s.source} className="flex items-center gap-3">
                  <span className="w-24 shrink-0">{SOURCE_LABELS[s.source]}</span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden>
                    <span className="block h-full rounded-full bg-brand" style={{ width: `${(s.visitors / maxSource) * 100}%` }} />
                  </span>
                  <span className="w-10 text-end">{s.visitors}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <h2 className="mb-3 font-semibold">قمع الشراء</h2>
          <ol className="flex flex-col gap-2 text-sm">
            {[
              ["زاروا المتجر", r.totals.visitors],
              ["فتحوا السلة", r.totals.cartVisitors],
              ["بدأوا إتمام الطلب", r.totals.checkoutVisitors],
              ["أكملوا الطلب", r.totals.orders],
            ].map(([label, v]) => (
              <li key={label as string} className="flex justify-between border-b border-line pb-2 last:border-0">
                <span>{label}</span>
                <strong>{v as number}</strong>
              </li>
            ))}
          </ol>
        </Card>
        <Card>
          <h2 className="mb-3 font-semibold">المنتجات الأكثر مشاهدة</h2>
          {r.topProducts.length === 0 ? (
            <p className="text-sm text-ink-soft">لا توجد بيانات.</p>
          ) : (
            <ol className="flex flex-col gap-2 text-sm">
              {r.topProducts.map((p, i) => (
                <li key={p.product_id} className="flex justify-between gap-2">
                  <Link href={`/dashboard/${storeId}/products/${p.product_id}`} className="truncate hover:text-brand">{i + 1}. {p.name}</Link>
                  <span className="text-ink-soft">{p.views}</span>
                </li>
              ))}
            </ol>
          )}
        </Card>
        <Card>
          <h2 className="mb-1 font-semibold">الحملات (utm_campaign)</h2>
          <p className="mb-3 text-xs text-ink-soft">أضف ?utm_source=instagram&amp;utm_campaign=eid لروابط إعلاناتك لتظهر هنا.</p>
          {r.campaigns.length === 0 ? (
            <p className="text-sm text-ink-soft">لا توجد حملات مُتتبعة.</p>
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {r.campaigns.map((c) => (
                <li key={c.campaign} className="flex justify-between"><span className="ltr">{c.campaign}</span><span>{c.visitors}</span></li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
