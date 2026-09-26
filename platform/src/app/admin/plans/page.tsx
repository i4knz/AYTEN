import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { Badge, ButtonLink, Card } from "@/components/ui";
import { listPlansAdmin } from "@/server/admin/platform";
import { formatMoney } from "@/server/lib/money";
import { loadAdmin } from "../access";
import { archivePlanAction, setDefaultPlanAction } from "../actions";
import { num } from "../format";

export const metadata: Metadata = { title: "الباقات" };

export default async function AdminPlansPage() {
  const { session } = await loadAdmin("billing.manage");
  const rows = await listPlansAdmin(session.user.id);
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">الباقات</h1>
          <p className="text-sm text-ink-soft">الأسعار والحدود هنا تُعرض للتجار في صفحة الاشتراك. الأسعار الأولية افتراضية وتحتاج قرارك [يحتاج تحقق].</p>
        </div>
        <ButtonLink href="/admin/plans/new">باقة جديدة</ButtonLink>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {rows.map(({ plan: p, stores }) => (
          <Card key={p.id} className={`flex flex-col gap-2 ${p.archivedAt ? "opacity-60" : ""}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Link href={`/admin/plans/${p.id}`} className="text-lg font-bold text-brand">
                {p.name}
              </Link>
              <div className="flex gap-1">
                {p.isDefault && <Badge tone="success">افتراضية</Badge>}
                {!p.isPublic && <Badge>مخفية</Badge>}
                {p.archivedAt && <Badge tone="danger">مؤرشفة</Badge>}
              </div>
            </div>
            <p className="text-sm">
              {formatMoney(p.priceMonthly)} / شهر · {formatMoney(p.priceYearly)} / سنة · تجربة {p.trialDays} يوم
            </p>
            <p className="text-xs text-ink-soft">
              منتجات {p.limits.products ?? "∞"} · موظفون {p.limits.staff ?? "∞"} · طلبات شهرية {p.limits.ordersPerMonth ?? "∞"} · {num(stores)} متجر مشترك
            </p>
            <div className="mt-1 flex flex-wrap gap-2">
              {!p.isDefault && !p.archivedAt && <ActionForm action={setDefaultPlanAction.bind(null, p.id)} submitLabel="اجعلها الافتراضية" tone="secondary" inline />}
              {!p.isDefault && <ActionForm action={archivePlanAction.bind(null, p.id, !p.archivedAt)} submitLabel={p.archivedAt ? "استعادة" : "أرشفة"} tone="ghost" inline />}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
