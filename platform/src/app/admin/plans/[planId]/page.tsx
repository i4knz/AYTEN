import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { Card, Field, Input } from "@/components/ui";
import { getPlanAdmin } from "@/server/admin/platform";
import { AppError } from "@/server/lib/errors";
import { toMajorString } from "@/server/lib/money";
import { loadAdmin } from "../../access";
import { savePlanAction } from "../../actions";

export const metadata: Metadata = { title: "الباقة" };

export default async function AdminPlanPage({ params }: PageProps<"/admin/plans/[planId]">) {
  const { planId } = await params;
  const { session } = await loadAdmin("billing.manage");
  const plan =
    planId === "new"
      ? null
      : await getPlanAdmin(session.user.id, planId).catch((err) => {
          if (err instanceof AppError && err.code === "not_found") notFound();
          throw err;
        });
  const lim = (v: number | null | undefined) => (v == null ? "" : String(v));
  const check = (name: string, label: string, checked: boolean) => (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" name={name} defaultChecked={checked} className="size-4 accent-brand" />
      {label}
    </label>
  );
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <Link href="/admin/plans" className="text-sm text-brand">
        → الباقات
      </Link>
      <h1 className="text-2xl font-bold">{plan ? plan.name : "باقة جديدة"}</h1>
      <Card>
        <ActionForm action={savePlanAction.bind(null, plan?.id ?? null)} submitLabel="حفظ الباقة">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="الاسم" name="name">
              <Input id="name" name="name" required defaultValue={plan?.name} />
            </Field>
            <Field label="المعرّف (إنجليزي)" name="key" hint="يُستخدم داخلياً ولا يظهر للتجار">
              <Input id="key" name="key" dir="ltr" required pattern="[a-z0-9_]{2,30}" defaultValue={plan?.key} />
            </Field>
          </div>
          <Field label="الوصف" name="description">
            <Input id="description" name="description" maxLength={300} defaultValue={plan?.description} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-4">
            <Field label="السعر الشهري (ر.س)" name="priceMonthly">
              <Input id="priceMonthly" name="priceMonthly" inputMode="decimal" dir="ltr" defaultValue={plan ? toMajorString(plan.priceMonthly) : ""} />
            </Field>
            <Field label="السعر السنوي (ر.س)" name="priceYearly">
              <Input id="priceYearly" name="priceYearly" inputMode="decimal" dir="ltr" defaultValue={plan ? toMajorString(plan.priceYearly) : ""} />
            </Field>
            <Field label="أيام التجربة" name="trialDays">
              <Input id="trialDays" name="trialDays" type="number" min={0} max={365} defaultValue={plan?.trialDays ?? 14} />
            </Field>
            <Field label="الترتيب" name="position">
              <Input id="position" name="position" type="number" min={0} max={100} defaultValue={plan?.position ?? 0} />
            </Field>
          </div>
          <fieldset className="grid gap-4 rounded-xl border border-line p-4 sm:grid-cols-3">
            <legend className="px-1 text-sm font-semibold">الحدود (فارغ = غير محدود)</legend>
            <Field label="المنتجات" name="products">
              <Input id="products" name="products" inputMode="numeric" dir="ltr" defaultValue={lim(plan?.limits.products)} />
            </Field>
            <Field label="الموظفون" name="staff">
              <Input id="staff" name="staff" inputMode="numeric" dir="ltr" defaultValue={lim(plan?.limits.staff)} />
            </Field>
            <Field label="الطلبات شهرياً" name="ordersPerMonth">
              <Input id="ordersPerMonth" name="ordersPerMonth" inputMode="numeric" dir="ltr" defaultValue={lim(plan?.limits.ordersPerMonth)} />
            </Field>
          </fieldset>
          <fieldset className="flex flex-wrap gap-5 rounded-xl border border-line p-4">
            <legend className="px-1 text-sm font-semibold">المزايا</legend>
            {check("campaigns", "الحملات البريدية", !!plan?.features.campaigns)}
            {check("advancedReports", "التقارير المتقدمة", plan ? !!plan.features.advancedReports : true)}
            {check("removeBranding", "إخفاء شعار المنصة", !!plan?.features.removeBranding)}
            {check("isPublic", "تظهر للتجار في صفحة الاشتراك", plan ? plan.isPublic : true)}
          </fieldset>
        </ActionForm>
      </Card>
    </div>
  );
}
