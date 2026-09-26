"use client";

import { useActionState, useRef, useState } from "react";
import { priceOrder, type PricingCoupon, type PricingLine } from "@/server/commerce/pricing";
import { formatMoney } from "@/server/lib/money";
import type { FormState } from "@/server/web";
import { placeOrderAction, saveContactAction } from "../actions";

type Method = { id: string; name: string; type: "flat" | "free_over" | "pickup"; price: number; freeThreshold: number | null; cities: string[]; estimatedDays: string | null; pickupAddress: string | null };
type Payment = { method: "cod" | "bank_transfer" | "online"; label: string; fee: number };

const inputCls = "w-full rounded-(--radius) border border-line bg-surface px-3.5 py-2.5 text-sm outline-none focus:border-(--store) aria-invalid:border-red-400";

function Field({ label, error, children, id }: { label: string; error?: string; children: React.ReactNode; id: string }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  );
}

export function CheckoutForm(props: {
  slug: string;
  idempotencyKey: string;
  cart: { lines: { variantId: string; name: string; variant: string; quantity: number; total: number; imageUrl: string | null }[]; couponCode: string | null };
  pricingInput: { lines: PricingLine[]; coupon: PricingCoupon | null; tax: { enabled: boolean; rateBps: number; pricesIncludeTax: boolean } };
  shippingMethods: Method[];
  paymentMethods: Payment[];
  requireEmail: boolean;
  cities: string[];
  termsUrl: string;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(placeOrderAction.bind(null, props.slug), {});
  const v = state.values ?? {};
  const e = state.fieldErrors ?? {};
  const [city, setCity] = useState(v.city ?? "");
  const [shippingId, setShippingId] = useState(v.shippingMethodId ?? "");
  const [payment, setPayment] = useState<Payment["method"]>((v.paymentMethod as Payment["method"]) ?? props.paymentMethods[0].method);
  const contactSaved = useRef(false);

  const methods = props.shippingMethods.filter((m) => m.cities.length === 0 || m.cities.includes(city.trim()));
  const selected = methods.find((m) => m.id === shippingId) ?? methods[0];
  const fee = props.paymentMethods.find((p) => p.method === payment)?.fee ?? 0;

  // Same pure function the server uses; the server recomputes on submit.
  const pricing = priceOrder({
    lines: props.pricingInput.lines,
    coupon: props.pricingInput.coupon,
    tax: props.pricingInput.tax,
    paymentFee: fee,
    shipping: selected ? { type: selected.type, price: selected.price, freeThreshold: selected.freeThreshold } : null,
  });

  function onContactBlur(form: HTMLFormElement) {
    const fd = new FormData(form);
    const phone = String(fd.get("phone") ?? "");
    if (contactSaved.current || phone.replace(/\D/g, "").length < 9) return;
    contactSaved.current = true;
    void saveContactAction(props.slug, { name: String(fd.get("name") ?? ""), phone, email: String(fd.get("email") ?? "") });
  }

  return (
    <form action={action} className="grid gap-8 lg:grid-cols-[1fr_22rem]" noValidate onBlur={(ev) => onContactBlur(ev.currentTarget)}>
      <input type="hidden" name="idempotencyKey" value={props.idempotencyKey} />
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-bold">إتمام الطلب</h1>
        {state.message && (
          <div role="alert" className="rounded-(--radius) border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {state.message}
          </div>
        )}

        <fieldset className="flex flex-col gap-4">
          <legend className="mb-3 text-lg font-semibold">بيانات التواصل</legend>
          <Field label="الاسم" id="name" error={e.name}>
            <input id="name" name="name" autoComplete="name" required defaultValue={v.name} className={inputCls} aria-invalid={!!e.name} />
          </Field>
          <Field label="رقم الجوال" id="phone" error={e.phone}>
            <input id="phone" name="phone" type="tel" dir="ltr" inputMode="tel" autoComplete="tel" placeholder="05XXXXXXXX" required defaultValue={v.phone} className={inputCls} aria-invalid={!!e.phone} />
          </Field>
          <Field label={props.requireEmail ? "البريد الإلكتروني" : "البريد الإلكتروني (اختياري)"} id="email" error={e.email}>
            <input id="email" name="email" type="email" dir="ltr" autoComplete="email" defaultValue={v.email} className={inputCls} aria-invalid={!!e.email} />
          </Field>
        </fieldset>

        <fieldset className="flex flex-col gap-4">
          <legend className="mb-3 text-lg font-semibold">عنوان التوصيل</legend>
          <Field label="المدينة" id="city" error={e.city}>
            <input id="city" name="city" list="cities" required value={city} onChange={(ev) => setCity(ev.target.value)} className={inputCls} aria-invalid={!!e.city} autoComplete="address-level2" />
            <datalist id="cities">
              {props.cities.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="الحي" id="district" error={e.district}>
              <input id="district" name="district" defaultValue={v.district} className={inputCls} />
            </Field>
            <Field label="الشارع" id="street" error={e.street}>
              <input id="street" name="street" defaultValue={v.street} className={inputCls} autoComplete="address-line1" />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
            <Field label="تفاصيل إضافية (رقم المبنى، معلم قريب)" id="details" error={e.details}>
              <input id="details" name="details" defaultValue={v.details} className={inputCls} />
            </Field>
            <Field label="الرمز البريدي" id="postalCode" error={e.postalCode}>
              <input id="postalCode" name="postalCode" dir="ltr" inputMode="numeric" defaultValue={v.postalCode} className={inputCls} autoComplete="postal-code" />
            </Field>
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-3 text-lg font-semibold">طريقة الشحن</legend>
          {methods.length === 0 ? (
            <p className="text-sm text-red-700">{city ? "لا يوجد شحن متاح لهذه المدينة." : "أدخل المدينة لعرض طرق الشحن."}</p>
          ) : (
            methods.map((m) => {
              const cost = m.type === "pickup" ? 0 : m.type === "free_over" && m.freeThreshold !== null && pricing.subtotal - pricing.discountTotal >= m.freeThreshold ? 0 : m.price;
              return (
                <label key={m.id} className="flex cursor-pointer items-center justify-between gap-3 rounded-(--radius) border border-line p-3 has-checked:border-(--store)">
                  <span className="flex items-center gap-3">
                    <input type="radio" name="shippingMethodId" value={m.id} checked={selected?.id === m.id} onChange={() => setShippingId(m.id)} className="accent-(--store)" />
                    <span>
                      <span className="block text-sm font-medium">{m.name}</span>
                      <span className="block text-xs text-ink-soft">
                        {m.type === "pickup" ? m.pickupAddress : m.estimatedDays}
                        {m.type === "free_over" && m.freeThreshold ? ` · مجاني للطلبات فوق ${formatMoney(m.freeThreshold)}` : ""}
                      </span>
                    </span>
                  </span>
                  <span className="text-sm">{cost === 0 ? "مجاني" : formatMoney(cost)}</span>
                </label>
              );
            })
          )}
          {e.shippingMethodId && <p className="text-xs text-red-700">{e.shippingMethodId}</p>}
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-3 text-lg font-semibold">طريقة الدفع</legend>
          {props.paymentMethods.map((p) => (
            <label key={p.method} className="flex cursor-pointer items-center justify-between gap-3 rounded-(--radius) border border-line p-3 has-checked:border-(--store)">
              <span className="flex items-center gap-3">
                <input type="radio" name="paymentMethod" value={p.method} checked={payment === p.method} onChange={() => setPayment(p.method)} className="accent-(--store)" />
                <span className="text-sm font-medium">{p.label}</span>
              </span>
              {p.fee > 0 && <span className="text-xs text-ink-soft">+ {formatMoney(p.fee)} رسوم</span>}
            </label>
          ))}
        </fieldset>

        <Field label="ملاحظات للمتجر (اختياري)" id="note">
          <textarea id="note" name="note" rows={2} maxLength={1000} defaultValue={v.note} className={inputCls} />
        </Field>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="acceptsMarketing" className="mt-1 accent-(--store)" defaultChecked={v.acceptsMarketing === "on"} />
          أرغب في استلام العروض والتخفيضات من المتجر
        </label>
      </div>

      <aside className="flex h-fit flex-col gap-4 rounded-(--radius) border border-line p-5 lg:sticky lg:top-24">
        <h2 className="font-semibold">ملخص الطلب</h2>
        <ul className="flex flex-col gap-3 text-sm">
          {props.cart.lines.map((l) => (
            <li key={l.variantId} className="flex items-center gap-3">
              <span className="relative size-12 shrink-0 overflow-hidden rounded-lg bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {l.imageUrl && <img src={l.imageUrl} alt="" className="size-full object-cover" />}
                <span className="absolute -end-1 -top-1 rounded-full bg-ink px-1.5 text-[10px] text-white">{l.quantity}</span>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate">{l.name}</span>
                {l.variant && <span className="block text-xs text-ink-soft">{l.variant}</span>}
              </span>
              <span>{formatMoney(l.total)}</span>
            </li>
          ))}
        </ul>
        <dl className="flex flex-col gap-2 border-t border-line pt-3 text-sm">
          <div className="flex justify-between"><dt>المجموع</dt><dd>{formatMoney(pricing.subtotal)}</dd></div>
          {pricing.discountTotal > 0 && <div className="flex justify-between text-emerald-700"><dt>الخصم ({props.cart.couponCode})</dt><dd>−{formatMoney(pricing.discountTotal)}</dd></div>}
          <div className="flex justify-between"><dt>الشحن</dt><dd>{selected ? (pricing.shippingTotal ? formatMoney(pricing.shippingTotal) : "مجاني") : "—"}</dd></div>
          {pricing.paymentFee > 0 && <div className="flex justify-between"><dt>رسوم الدفع</dt><dd>{formatMoney(pricing.paymentFee)}</dd></div>}
          {pricing.taxTotal > 0 && (
            <div className="flex justify-between text-ink-soft">
              <dt>ضريبة القيمة المضافة {props.pricingInput.tax.pricesIncludeTax ? "(مشمولة)" : ""}</dt>
              <dd>{formatMoney(pricing.taxTotal)}</dd>
            </div>
          )}
          <div className="flex justify-between border-t border-line pt-2 text-base font-bold"><dt>الإجمالي</dt><dd>{formatMoney(pricing.total)}</dd></div>
        </dl>
        <p className="text-xs leading-6 text-ink-soft">
          بإتمام الطلب فإنك توافق على{" "}
          <a href={props.termsUrl} target="_blank" className="underline">
            سياسات المتجر
          </a>
          .
        </p>
        <button type="submit" disabled={pending || !selected} className="rounded-(--radius) bg-(--store) px-5 py-3 font-semibold text-(--on-store) disabled:opacity-60">
          {pending ? "جارٍ إرسال الطلب…" : payment === "online" ? "المتابعة للدفع" : "تأكيد الطلب"}
        </button>
      </aside>
    </form>
  );
}
