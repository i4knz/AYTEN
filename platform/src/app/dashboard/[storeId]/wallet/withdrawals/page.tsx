import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Alert, Badge, Card, Stat } from "@/components/ui";
import { maskIban } from "@/server/lib/iban";
import { formatMoney } from "@/server/lib/money";
import { roleHas } from "@/server/stores/permissions";
import { listPayouts, PAYOUT_STATUS_LABELS } from "@/server/wallet/service";
import { loadStore } from "../../access";
import { CancelPayout, PayoutForm } from "./forms";

export const metadata: Metadata = { title: "طلبات السحب" };

const dateFmt = new Intl.DateTimeFormat("ar-SA-u-nu-latn-ca-gregory", { dateStyle: "medium", timeZone: "Asia/Riyadh" });
const TONES = { pending: "warning", approved: "info", paid: "success", rejected: "danger", cancelled: "neutral" } as const;

export default async function WithdrawalsPage({ params }: PageProps<"/dashboard/[storeId]/wallet/withdrawals">) {
  const { storeId } = await params;
  const { session, access } = await loadStore(storeId);
  if (!roleHas(access.role, "billing.read")) notFound();
  const data = await listPayouts(session.user.id, storeId);
  const canManage = roleHas(access.role, "billing.manage");

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold">طلبات السحب</h1>
        <p className="text-sm text-ink-soft">حوّل رصيدك المتاح إلى حسابك البنكي.</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Stat label="قابل للسحب" value={formatMoney(data.available)} />
        <Stat label="الحد الأدنى للسحب" value={formatMoney(data.minPayout)} />
      </div>
      {canManage &&
        (data.open ? (
          <Alert tone="info">لديك طلب سحب قيد المعالجة بمبلغ {formatMoney(data.open.amount)}. يمكنك تقديم طلب جديد بعد اكتماله.</Alert>
        ) : data.available < data.minPayout ? (
          <Alert tone="info">يمكنك طلب السحب عندما يصل رصيدك المتاح إلى {formatMoney(data.minPayout)}.</Alert>
        ) : (
          <Card>
            <h2 className="mb-3 font-semibold">طلب سحب جديد</h2>
            <PayoutForm storeId={storeId} max={formatMoney(data.available)} />
          </Card>
        ))}
      <Card className="p-0">
        <h2 className="px-4 pt-4 font-semibold">السجل</h2>
        {data.payouts.length === 0 ? (
          <p className="p-4 text-sm text-ink-soft">لم تطلب أي سحب بعد.</p>
        ) : (
          <ul className="divide-y divide-line">
            {data.payouts.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
                <div>
                  <p className="font-semibold">{formatMoney(p.amount)}</p>
                  <p className="text-xs text-ink-soft">
                    {dateFmt.format(p.createdAt)} · {p.bankName} · <span className="ltr inline-block">{maskIban(p.iban)}</span>
                  </p>
                  {p.transferReference && <p className="text-xs">مرجع التحويل: {p.transferReference}</p>}
                  {p.adminNote && <p className="text-xs text-red-700">{p.adminNote}</p>}
                </div>
                <div className="flex items-center gap-3">
                  <Badge tone={TONES[p.status]}>{PAYOUT_STATUS_LABELS[p.status]}</Badge>
                  {canManage && p.status === "pending" && <CancelPayout storeId={storeId} payoutId={p.id} />}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
