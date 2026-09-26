import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card } from "@/components/ui";
import { PAYMENT_METHOD_LABELS } from "@/server/commerce/checkout";
import { FULFILLMENT_LABELS, getOrder, PAYMENT_STATUS_LABELS } from "@/server/commerce/orders";
import { formatMoney } from "@/server/lib/money";
import { getStorage } from "@/server/storage";
import { roleHas } from "@/server/stores/permissions";
import { loadStore } from "../../access";
import { FULFILLMENT_TONES, PAYMENT_TONES } from "../labels";
import { NoteForm, OrderActions } from "./actions-panel";

export const metadata: Metadata = { title: "تفاصيل الطلب" };
const fmt = new Intl.DateTimeFormat("ar-SA-u-nu-latn", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" });

export default async function OrderDetailPage({ params }: PageProps<"/dashboard/[storeId]/orders/[orderId]">) {
  const { storeId, orderId } = await params;
  const { session, access } = await loadStore(storeId);
  const { order, items, events, notes, shipments, refunds, customer } = await getOrder(session.user.id, storeId, orderId);
  const canWrite = roleHas(access.role, "orders.write");
  const money = (v: number) => formatMoney(v, order.currency);
  const addr = order.shippingAddress;
  const waDigits = order.customerSnapshot.phone.replace(/\D/g, "");

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href={`/dashboard/${storeId}/orders`} className="text-sm text-brand">
            → الطلبات
          </Link>
          <h1 className="mt-1 flex flex-wrap items-center gap-2 text-2xl font-bold">
            طلب #{order.number}
            <Badge tone={PAYMENT_TONES[order.paymentStatus]}>{PAYMENT_STATUS_LABELS[order.paymentStatus]}</Badge>
            <Badge tone={FULFILLMENT_TONES[order.fulfillmentStatus]}>{FULFILLMENT_LABELS[order.fulfillmentStatus]}</Badge>
            {order.status === "completed" && <Badge tone="success">مكتمل</Badge>}
          </h1>
          <p className="text-sm text-ink-soft">{fmt.format(order.createdAt)}</p>
        </div>
        <Link href={`/dashboard/${storeId}/orders/${orderId}/invoice`} target="_blank" className="text-sm text-brand">
          طباعة الفاتورة
        </Link>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
        <div className="flex flex-col gap-5">
          <Card>
            <ul className="divide-y divide-line">
              {items.map((i) => (
                <li key={i.id} className="flex items-center gap-3 py-3">
                  <span className="size-14 shrink-0 overflow-hidden rounded-lg bg-muted">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {i.imageKey && <img src={getStorage().url(i.imageKey)} alt="" className="size-full object-cover" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    {i.productId ? (
                      <Link href={`/dashboard/${storeId}/products/${i.productId}`} className="block font-medium hover:text-brand">
                        {i.productName}
                      </Link>
                    ) : (
                      <span className="block font-medium">{i.productName}</span>
                    )}
                    <span className="block text-xs text-ink-soft">
                      {i.variantTitle}
                      {i.sku && <span className="ltr"> · {i.sku}</span>}
                    </span>
                  </span>
                  <span className="text-sm text-ink-soft">
                    {money(i.unitPrice)} × {i.quantity}
                  </span>
                  <span className="w-24 text-end font-medium">{money(i.unitPrice * i.quantity)}</span>
                </li>
              ))}
            </ul>
            <dl className="mt-3 flex flex-col gap-1.5 border-t border-line pt-3 text-sm">
              <div className="flex justify-between"><dt>المجموع</dt><dd>{money(order.subtotal)}</dd></div>
              {order.discountTotal > 0 && <div className="flex justify-between text-emerald-700"><dt>الخصم {order.couponCode && `(${order.couponCode})`}</dt><dd>−{money(order.discountTotal)}</dd></div>}
              <div className="flex justify-between"><dt>الشحن — {order.shippingMethod.name}</dt><dd>{order.shippingTotal ? money(order.shippingTotal) : "مجاني"}</dd></div>
              {order.paymentFee > 0 && <div className="flex justify-between"><dt>رسوم الدفع</dt><dd>{money(order.paymentFee)}</dd></div>}
              {order.taxTotal > 0 && <div className="flex justify-between text-ink-soft"><dt>ضريبة القيمة المضافة ({order.taxRateBps / 100}%){order.pricesIncludeTax ? " مشمولة" : ""}</dt><dd>{money(order.taxTotal)}</dd></div>}
              <div className="flex justify-between text-base font-bold"><dt>الإجمالي</dt><dd>{money(order.total)}</dd></div>
              {order.refundedTotal > 0 && <div className="flex justify-between text-red-700"><dt>المسترد</dt><dd>−{money(order.refundedTotal)}</dd></div>}
              <div className="flex justify-between text-ink-soft"><dt>طريقة الدفع</dt><dd>{PAYMENT_METHOD_LABELS[order.paymentMethod]}</dd></div>
            </dl>
          </Card>

          {canWrite && <OrderActions storeId={storeId} order={{ id: order.id, status: order.status, paymentStatus: order.paymentStatus, paymentMethod: order.paymentMethod, fulfillmentStatus: order.fulfillmentStatus, remaining: order.total - order.refundedTotal, pickup: order.shippingMethod.type === "pickup" }} />}

          <Card>
            <h2 className="mb-3 font-semibold">سجل الطلب</h2>
            <ol className="flex flex-col gap-3 border-s-2 border-line ps-4 text-sm">
              {events.map((e) => (
                <li key={e.id}>
                  <p>{e.message}</p>
                  <p className="text-xs text-ink-soft">
                    {fmt.format(e.createdAt)} · {e.actorType === "customer" ? "العميل" : e.actorType === "provider" ? "بوابة الدفع" : e.actorType === "system" ? "النظام" : "فريق المتجر"}
                  </p>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <div className="flex flex-col gap-5">
          <Card className="flex flex-col gap-2 text-sm">
            <h2 className="font-semibold">العميل</h2>
            {customer ? (
              <Link href={`/dashboard/${storeId}/customers/${customer.id}`} className="font-medium text-brand">
                {order.customerSnapshot.name}
              </Link>
            ) : (
              <p>{order.customerSnapshot.name}</p>
            )}
            <p className="ltr text-end">{order.customerSnapshot.phone}</p>
            {order.customerSnapshot.email && <p className="ltr truncate text-end">{order.customerSnapshot.email}</p>}
            {customer && <p className="text-xs text-ink-soft">{customer.ordersCount} طلبات · {formatMoney(customer.totalSpent)}</p>}
            {waDigits && (
              <a href={`https://wa.me/${waDigits}?text=${encodeURIComponent(`مرحباً ${order.customerSnapshot.name}، بخصوص طلبك #${order.number}`)}`} target="_blank" rel="noopener" className="text-brand">
                مراسلة عبر واتساب
              </a>
            )}
          </Card>
          <Card className="flex flex-col gap-1 text-sm">
            <h2 className="mb-1 font-semibold">{order.shippingMethod.type === "pickup" ? "الاستلام من المتجر" : "عنوان التوصيل"}</h2>
            {order.shippingMethod.type === "pickup" ? (
              <p>{order.shippingMethod.pickupAddress}</p>
            ) : (
              <>
                <p>{[addr.city, addr.district].filter(Boolean).join("، ")}</p>
                {addr.street && <p>{addr.street}</p>}
                {addr.details && <p>{addr.details}</p>}
                {addr.postalCode && <p className="ltr text-end">{addr.postalCode}</p>}
              </>
            )}
            {shipments.map((s) => (
              <p key={s.id} className="mt-2 text-xs text-ink-soft">
                {s.carrier} {s.trackingNumber && <span className="ltr">{s.trackingNumber}</span>}{" "}
                {s.trackingUrl && (
                  <a href={s.trackingUrl} target="_blank" rel="noopener noreferrer" className="text-brand">
                    تتبع
                  </a>
                )}
              </p>
            ))}
          </Card>
          {order.customerNote && (
            <Card className="text-sm">
              <h2 className="mb-1 font-semibold">ملاحظة العميل</h2>
              <p className="whitespace-pre-line">{order.customerNote}</p>
            </Card>
          )}
          {refunds.length > 0 && (
            <Card className="text-sm">
              <h2 className="mb-2 font-semibold">المبالغ المستردة</h2>
              <ul className="flex flex-col gap-1">
                {refunds.map((r) => (
                  <li key={r.id} className="flex justify-between">
                    <span>{r.reason || "استرداد"}</span>
                    <span>{money(r.amount)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <Card className="flex flex-col gap-3 text-sm">
            <h2 className="font-semibold">ملاحظات داخلية</h2>
            <p className="text-xs text-ink-soft">لا تظهر للعميل.</p>
            {notes.map((n) => (
              <div key={n.id} className="rounded-lg bg-muted p-2">
                <p className="whitespace-pre-line">{n.body}</p>
                <p className="text-[11px] text-ink-soft">
                  {n.author ?? "—"} · {fmt.format(n.createdAt)}
                </p>
              </div>
            ))}
            <NoteForm storeId={storeId} orderId={order.id} />
          </Card>
        </div>
      </div>
    </div>
  );
}
