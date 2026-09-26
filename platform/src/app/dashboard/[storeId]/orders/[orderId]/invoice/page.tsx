import type { Metadata } from "next";
import QRCode from "qrcode";
import { PAYMENT_METHOD_LABELS } from "@/server/commerce/checkout";
import { getOrder } from "@/server/commerce/orders";
import { VAT_NUMBER_PATTERN, zatcaQrPayload } from "@/server/commerce/zatca";
import { formatMoney } from "@/server/lib/money";
import { getStoreSettings } from "@/server/stores/service";
import { loadStore } from "../../../access";
import { PrintButton } from "./print-button";

export const metadata: Metadata = { title: "فاتورة" };
const fmt = new Intl.DateTimeFormat("ar-SA-u-nu-latn", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" });

export default async function InvoicePage({ params }: PageProps<"/dashboard/[storeId]/orders/[orderId]/invoice">) {
  const { storeId, orderId } = await params;
  const { session, access } = await loadStore(storeId);
  const [{ order, items }, settings] = await Promise.all([getOrder(session.user.id, storeId, orderId), getStoreSettings(access)]);
  const vatNumber = settings.vatNumber && VAT_NUMBER_PATTERN.test(settings.vatNumber) ? settings.vatNumber : null;
  const isTaxInvoice = Boolean(vatNumber && order.taxRateBps > 0);
  const qrSvg = isTaxInvoice
    ? await QRCode.toString(zatcaQrPayload({ sellerName: access.store.name, vatNumber: vatNumber!, timestamp: order.createdAt, total: order.total, vat: order.taxTotal }), { type: "svg", margin: 0, width: 128 })
    : null;
  const money = (v: number) => formatMoney(v, order.currency);

  return (
    <div className="mx-auto max-w-3xl bg-white p-8 text-sm text-black print:p-0">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold">{isTaxInvoice ? "فاتورة ضريبية مبسطة" : "ملخص الطلب"}</h1>
          <p>رقم: {order.number}</p>
          <p>التاريخ: {fmt.format(order.createdAt)}</p>
        </div>
        <div className="text-end">
          <p className="text-lg font-semibold">{access.store.name}</p>
          {vatNumber && <p>الرقم الضريبي: <span className="ltr">{vatNumber}</span></p>}
          {settings.commercialRegistration && <p>السجل التجاري: <span className="ltr">{settings.commercialRegistration}</span></p>}
        </div>
      </div>
      <div className="mb-6">
        <p className="font-semibold">العميل</p>
        <p>{order.customerSnapshot.name} — <span className="ltr">{order.customerSnapshot.phone}</span></p>
        {order.shippingMethod.type !== "pickup" && <p>{[order.shippingAddress.city, order.shippingAddress.district, order.shippingAddress.street].filter(Boolean).join("، ")}</p>}
      </div>
      <table className="mb-6 w-full border-collapse">
        <thead>
          <tr className="border-b border-black text-start">
            <th className="py-2 text-start">المنتج</th>
            <th className="py-2">الكمية</th>
            <th className="py-2">السعر</th>
            <th className="py-2 text-end">الإجمالي</th>
          </tr>
        </thead>
        <tbody>
          {items.map((i) => (
            <tr key={i.id} className="border-b border-gray-300">
              <td className="py-2">
                {i.productName}
                {i.variantTitle && <span className="text-gray-600"> — {i.variantTitle}</span>}
              </td>
              <td className="py-2 text-center">{i.quantity}</td>
              <td className="py-2 text-center">{money(i.unitPrice)}</td>
              <td className="py-2 text-end">{money(i.unitPrice * i.quantity)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex items-end justify-between gap-6">
        {qrSvg ? <div className="size-32" aria-label="رمز QR للفاتورة" dangerouslySetInnerHTML={{ __html: qrSvg }} /> : <span />}
        <dl className="w-64">
          <div className="flex justify-between"><dt>المجموع</dt><dd>{money(order.subtotal)}</dd></div>
          {order.discountTotal > 0 && <div className="flex justify-between"><dt>الخصم</dt><dd>−{money(order.discountTotal)}</dd></div>}
          <div className="flex justify-between"><dt>الشحن</dt><dd>{money(order.shippingTotal)}</dd></div>
          {order.paymentFee > 0 && <div className="flex justify-between"><dt>رسوم الدفع</dt><dd>{money(order.paymentFee)}</dd></div>}
          {order.taxRateBps > 0 && (
            <div className="flex justify-between"><dt>ضريبة القيمة المضافة {order.taxRateBps / 100}%{order.pricesIncludeTax ? " (مشمولة)" : ""}</dt><dd>{money(order.taxTotal)}</dd></div>
          )}
          <div className="mt-1 flex justify-between border-t border-black pt-1 font-bold"><dt>الإجمالي</dt><dd>{money(order.total)}</dd></div>
          <div className="flex justify-between text-gray-600"><dt>الدفع</dt><dd>{PAYMENT_METHOD_LABELS[order.paymentMethod]}</dd></div>
        </dl>
      </div>
      {!isTaxInvoice && <p className="mt-8 text-xs text-gray-500">هذا المستند ملخص للطلب وليس فاتورة ضريبية. لإصدار فاتورة ضريبية أدخل الرقم الضريبي وفعّل الضريبة من إعدادات المتجر.</p>}
      <PrintButton />
    </div>
  );
}
