import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/print-button";
import { getInvoice } from "@/server/billing/service";
import { AppError } from "@/server/lib/errors";
import { formatMoney } from "@/server/lib/money";
import { roleHas } from "@/server/stores/permissions";
import { loadStore } from "../../../access";

export const metadata: Metadata = { title: "فاتورة الاشتراك" };

const dateFmt = new Intl.DateTimeFormat("ar-SA-u-nu-latn-ca-gregory", { dateStyle: "long", timeZone: "Asia/Riyadh" });

export default async function PlatformInvoicePage({ params }: PageProps<"/dashboard/[storeId]/billing/invoices/[invoiceId]">) {
  const { storeId, invoiceId } = await params;
  const { session, access } = await loadStore(storeId);
  if (!roleHas(access.role, "billing.read")) notFound();
  const data = await getInvoice(session.user.id, storeId, invoiceId).catch((err) => {
    if (err instanceof AppError && err.code === "not_found") notFound();
    throw err;
  });
  const { invoice, billing } = data;
  const status = { issued: "بانتظار الدفع", paid: "مدفوعة", void: "ملغاة" }[invoice.status];
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <div className="flex items-center justify-between print:hidden">
        <h1 className="text-2xl font-bold">فاتورة {invoice.number}</h1>
        <PrintButton />
      </div>
      <article className="rounded-2xl border border-line bg-surface p-6 text-sm leading-7 print:border-0 print:p-0">
        <header className="flex flex-wrap justify-between gap-4 border-b border-line pb-4">
          <div>
            <p className="text-lg font-bold">فاتورة اشتراك</p>
            <p>رقم الفاتورة: {invoice.number}</p>
            <p>التاريخ: {dateFmt.format(invoice.createdAt)}</p>
            <p>الحالة: {status}</p>
          </div>
          <div className="text-end">
            <p className="font-semibold">صادرة إلى</p>
            <p>{access.store.name}</p>
            {billing.vatNumber && <p>الرقم الضريبي للمنصة: {billing.vatNumber}</p>}
          </div>
        </header>
        <table className="mt-4 w-full">
          <thead>
            <tr className="text-ink-soft">
              <th className="py-2 text-start font-medium">البند</th>
              <th className="py-2 text-end font-medium">المبلغ</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-line">
              <td className="py-2">
                {invoice.planName} — اشتراك {invoice.billingInterval === "monthly" ? "شهري" : "سنوي"}
              </td>
              <td className="py-2 text-end">{formatMoney(invoice.subtotal, invoice.currency)}</td>
            </tr>
            {invoice.tax > 0 && (
              <tr className="border-t border-line">
                <td className="py-2">ضريبة القيمة المضافة</td>
                <td className="py-2 text-end">{formatMoney(invoice.tax, invoice.currency)}</td>
              </tr>
            )}
            <tr className="border-t-2 border-ink font-bold">
              <td className="py-2">الإجمالي</td>
              <td className="py-2 text-end">{formatMoney(invoice.total, invoice.currency)}</td>
            </tr>
          </tbody>
        </table>
        {invoice.status === "paid" && invoice.paidAt && (
          <p className="mt-4">
            دُفعت في {dateFmt.format(invoice.paidAt)}
            {invoice.paymentReference ? ` — مرجع: ${invoice.paymentReference}` : ""}
          </p>
        )}
        {invoice.status === "void" && invoice.voidedReason && <p className="mt-4">سبب الإلغاء: {invoice.voidedReason}</p>}
        {invoice.status === "issued" && billing.iban && (
          <p className="mt-4">
            الدفع بالتحويل إلى {billing.bankName} — {billing.accountName} — <span className="ltr inline-block font-mono">{billing.iban}</span>، مع كتابة رقم الفاتورة في وصف التحويل.
          </p>
        )}
        <p className="mt-6 text-xs text-ink-soft">
          هذه فاتورة اشتراك في خدمة المنصة. الصيغة الضريبية الكاملة (الفاتورة الإلكترونية) تعتمد على تسجيل المنصة في ضريبة القيمة المضافة [يحتاج تحقق].
        </p>
      </article>
    </div>
  );
}
