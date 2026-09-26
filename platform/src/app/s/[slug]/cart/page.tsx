import type { Metadata } from "next";
import Link from "next/link";
import { getCart } from "@/server/commerce/cart";
import { formatMoney } from "@/server/lib/money";
import { readCartToken } from "../cart-cookie";
import { loadStorefront } from "../data";
import { CouponForm, QuantityControl } from "./controls";

export const metadata: Metadata = { title: "السلة", robots: { index: false } };

const PROBLEMS = { unavailable: "لم يعد متوفراً", out_of_stock: "نفدت الكمية", insufficient_stock: "الكمية المطلوبة غير متوفرة" } as const;

export default async function CartPage({ params }: PageProps<"/s/[slug]/cart">) {
  const { slug } = await params;
  const store = await loadStorefront(slug);
  if (!store?.isOpen) return null;
  const cart = await getCart(store.id, await readCartToken());
  const p = cart.pricing;

  if (!cart.lines.length) {
    return (
      <div className="flex flex-col items-center gap-4 py-20 text-center">
        <h1 className="text-2xl font-bold">سلتك فارغة</h1>
        <Link href="/" className="rounded-(--radius) bg-(--store) px-5 py-3 font-semibold text-(--on-store)">
          تصفح المنتجات
        </Link>
      </div>
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
      <section>
        <h1 className="mb-5 text-2xl font-bold">السلة ({cart.itemCount})</h1>
        <ul className="divide-y divide-line">
          {cart.lines.map((l) => (
            <li key={l.variantId} className="flex gap-3 py-4">
              <Link href={`/products/${encodeURIComponent(l.productSlug)}`} className="size-20 shrink-0 overflow-hidden rounded-(--radius) bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {l.imageUrl && <img src={l.imageUrl} alt="" className="size-full object-cover" />}
              </Link>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <Link href={`/products/${encodeURIComponent(l.productSlug)}`} className="font-medium">
                  {l.productName}
                </Link>
                {l.variantTitle && <p className="text-sm text-ink-soft">{l.variantTitle}</p>}
                <p className="text-sm font-semibold">{formatMoney(l.unitPrice * l.quantity)}</p>
                {l.problem && (
                  <p className="text-sm text-red-700">
                    {PROBLEMS[l.problem]}
                    {l.problem === "insufficient_stock" && l.available ? ` (المتوفر ${l.available})` : ""}
                  </p>
                )}
              </div>
              <QuantityControl slug={slug} variantId={l.variantId} quantity={l.quantity} max={l.available ?? 99} name={l.productName} />
            </li>
          ))}
        </ul>
      </section>

      <aside className="flex h-fit flex-col gap-4 rounded-(--radius) border border-line p-5">
        <CouponForm slug={slug} code={cart.couponCode} message={cart.couponMessage} />
        <dl className="flex flex-col gap-2 text-sm">
          <div className="flex justify-between">
            <dt>المجموع</dt>
            <dd>{formatMoney(p.subtotal)}</dd>
          </div>
          {p.discountTotal > 0 && (
            <div className="flex justify-between text-emerald-700">
              <dt>الخصم ({cart.couponCode})</dt>
              <dd>−{formatMoney(p.discountTotal)}</dd>
            </div>
          )}
          <div className="flex justify-between text-ink-soft">
            <dt>الشحن</dt>
            <dd>يُحسب في الخطوة التالية</dd>
          </div>
          <div className="flex justify-between border-t border-line pt-2 text-base font-bold">
            <dt>الإجمالي</dt>
            <dd>{formatMoney(p.total)}</dd>
          </div>
        </dl>
        {cart.canCheckout ? (
          <Link href="/checkout" className="rounded-(--radius) bg-(--store) px-5 py-3 text-center font-semibold text-(--on-store)">
            إتمام الطلب
          </Link>
        ) : (
          <p className="text-sm text-red-700">عدّل المنتجات المظللة قبل إتمام الطلب.</p>
        )}
        <Link href="/" className="text-center text-sm text-ink-soft">
          متابعة التسوق
        </Link>
      </aside>
    </div>
  );
}
