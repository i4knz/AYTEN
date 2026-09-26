import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCart } from "@/server/commerce/cart";
import { getCheckoutOptions } from "@/server/commerce/checkout";
import { SA_CITIES } from "@/server/commerce/cities";
import { uuidv7 } from "@/server/lib/ids";
import { readCartToken } from "../cart-cookie";
import { loadStorefront } from "../data";
import { CheckoutForm } from "./checkout-form";

export const metadata: Metadata = { title: "إتمام الطلب", robots: { index: false } };

export default async function CheckoutPage({ params }: PageProps<"/s/[slug]/checkout">) {
  const { slug } = await params;
  const store = await loadStorefront(slug);
  if (!store?.isOpen) return null;
  const cart = await getCart(store.id, await readCartToken());
  if (!cart.lines.length) redirect("/cart");
  const options = await getCheckoutOptions(store.id);

  if (!options.allShippingMethods.length || !options.paymentMethods.length) {
    return (
      <div className="py-16 text-center">
        <h1 className="mb-3 text-xl font-bold">لا يمكن إتمام الطلب حالياً</h1>
        <p className="text-ink-soft">المتجر لم يكمل إعداد الشحن أو الدفع بعد. تواصل مع المتجر.</p>
        <Link href="/cart" className="mt-4 inline-block text-(--store)">
          العودة للسلة
        </Link>
      </div>
    );
  }

  return (
    <CheckoutForm
      slug={slug}
      idempotencyKey={uuidv7()}
      cart={{ lines: cart.lines.map((l) => ({ variantId: l.variantId, name: l.productName, variant: l.variantTitle, quantity: l.quantity, total: l.unitPrice * l.quantity, imageUrl: l.imageUrl })), couponCode: cart.couponCode }}
      pricingInput={cart.pricingInput}
      shippingMethods={options.allShippingMethods.map((m) => ({ id: m.id, name: m.name, type: m.type, price: m.price, freeThreshold: m.freeThreshold, cities: m.cities, estimatedDays: m.estimatedDays, pickupAddress: m.pickupAddress }))}
      paymentMethods={options.paymentMethods}
      requireEmail={options.requireEmail}
      cities={SA_CITIES}
      termsUrl="/pages/policies"
    />
  );
}
