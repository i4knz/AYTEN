import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PAYMENT_METHOD_LABELS } from "@/server/commerce/checkout";
import { getCheckoutOptions } from "@/server/commerce/checkout";
import { FULFILLMENT_LABELS, getOrderForShopper, PAYMENT_STATUS_LABELS } from "@/server/commerce/orders";
import { formatMoney } from "@/server/lib/money";
import { getStorage } from "@/server/storage";
import { RetryPayment } from "./retry";
import { ReviewForm } from "./review-form";
import { PurchaseEvent } from "../../tracking";
import { reviewedProductIds } from "@/server/design/reviews";
import { loadStorefront, loadStoreSettings } from "../../data";

export const metadata: Metadata = { title: "حالة الطلب", robots: { index: false }, referrer: "no-referrer" };

const dateFmt = new Intl.DateTimeFormat("ar-SA-u-nu-latn", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" });
const STEPS = ["unfulfilled", "processing", "shipped", "delivered"] as const;

export default async function OrderPage({ params, searchParams }: PageProps<"/s/[slug]/orders/[number]">) {
  const { slug, number } = await params;
  const sp = await searchParams;
  const store = await loadStorefront(slug);
  if (!store) notFound();
  const data = await getOrderForShopper(store.id, Number(number), typeof sp.key === "string" ? sp.key : "");
  if (!data) notFound();
  const { order, items, events, shipments } = data;
  const cancelled = order.status === "cancelled";
  const stepIndex = order.fulfillmentStatus === "ready" ? 1 : STEPS.indexOf(order.fulfillmentStatus as (typeof STEPS)[number]);
  const bank = order.paymentMethod === "bank_transfer" && order.paymentStatus === "awaiting_transfer" ? (await getCheckoutOptions(store.id)).bankTransfer : null;
  const settings = await loadStoreSettings(store.id);
  const reviewable =
    settings.features.reviews && order.fulfillmentStatus === "delivered"
      ? (() => {
          const seen = new Set<string>();
          return items.filter((i) => i.productId && !seen.has(i.productId) && seen.add(i.productId));
        })()
      : [];
  const reviewed = reviewable.length ? new Set(await reviewedProductIds(store.id, order.id)) : new Set<string>();
  const canPay = order.paymentMethod === "online" && !cancelled && ["pending", "failed"].includes(order.paymentStatus);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      {sp.new === "1" && !cancelled && <PurchaseEvent id={String(order.number)} value={order.total} currency={order.currency} />}
      {sp.new === "1" && !cancelled && (
        <div className="rounded-(--radius) bg-(--store) p-6 text-center text-(--on-store)">
          <p className="text-3xl">✓</p>
          <h1 className="text-xl font-bold">شكراً لك! تم استلام طلبك</h1>
          <p className="text-sm opacity-90">احتفظ بهذه الصفحة لمتابعة حالة الطلب.</p>
        </div>
      )}
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-2xl font-bold">طلب #{order.number}</h2>
        <span className="text-sm text-ink-soft">{dateFmt.format(order.createdAt)}</span>
      </div>

      {cancelled ? (
        <div className="rounded-(--radius) border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          الطلب ملغي{order.cancelReason ? `: ${order.cancelReason}` : "."}
        </div>
      ) : (
        <ol className="grid grid-cols-4 gap-2 text-center text-xs" aria-label="مراحل الطلب">
          {STEPS.map((s, i) => (
            <li key={s} className="flex flex-col items-center gap-1.5">
              <span className={`h-1.5 w-full rounded-full ${i <= stepIndex ? "bg-(--store)" : "bg-muted"}`} />
              <span className={i <= stepIndex ? "font-semibold" : "text-ink-soft"}>{s === "shipped" && order.shippingMethod.type === "pickup" ? "جاهز للاستلام" : FULFILLMENT_LABELS[s]}</span>
            </li>
          ))}
        </ol>
      )}

      {canPay && (
        <div className="flex flex-col gap-3 rounded-(--radius) border border-amber-200 bg-amber-50 p-4 text-sm">
          <p>{order.paymentStatus === "failed" ? "لم تكتمل عملية الدفع. يمكنك المحاولة مرة أخرى." : "الطلب بانتظار الدفع."}</p>
          <RetryPayment slug={slug} number={order.number} accessKey={order.accessKey} />
        </div>
      )}

      {bank && (
        <div className="flex flex-col gap-1 rounded-(--radius) border border-line p-4 text-sm">
          <h3 className="mb-1 font-semibold">بيانات التحويل البنكي</h3>
          <p>البنك: {bank.bankName}</p>
          <p>اسم الحساب: {bank.accountName}</p>
          <p>
            الآيبان: <span className="ltr font-mono">{bank.iban}</span>
          </p>
          <p>
            المبلغ: <strong>{formatMoney(order.total, order.currency)}</strong> — اكتب رقم الطلب #{order.number} في ملاحظة التحويل.
          </p>
        </div>
      )}

      {shipments.map((s) => (
        <div key={s.id} className="rounded-(--radius) border border-line p-4 text-sm">
          <p>
            {s.carrier ? `شركة الشحن: ${s.carrier}` : "تم الشحن"}
            {s.trackingNumber && (
              <>
                {" "}— رقم التتبع: <span className="ltr font-mono">{s.trackingNumber}</span>
              </>
            )}
          </p>
          {s.trackingUrl && (
            <a href={s.trackingUrl} target="_blank" rel="noopener noreferrer" className="text-(--store) underline">
              تتبع الشحنة
            </a>
          )}
        </div>
      ))}

      <section className="rounded-(--radius) border border-line p-4">
        <ul className="flex flex-col gap-3 text-sm">
          {items.map((i) => (
            <li key={i.id} className="flex items-center gap-3">
              <span className="size-12 shrink-0 overflow-hidden rounded-lg bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {i.imageKey && <img src={getStorage().url(i.imageKey)} alt="" className="size-full object-cover" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block">{i.productName} × {i.quantity}</span>
                {i.variantTitle && <span className="block text-xs text-ink-soft">{i.variantTitle}</span>}
              </span>
              <span>{formatMoney(i.unitPrice * i.quantity, order.currency)}</span>
            </li>
          ))}
        </ul>
        <dl className="mt-4 flex flex-col gap-1.5 border-t border-line pt-3 text-sm">
          <div className="flex justify-between"><dt>المجموع</dt><dd>{formatMoney(order.subtotal, order.currency)}</dd></div>
          {order.discountTotal > 0 && <div className="flex justify-between text-emerald-700"><dt>الخصم</dt><dd>−{formatMoney(order.discountTotal, order.currency)}</dd></div>}
          <div className="flex justify-between"><dt>الشحن ({order.shippingMethod.name})</dt><dd>{order.shippingTotal ? formatMoney(order.shippingTotal, order.currency) : "مجاني"}</dd></div>
          {order.paymentFee > 0 && <div className="flex justify-between"><dt>رسوم الدفع</dt><dd>{formatMoney(order.paymentFee, order.currency)}</dd></div>}
          {order.taxTotal > 0 && <div className="flex justify-between text-ink-soft"><dt>ضريبة القيمة المضافة</dt><dd>{formatMoney(order.taxTotal, order.currency)}</dd></div>}
          <div className="flex justify-between font-bold"><dt>الإجمالي</dt><dd>{formatMoney(order.total, order.currency)}</dd></div>
          <div className="flex justify-between text-ink-soft">
            <dt>الدفع</dt>
            <dd>
              {PAYMENT_METHOD_LABELS[order.paymentMethod]} — {PAYMENT_STATUS_LABELS[order.paymentStatus]}
            </dd>
          </div>
        </dl>
      </section>

      {reviewable.length > 0 && (
        <section className="flex flex-col gap-3 rounded-(--radius) border border-line p-4">
          <h3 className="font-semibold">قيّم مشترياتك</h3>
          {reviewable.map((i) =>
            reviewed.has(i.productId!) ? (
              <p key={i.id} className="text-sm text-ink-soft">✓ قيّمت «{i.productName}». شكراً لك!</p>
            ) : (
              <ReviewForm key={i.id} slug={slug} number={order.number} accessKey={order.accessKey} productId={i.productId!} productName={i.productName} />
            ),
          )}
        </section>
      )}

      <section>
        <h3 className="mb-3 font-semibold">سجل الطلب</h3>
        <ol className="flex flex-col gap-2 border-s-2 border-line ps-4 text-sm">
          {events.map((ev, i) => (
            <li key={i}>
              <p>{ev.message}</p>
              <p className="text-xs text-ink-soft">{dateFmt.format(ev.createdAt)}</p>
            </li>
          ))}
        </ol>
      </section>
      <Link href="/" className="text-center text-sm text-ink-soft">
        العودة للمتجر
      </Link>
    </div>
  );
}
