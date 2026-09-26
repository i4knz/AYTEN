import { AlertTriangle, Clock, ShoppingBag } from "lucide-react";
import Link from "next/link";
import { BarChart } from "@/components/bar-chart";
import { Alert, Card, Tabs } from "@/components/ui";
import { getDashboardMetrics, METRIC_HELP, PERIODS, type Period } from "@/server/commerce/analytics";
import { formatMoney } from "@/server/lib/money";
import { roleHas } from "@/server/stores/permissions";
import { getSetupChecklist } from "@/server/stores/service";
import { storefrontUrl } from "@/server/urls";
import { loadStore } from "./access";
import { PublishCard } from "./publish-card";

const dayFmt = new Intl.DateTimeFormat("ar-SA-u-nu-latn", { day: "numeric", month: "short", timeZone: "UTC" });

function Delta({ value }: { value: number | null }) {
  if (value === null) return <span className="text-xs text-ink-faint">لا توجد بيانات للمقارنة</span>;
  const pct = Math.round(value * 100);
  const tone = pct > 0 ? "text-emerald-700" : pct < 0 ? "text-red-700" : "text-ink-soft";
  return (
    <span className={`text-xs ${tone}`}>
      {pct > 0 ? "▲" : pct < 0 ? "▼" : "•"} {Math.abs(pct)}% عن الفترة السابقة
    </span>
  );
}

function Metric({ label, value, help, delta }: { label: string; value: string; help: string; delta?: number | null }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4" title={help}>
      <p className="text-xs text-ink-soft">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
      {delta !== undefined && <Delta value={delta} />}
    </div>
  );
}

export default async function StoreHome({ params, searchParams }: PageProps<"/dashboard/[storeId]">) {
  const { storeId } = await params;
  const sp = await searchParams;
  const { session, access } = await loadStore(storeId);
  const period = (Object.keys(PERIODS).includes(String(sp.period)) ? sp.period : "30d") as Period;
  const checklist = await getSetupChecklist(access);
  const available = checklist.filter((i) => i.available && i.key !== "publish");
  const pending = available.filter((i) => !i.done);
  const canReports = roleHas(access.role, "reports.read");
  const metrics = canReports ? await getDashboardMetrics(session.user.id, storeId, period) : null;
  const base = `/dashboard/${storeId}`;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      {sp.welcome === "1" && (
        <Alert tone="success">
          تم إنشاء متجرك <strong>{access.store.name}</strong>. أكمل الخطوات أدناه بالترتيب الذي يناسبك.
        </Alert>
      )}
      {!session.user.emailVerified && (
        <Alert tone="warning">
          لم تؤكد بريدك الإلكتروني بعد. أرسلنا لك رابط التأكيد.{" "}
          <Link href="/account/security" className="font-semibold underline">إعادة الإرسال</Link>
        </Alert>
      )}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">أهلاً {session.user.name}</h1>
          <p className="text-sm text-ink-soft">
            رابط متجرك:{" "}
            <a href={storefrontUrl(access.store.slug)} target="_blank" rel="noopener" className="ltr text-brand hover:underline">
              {new URL(storefrontUrl(access.store.slug)).host}
            </a>
          </p>
        </div>
        {metrics && <Tabs current={period} items={Object.entries(PERIODS).map(([key, label]) => ({ key, label, href: `${base}?period=${key}` }))} />}
      </div>

      {metrics && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Link href={`${base}/orders?tab=new`} className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-4 hover:border-brand">
              <ShoppingBag className="size-5 text-brand" aria-hidden />
              <span><span className="block text-2xl font-bold">{metrics.live.new}</span><span className="text-xs text-ink-soft">طلبات جديدة بانتظارك</span></span>
            </Link>
            <Link href={`${base}/orders?tab=processing`} className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-4 hover:border-brand">
              <Clock className="size-5 text-amber-600" aria-hidden />
              <span><span className="block text-2xl font-bold">{metrics.live.processing}</span><span className="text-xs text-ink-soft">قيد التجهيز</span></span>
            </Link>
            <Link href={`${base}/inventory?low=1`} className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-4 hover:border-brand">
              <AlertTriangle className="size-5 text-red-600" aria-hidden />
              <span><span className="block text-2xl font-bold">{metrics.live.low}</span><span className="text-xs text-ink-soft">منتجات منخفضة المخزون</span></span>
            </Link>
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Metric label="إجمالي المبيعات" value={formatMoney(metrics.current.sales)} help={METRIC_HELP.sales} delta={metrics.changes.sales} />
            <Metric label="عدد الطلبات" value={String(metrics.current.orders)} help={METRIC_HELP.orders} delta={metrics.changes.orders} />
            <Metric label="متوسط قيمة الطلب" value={formatMoney(metrics.current.aov)} help={METRIC_HELP.aov} delta={metrics.changes.aov} />
            <Metric label="عملاء جدد" value={String(metrics.current.newCustomers)} help={METRIC_HELP.newCustomers} delta={metrics.changes.newCustomers} />
            <Metric
              label="نسبة إتمام الطلبات"
              value={metrics.current.completion === null ? "—" : `${Math.round(metrics.current.completion * 100)}%`}
              help={METRIC_HELP.completion}
            />
          </div>

          <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
            <Card>
              <h2 className="mb-1 font-semibold">المبيعات اليومية</h2>
              <p className="mb-3 text-xs text-ink-soft">{METRIC_HELP.sales}</p>
              <BarChart
                label={`المبيعات اليومية — ${PERIODS[period]}`}
                data={metrics.series.map((d) => ({ key: d.day, label: dayFmt.format(new Date(`${d.day}T00:00:00Z`)), value: d.sales }))}
                format={(v) => formatMoney(v)}
              />
            </Card>
            <Card>
              <h2 className="mb-3 font-semibold">الأكثر مبيعاً</h2>
              {metrics.topProducts.length === 0 ? (
                <p className="text-sm text-ink-soft">لا توجد مبيعات في هذه الفترة.</p>
              ) : (
                <ol className="flex flex-col gap-2 text-sm">
                  {metrics.topProducts.map((p, i) => (
                    <li key={p.productId ?? i} className="flex items-center justify-between gap-2">
                      <span className="truncate">{i + 1}. {p.name}</span>
                      <span className="shrink-0 text-xs text-ink-soft">{p.quantity} قطعة · {formatMoney(p.revenue)}</span>
                    </li>
                  ))}
                </ol>
              )}
            </Card>
          </div>
        </>
      )}

      <PublishCard
        storeId={storeId}
        status={access.store.status}
        storeUrl={storefrontUrl(access.store.slug)}
        canPublish={roleHas(access.role, "settings.write")}
        blockers={[
          ...(checklist.find((i) => i.key === "verify_email")?.done ? [] : ["أكّد البريد الإلكتروني لمالك المتجر."]),
          ...(checklist.find((i) => i.key === "product_active")?.done ? [] : ["انشر منتجاً واحداً على الأقل."]),
          ...(checklist.find((i) => i.key === "shipping")?.done ? [] : ["أضف طريقة شحن واحدة على الأقل."]),
        ]}
      />

      {pending.length > 0 && (
        <Card>
          <div className="mb-4 flex items-center justify-between gap-4">
            <h2 className="text-lg font-semibold">إعداد المتجر</h2>
            <span className="text-sm text-ink-soft">{available.length - pending.length} من {available.length} مكتملة</span>
          </div>
          <div className="mb-5 h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
            <div className="h-full rounded-full bg-brand" style={{ width: `${((available.length - pending.length) / Math.max(available.length, 1)) * 100}%` }} />
          </div>
          <ul className="flex flex-col divide-y divide-line">
            {pending.map((item) => (
              <li key={item.key} className="flex items-center justify-between gap-4 py-3">
                <span className="text-sm">{item.label}</span>
                {item.href && <Link href={item.href} className="text-sm font-semibold text-brand">ابدأ</Link>}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
