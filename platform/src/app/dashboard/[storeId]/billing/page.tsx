import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert, Badge, Card } from "@/components/ui";
import { STATUS_LABELS } from "@/server/billing/rules";
import { getBillingOverview, type Plan } from "@/server/billing/service";
import { formatMoney } from "@/server/lib/money";
import { roleHas } from "@/server/stores/permissions";
import { loadStore } from "../access";
import { PlanPicker, RenewalToggle, type PlanCard } from "./forms";

export const metadata: Metadata = { title: "الاشتراك" };

const dateFmt = new Intl.DateTimeFormat("ar-SA-u-nu-latn-ca-gregory", { dateStyle: "long", timeZone: "Asia/Riyadh" });
const STATUS_TONE = { trialing: "info", active: "success", past_due: "warning", expired: "danger", cancelled: "neutral" } as const;
const INVOICE_STATUS = { issued: { label: "بانتظار الدفع", tone: "warning" }, paid: { label: "مدفوعة", tone: "success" }, void: { label: "ملغاة", tone: "neutral" } } as const;

function limitText(n: number | null | undefined, unit: string) {
  return n == null ? `${unit} بلا حد` : `حتى ${n.toLocaleString("en")} ${unit}`;
}

function planLines(p: Plan): string[] {
  const lines = [limitText(p.limits.products, "منتج"), limitText(p.limits.staff, "موظف"), p.limits.ordersPerMonth == null ? "طلبات غير محدودة" : `حتى ${p.limits.ordersPerMonth} طلب شهرياً`];
  if (p.features.campaigns) lines.push("الحملات البريدية");
  if (p.features.advancedReports) lines.push("التقارير المتقدمة");
  if (p.features.removeBranding) lines.push("إخفاء «مدعوم من المنصة»");
  if (p.trialDays > 0) lines.push(`فترة تجريبية ${p.trialDays} يوماً للمتاجر الجديدة`);
  return lines;
}

function UsageBar({ label, used, limit }: { label: string; used: number; limit: number | null | undefined }) {
  const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  return (
    <div>
      <div className="mb-1 flex justify-between text-sm">
        <span>{label}</span>
        <span className="text-ink-soft">
          {used.toLocaleString("en")} / {limit == null ? "∞" : limit.toLocaleString("en")}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label={label} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className={`h-full rounded-full ${pct >= 90 ? "bg-red-500" : "bg-brand"}`} style={{ width: `${limit == null ? 4 : Math.max(pct, 2)}%` }} />
      </div>
    </div>
  );
}

export default async function BillingPage({ params }: PageProps<"/dashboard/[storeId]/billing">) {
  const { storeId } = await params;
  const { session, access } = await loadStore(storeId);
  if (!roleHas(access.role, "billing.read")) notFound();
  const b = await getBillingOverview(session.user.id, storeId);
  const canManage = roleHas(access.role, "billing.manage");
  const sub = b.subscription;
  const end = b.status === "trialing" ? sub?.trialEndsAt : sub?.currentPeriodEnd;

  const cards: PlanCard[] = b.plans.map((p) => {
    const saving = p.priceMonthly * 12 - p.priceYearly;
    return {
      id: p.id,
      name: p.name,
      description: p.description,
      monthly: formatMoney(p.priceMonthly, p.currency),
      yearly: formatMoney(p.priceYearly, p.currency),
      yearlySaving: saving > 0 ? formatMoney(saving, p.currency) : null,
      lines: planLines(p),
      current: p.id === b.plan.id,
      free: p.priceMonthly === 0 && p.priceYearly === 0,
    };
  });

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold">الاشتراك</h1>
        <p className="text-sm text-ink-soft">باقتك الحالية، الاستهلاك، والفواتير.</p>
      </div>

      {!b.canTakeOrders && (
        <Alert tone="error">متجرك لا يستقبل طلبات جديدة لأن الاشتراك {STATUS_LABELS[b.status]}. المتجر ما زال ظاهراً للعملاء؛ جدّد الاشتراك لاستئناف الطلبات.</Alert>
      )}
      {b.status === "past_due" && <Alert tone="warning">انتهت فترة اشتراكك وأنت الآن في فترة السماح ({b.graceDays} أيام). جدّد قبل انتهائها حتى لا تتوقف الطلبات.</Alert>}

      {b.openInvoice && (
        <Card className="border-amber-300 bg-amber-50/40">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold">فاتورة بانتظار الدفع — رقم {b.openInvoice.number}</h2>
              <p className="text-sm text-ink-soft">
                {b.openInvoice.planName} · {b.openInvoice.billingInterval === "monthly" ? "شهري" : "سنوي"}
              </p>
            </div>
            <p className="text-2xl font-bold">{formatMoney(b.openInvoice.total, b.openInvoice.currency)}</p>
          </div>
          {b.bank.iban ? (
            <dl className="mt-4 grid gap-3 rounded-xl border border-line bg-surface p-4 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-ink-soft">البنك</dt>
                <dd className="font-medium">{b.bank.bankName}</dd>
              </div>
              <div>
                <dt className="text-ink-soft">اسم المستفيد</dt>
                <dd className="font-medium">{b.bank.accountName}</dd>
              </div>
              <div>
                <dt className="text-ink-soft">الآيبان</dt>
                <dd className="ltr text-end font-mono font-medium">{b.bank.iban}</dd>
              </div>
            </dl>
          ) : (
            <p className="mt-3 text-sm">بيانات التحويل لم تُضف بعد من إدارة المنصة. تواصل مع الدعم لإتمام الدفع{b.support.email ? `: ${b.support.email}` : "."}</p>
          )}
          <p className="mt-3 text-sm">
            اكتب <strong>رقم الفاتورة {b.openInvoice.number}</strong> في وصف التحويل. يتفعّل الاشتراك بعد تأكيد استلام المبلغ، وتصلك رسالة في الإشعارات.
          </p>
          <Link href={`/dashboard/${storeId}/billing/invoices/${b.openInvoice.id}`} className="mt-2 inline-block text-sm text-brand">
            عرض الفاتورة وطباعتها
          </Link>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm text-ink-soft">الباقة الحالية</p>
              <p className="text-xl font-bold">{b.plan.name}</p>
            </div>
            <Badge tone={STATUS_TONE[b.status]}>{STATUS_LABELS[b.status]}</Badge>
          </div>
          <dl className="mt-4 flex flex-col gap-2 text-sm">
            {end && (
              <div className="flex justify-between gap-2">
                <dt className="text-ink-soft">{b.status === "trialing" ? "تنتهي الفترة التجريبية" : sub?.cancelAtPeriodEnd ? "ينتهي الاشتراك" : "التجديد القادم"}</dt>
                <dd>
                  {dateFmt.format(end)}
                  {b.daysLeft != null && ` (بعد ${b.daysLeft} يوم)`}
                </dd>
              </div>
            )}
            {sub?.status === "active" && sub.currentPeriodEnd && (
              <div className="flex justify-between gap-2">
                <dt className="text-ink-soft">مدة الفوترة</dt>
                <dd>{sub.billingInterval === "monthly" ? "شهرية" : "سنوية"}</dd>
              </div>
            )}
          </dl>
          {canManage && b.status === "active" && sub?.currentPeriodEnd && (
            <div className="mt-4">
              <RenewalToggle storeId={storeId} cancelAtPeriodEnd={sub.cancelAtPeriodEnd} />
              <p className="mt-2 text-xs text-ink-soft">لا يوجد خصم تلقائي من بطاقتك؛ التجديد يتم بفاتورة جديدة تصدرها من هذه الصفحة.</p>
            </div>
          )}
        </Card>
        <Card className="flex flex-col gap-4">
          <h2 className="font-semibold">الاستهلاك</h2>
          <UsageBar label="المنتجات" used={b.usage.products} limit={b.plan.limits.products} />
          <UsageBar label="أعضاء الفريق والدعوات" used={b.usage.staff} limit={b.plan.limits.staff} />
          <UsageBar label="طلبات هذا الشهر" used={b.usage.ordersPerMonth} limit={b.plan.limits.ordersPerMonth} />
        </Card>
      </div>

      <PlanPicker storeId={storeId} plans={cards} canManage={canManage} hasOpenInvoice={!!b.openInvoice} />

      <Card className="p-0">
        <h2 className="px-4 pt-4 font-semibold">الفواتير</h2>
        {b.invoices.length === 0 ? (
          <p className="p-4 text-sm text-ink-soft">لا توجد فواتير بعد.</p>
        ) : (
          <ul className="divide-y divide-line">
            {b.invoices.map((inv) => (
              <li key={inv.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
                <Link href={`/dashboard/${storeId}/billing/invoices/${inv.id}`} className="font-medium text-brand">
                  فاتورة {inv.number}
                </Link>
                <span className="text-ink-soft">
                  {inv.planName} · {dateFmt.format(inv.createdAt)}
                </span>
                <span className="font-semibold">{formatMoney(inv.total, inv.currency)}</span>
                <Badge tone={INVOICE_STATUS[inv.status].tone}>{INVOICE_STATUS[inv.status].label}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <p className="text-xs text-ink-soft">الأسعار المعروضة يحددها مالك المنصة وقد تتغير للفواتير الجديدة فقط؛ الفواتير الصادرة لا تتغير.</p>
    </div>
  );
}
