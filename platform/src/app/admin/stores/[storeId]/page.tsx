import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { Badge, Card, Field, Input, Select, Stat } from "@/components/ui";
import { adminCan } from "@/server/admin/access";
import { getStoreAdmin } from "@/server/admin/stores";
import { STATUS_LABELS } from "@/server/billing/rules";
import { AppError } from "@/server/lib/errors";
import { formatMoney } from "@/server/lib/money";
import { ROLE_LABELS } from "@/server/stores/permissions";
import { storefrontUrl } from "@/server/urls";
import { PAYOUT_STATUS_LABELS } from "@/server/wallet/service";
import { TICKET_STATUS_LABELS } from "@/server/support/service";
import { loadAdmin } from "../../access";
import { reactivateStoreAction, setSubscriptionAction, suspendStoreAction } from "../../actions";
import { dateFmt, dateTimeFmt, num, STORE_STATUS, SUB_TONE } from "../../format";

export const metadata: Metadata = { title: "تفاصيل المتجر" };

export default async function AdminStorePage({ params }: PageProps<"/admin/stores/[storeId]">) {
  const { storeId } = await params;
  const { session, admin } = await loadAdmin("stores.read");
  const d = await getStoreAdmin(session.user.id, storeId).catch((err) => {
    if (err instanceof AppError && err.code === "not_found") notFound();
    throw err;
  });
  const url = storefrontUrl(d.store.slug);
  const sub = d.subscription;
  const health = [
    { ok: !!d.owner.emailVerifiedAt, label: "بريد المالك مؤكد" },
    { ok: d.stats.activeProducts > 0, label: "منتجات منشورة" },
    { ok: d.stats.shippingMethods > 0, label: "طريقة شحن مفعّلة" },
    { ok: !!(d.settings?.whatsapp || d.settings?.contactPhone), label: "وسيلة تواصل" },
    { ok: d.store.status === "published", label: "المتجر منشور" },
    { ok: !!sub && ["trialing", "active", "past_due"].includes(sub.effective), label: "اشتراك يسمح بالطلبات" },
  ];

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <Link href="/admin/stores" className="text-sm text-brand">
        → المتاجر
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{d.store.name}</h1>
          <a href={url} target="_blank" rel="noopener" className="ltr inline-block text-sm text-brand">
            {new URL(url).host}
          </a>
        </div>
        <Badge tone={STORE_STATUS[d.store.status].tone}>{STORE_STATUS[d.store.status].label}</Badge>
      </div>
      {d.store.status === "suspended" && d.store.suspendedReason && <Card className="border-red-200 bg-red-50 text-sm text-red-800">سبب الإيقاف: {d.store.suspendedReason}</Card>}

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="المبيعات" value={formatMoney(d.stats.gmv)} hint={`${num(d.stats.orders)} طلب · ${num(d.stats.orders30)} آخر 30 يوماً`} />
        <Stat label="المنتجات" value={num(d.stats.products)} hint={`${num(d.stats.activeProducts)} منشور`} />
        <Stat label="العملاء" value={num(d.stats.customers)} hint={`${num(d.stats.views30)} زيارة آخر 30 يوماً`} />
        <Stat label="رصيد المحفظة" value={formatMoney(d.stats.wallet)} hint={d.stats.lastOrderAt ? `آخر طلب ${dateFmt.format(new Date(d.stats.lastOrderAt))}` : "لا طلبات بعد"} />
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-semibold">صحة المتجر</h2>
          <ul className="grid grid-cols-2 gap-2 text-sm">
            {health.map((h) => (
              <li key={h.label} className={h.ok ? "text-emerald-700" : "text-red-700"}>
                {h.ok ? "✓" : "✗"} {h.label}
              </li>
            ))}
          </ul>
          <h2 className="mb-2 mt-5 font-semibold">المالك</h2>
          <p className="text-sm">
            {d.owner.name} — <span className="ltr inline-block">{d.owner.email}</span>
          </p>
          <p className="text-xs text-ink-soft">
            آخر دخول: {d.owner.lastLoginAt ? dateTimeFmt.format(d.owner.lastLoginAt) : "—"} · أُنشئ المتجر {dateFmt.format(d.store.createdAt)}
          </p>
          <h2 className="mb-2 mt-5 font-semibold">الفريق ({d.members.length})</h2>
          <ul className="text-sm">
            {d.members.map((m) => (
              <li key={m.id}>
                {m.name} · <span className="text-ink-soft">{ROLE_LABELS[m.role]}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="flex flex-col gap-3">
          <h2 className="font-semibold">الاشتراك</h2>
          {sub ? (
            <div className="text-sm">
              <p className="flex items-center gap-2">
                <span className="font-semibold">{sub.plan.name}</span>
                <Badge tone={SUB_TONE[sub.effective]}>{STATUS_LABELS[sub.effective]}</Badge>
              </p>
              {sub.trialEndsAt && sub.status === "trialing" && <p className="text-ink-soft">تنتهي التجربة {dateFmt.format(sub.trialEndsAt)}</p>}
              {sub.currentPeriodEnd && <p className="text-ink-soft">نهاية الفترة المدفوعة {dateFmt.format(sub.currentPeriodEnd)}</p>}
              {sub.cancelAtPeriodEnd && <p className="text-amber-700">ألغى التاجر التجديد</p>}
            </div>
          ) : (
            <p className="text-sm text-ink-soft">لا يوجد اشتراك.</p>
          )}
          {adminCan(admin, "billing.manage") && (
            <details className="rounded-xl border border-line p-3">
              <summary className="cursor-pointer text-sm font-semibold">تعديل الاشتراك يدوياً</summary>
              <ActionForm action={setSubscriptionAction.bind(null, storeId)} submitLabel="تطبيق" className="mt-3">
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="الباقة" name="planId">
                    <Select id="planId" name="planId" defaultValue={sub?.planId}>
                      {d.plans.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="النوع" name="mode">
                    <Select id="mode" name="mode" defaultValue="trial">
                      <option value="trial">تمديد/منح تجربة</option>
                      <option value="paid">فترة مدفوعة</option>
                    </Select>
                  </Field>
                  <Field label="عدد الأيام من اليوم" name="days">
                    <Input id="days" name="days" type="number" min={1} max={3650} defaultValue={14} required />
                  </Field>
                </div>
                <Field label="السبب (يُسجل في سجل التدقيق)" name="reason">
                  <Input id="reason" name="reason" required minLength={5} />
                </Field>
              </ActionForm>
            </details>
          )}
          {adminCan(admin, "stores.manage") &&
            (d.store.status === "suspended" ? (
              <ActionForm action={reactivateStoreAction.bind(null, storeId)} submitLabel="إعادة تفعيل المتجر" confirmText="إعادة تفعيل المتجر؟" />
            ) : (
              <details className="rounded-xl border border-red-200 p-3">
                <summary className="cursor-pointer text-sm font-semibold text-red-700">إيقاف المتجر</summary>
                <ActionForm action={suspendStoreAction.bind(null, storeId)} submitLabel="إيقاف المتجر" tone="danger" confirmText="إيقاف المتجر فوراً؟ لن يستطيع العملاء الطلب." className="mt-3">
                  <Field label="السبب (يظهر للتاجر)" name="suspend-reason">
                    <Input id="suspend-reason" name="reason" required minLength={5} />
                  </Field>
                </ActionForm>
              </details>
            ))}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-0">
          <h2 className="px-4 pt-4 font-semibold">الفواتير</h2>
          <ul className="divide-y divide-line text-sm">
            {d.invoices.map((i) => (
              <li key={i.id} className="flex justify-between px-4 py-2">
                <span>#{i.number}</span>
                <span>{formatMoney(i.total)}</span>
                <span className="text-ink-soft">{{ issued: "بانتظار الدفع", paid: "مدفوعة", void: "ملغاة" }[i.status]}</span>
              </li>
            ))}
            {!d.invoices.length && <li className="px-4 py-3 text-ink-soft">لا فواتير</li>}
          </ul>
        </Card>
        <Card className="p-0">
          <h2 className="px-4 pt-4 font-semibold">طلبات السحب</h2>
          <ul className="divide-y divide-line text-sm">
            {d.payouts.map((p) => (
              <li key={p.id} className="flex justify-between px-4 py-2">
                <span>{formatMoney(p.amount)}</span>
                <span className="text-ink-soft">{PAYOUT_STATUS_LABELS[p.status]}</span>
              </li>
            ))}
            {!d.payouts.length && <li className="px-4 py-3 text-ink-soft">لا طلبات</li>}
          </ul>
        </Card>
        <Card className="p-0">
          <h2 className="px-4 pt-4 font-semibold">تذاكر الدعم</h2>
          <ul className="divide-y divide-line text-sm">
            {d.tickets.map((t) => (
              <li key={t.id}>
                <Link href={`/admin/tickets/${t.id}`} className="flex justify-between gap-2 px-4 py-2 hover:bg-muted">
                  <span className="truncate">
                    #{t.number} {t.subject}
                  </span>
                  <span className="shrink-0 text-ink-soft">{TICKET_STATUS_LABELS[t.status]}</span>
                </Link>
              </li>
            ))}
            {!d.tickets.length && <li className="px-4 py-3 text-ink-soft">لا تذاكر</li>}
          </ul>
        </Card>
      </div>

      <Card className="p-0">
        <h2 className="px-4 pt-4 font-semibold">آخر الأحداث في المتجر</h2>
        <ul className="divide-y divide-line text-sm">
          {d.logs.map((l) => (
            <li key={l.id} className="flex flex-wrap justify-between gap-2 px-4 py-2">
              <span className="font-mono text-xs">{l.action}</span>
              <span className="text-xs text-ink-soft">
                {l.actorType === "platform_admin" ? "إدارة المنصة" : l.actorType === "system" ? "النظام" : "التاجر/الفريق"} · {dateTimeFmt.format(l.createdAt)}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
