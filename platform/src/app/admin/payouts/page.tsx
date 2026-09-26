import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { Alert, Badge, Card, Input, Tabs } from "@/components/ui";
import { listPayoutsAdmin } from "@/server/admin/finance";
import { formatMoney } from "@/server/lib/money";
import { PAYOUT_STATUS_LABELS } from "@/server/wallet/service";
import { loadAdmin } from "../access";
import { processPayoutAction } from "../actions";
import { dateTimeFmt } from "../format";

export const metadata: Metadata = { title: "طلبات السحب" };

const TONES = { pending: "warning", approved: "info", paid: "success", rejected: "danger", cancelled: "neutral" } as const;

export default async function AdminPayoutsPage({ searchParams }: PageProps<"/admin/payouts">) {
  const { session } = await loadAdmin("payouts.manage");
  const sp = await searchParams;
  const status = typeof sp.status === "string" ? sp.status : "open";
  const rows = await listPayoutsAdmin(session.user.id, status === "all" ? undefined : status);
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <h1 className="text-2xl font-bold">طلبات السحب</h1>
      <Alert tone="info">
        المبلغ محجوز من رصيد التاجر منذ لحظة الطلب. حوّل من حساب التسوية ثم سجّل مرجع التحويل. الرفض يعيد المبلغ للرصيد تلقائياً. تأكد أن اسم صاحب الآيبان يطابق التاجر.
      </Alert>
      <Tabs
        current={status}
        items={[
          { key: "open", label: "قيد المعالجة", href: "/admin/payouts?status=open" },
          { key: "paid", label: "محوّلة", href: "/admin/payouts?status=paid" },
          { key: "rejected", label: "مرفوضة", href: "/admin/payouts?status=rejected" },
          { key: "all", label: "الكل", href: "/admin/payouts?status=all" },
        ]}
      />
      {rows.length === 0 ? (
        <Card className="text-center text-sm text-ink-soft">لا توجد طلبات.</Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map(({ payout: p, storeName, ownerName, balance }) => (
            <li key={p.id}>
              <Card className="flex flex-col gap-3 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="text-sm">
                    <p className="font-semibold">
                      <Link href={`/admin/stores/${p.storeId}`} className="text-brand">
                        {storeName}
                      </Link>{" "}
                      · {ownerName}
                    </p>
                    <p className="text-ink-soft">
                      {p.bankName} · {p.accountName} · <span className="ltr inline-block font-mono">{p.iban}</span>
                    </p>
                    <p className="text-xs text-ink-soft">
                      طُلب {dateTimeFmt.format(p.createdAt)} · رصيد المتجر بعد الحجز {formatMoney(Number(balance))}
                      {p.transferReference && ` · مرجع ${p.transferReference}`}
                      {p.adminNote && ` · ${p.adminNote}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-lg font-bold">{formatMoney(p.amount)}</span>
                    <Badge tone={TONES[p.status]}>{PAYOUT_STATUS_LABELS[p.status]}</Badge>
                  </div>
                </div>
                {(p.status === "pending" || p.status === "approved") && (
                  <div className="flex flex-wrap gap-4 border-t border-line pt-3">
                    {p.status === "pending" && <ActionForm action={processPayoutAction.bind(null, p.id, "approve")} submitLabel="اعتماد" tone="secondary" inline />}
                    <ActionForm action={processPayoutAction.bind(null, p.id, "pay")} submitLabel="تم التحويل" inline confirmText={`تأكيد تحويل ${formatMoney(p.amount)}؟`}>
                      <Input name="reference" placeholder="مرجع التحويل" aria-label="مرجع التحويل" className="w-44" />
                    </ActionForm>
                    <ActionForm action={processPayoutAction.bind(null, p.id, "reject")} submitLabel="رفض" tone="danger" inline>
                      <Input name="note" placeholder="سبب الرفض (يظهر للتاجر)" aria-label="سبب الرفض" className="w-56" />
                    </ActionForm>
                  </div>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
