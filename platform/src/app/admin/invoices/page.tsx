import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { Badge, Card, Input, Select, Tabs } from "@/components/ui";
import { listInvoicesAdmin } from "@/server/admin/finance";
import { formatMoney } from "@/server/lib/money";
import { loadAdmin } from "../access";
import { markInvoicePaidAction, voidInvoiceAction } from "../actions";
import { dateFmt } from "../format";

export const metadata: Metadata = { title: "الفواتير والاشتراكات" };

const STATUS = { issued: { label: "بانتظار الدفع", tone: "warning" }, paid: { label: "مدفوعة", tone: "success" }, void: { label: "ملغاة", tone: "neutral" } } as const;
const METHOD = { bank_transfer: "تحويل بنكي", gateway: "بوابة دفع", waived: "إعفاء" } as const;

export default async function AdminInvoicesPage({ searchParams }: PageProps<"/admin/invoices">) {
  const { session } = await loadAdmin("billing.manage");
  const sp = await searchParams;
  const status = typeof sp.status === "string" ? sp.status : "issued";
  const rows = await listInvoicesAdmin(session.user.id, status === "all" ? undefined : status);
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold">الفواتير والاشتراكات</h1>
        <p className="text-sm text-ink-soft">طابق التحويل البنكي مع رقم الفاتورة ثم أكّد الدفع؛ يتفعّل الاشتراك فوراً ويُشعر التاجر.</p>
      </div>
      <Tabs
        current={status}
        items={[
          { key: "issued", label: "بانتظار الدفع", href: "/admin/invoices?status=issued" },
          { key: "paid", label: "مدفوعة", href: "/admin/invoices?status=paid" },
          { key: "void", label: "ملغاة", href: "/admin/invoices?status=void" },
          { key: "all", label: "الكل", href: "/admin/invoices?status=all" },
        ]}
      />
      {rows.length === 0 ? (
        <Card className="text-center text-sm text-ink-soft">لا توجد فواتير.</Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map(({ invoice: i, storeName }) => (
            <li key={i.id}>
              <Card className="flex flex-col gap-3 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold">
                      فاتورة {i.number} · <Link href={`/admin/stores/${i.storeId}`} className="text-brand">{storeName}</Link>
                    </p>
                    <p className="text-xs text-ink-soft">
                      {i.planName} · {i.billingInterval === "monthly" ? "شهري" : "سنوي"} · {dateFmt.format(i.createdAt)}
                      {i.paymentMethod && ` · ${METHOD[i.paymentMethod]}`}
                      {i.paymentReference && ` · مرجع ${i.paymentReference}`}
                      {i.voidedReason && ` · ${i.voidedReason}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-lg font-bold">{formatMoney(i.total, i.currency)}</span>
                    <Badge tone={STATUS[i.status].tone}>{STATUS[i.status].label}</Badge>
                  </div>
                </div>
                {i.status === "issued" && (
                  <div className="flex flex-wrap gap-4 border-t border-line pt-3">
                    <ActionForm action={markInvoicePaidAction.bind(null, i.id)} submitLabel="تأكيد الدفع" inline confirmText={`تأكيد استلام ${formatMoney(i.total)} للفاتورة ${i.number}؟`}>
                      <Select name="method" aria-label="طريقة الدفع" className="w-auto" defaultValue="bank_transfer">
                        <option value="bank_transfer">تحويل بنكي</option>
                        <option value="waived">إعفاء</option>
                      </Select>
                      <Input name="reference" placeholder="مرجع التحويل" aria-label="مرجع التحويل" className="w-44" />
                    </ActionForm>
                    <ActionForm action={voidInvoiceAction.bind(null, i.id)} submitLabel="إلغاء الفاتورة" tone="secondary" inline>
                      <Input name="reason" placeholder="سبب الإلغاء" aria-label="سبب الإلغاء" className="w-44" />
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
