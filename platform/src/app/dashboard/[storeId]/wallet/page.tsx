import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ButtonLink, Card, Pagination, Stat } from "@/components/ui";
import { formatMoney } from "@/server/lib/money";
import { roleHas } from "@/server/stores/permissions";
import { getWallet, WALLET_TYPE_LABELS } from "@/server/wallet/service";
import { loadStore } from "../access";

export const metadata: Metadata = { title: "العمليات" };

const dateFmt = new Intl.DateTimeFormat("ar-SA-u-nu-latn-ca-gregory", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" });
const dayFmt = new Intl.DateTimeFormat("ar-SA-u-nu-latn-ca-gregory", { dateStyle: "medium", timeZone: "Asia/Riyadh" });

export default async function WalletPage({ params, searchParams }: PageProps<"/dashboard/[storeId]/wallet">) {
  const { storeId } = await params;
  const sp = await searchParams;
  const { session, access } = await loadStore(storeId);
  if (!roleHas(access.role, "billing.read")) notFound();
  const page = Math.max(1, Number(sp.page) || 1);
  const w = await getWallet(session.user.id, storeId, page);
  const now = new Date();

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">العمليات</h1>
          <p className="text-sm text-ink-soft">سجل رصيدك من المدفوعات الإلكترونية: كل عملية بيع ورسوم وسحب.</p>
        </div>
        <ButtonLink href={`/dashboard/${storeId}/wallet/withdrawals`}>طلب سحب</ButtonLink>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="قابل للسحب" value={formatMoney(w.available)} />
        <Stat label="معلّق" value={formatMoney(w.pending)} hint={`يصبح متاحاً بعد ${w.settings.payoutHoldDays} أيام من الدفع`} />
        <Stat label="إجمالي المبيعات الإلكترونية" value={formatMoney(w.sales)} />
        <Stat label="رسوم الدفع" value={formatMoney(w.fees)} hint={`${(w.settings.onlinePaymentFeeBps / 100).toLocaleString("en")}% من كل عملية`} />
      </div>
      <Card className="p-0">
        {w.transactions.length === 0 ? (
          <div className="p-6 text-center text-sm text-ink-soft">
            <p className="font-medium text-ink">لا توجد عمليات بعد</p>
            <p className="mt-1">تظهر هنا الطلبات المدفوعة إلكترونياً. الدفع عند الاستلام والتحويل البنكي يصلك مباشرة ولا يمر بالرصيد.</p>
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {w.transactions.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{t.description}</p>
                  <p className="text-xs text-ink-soft">
                    {WALLET_TYPE_LABELS[t.type]} · {dateFmt.format(t.createdAt)}
                    {t.amount > 0 && t.availableAt > now && ` · متاح من ${dayFmt.format(t.availableAt)}`}
                  </p>
                </div>
                <span className={`ltr font-semibold ${t.amount < 0 ? "text-red-700" : "text-emerald-700"}`}>
                  {t.amount > 0 ? "+" : "−"}
                  {formatMoney(Math.abs(t.amount))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Pagination page={page} pageCount={w.pageCount} href={(p) => `/dashboard/${storeId}/wallet?page=${p}`} />
    </div>
  );
}
