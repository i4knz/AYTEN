"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { addToCart, recordCheckoutContact, setCartCoupon, updateCartQuantity } from "@/server/commerce/cart";
import { placeOrder } from "@/server/commerce/checkout";
import { findOrderForTracking } from "@/server/commerce/orders";
import { AppError } from "@/server/lib/errors";
import { consume } from "@/server/lib/rate-limit";
import { normalizeSaPhone } from "@/server/stores/schemas";
import { getRequestMeta, toFormState, type FormState } from "@/server/web";
import { readCartToken, writeCartToken } from "./cart-cookie";
import { loadStorefront } from "./data";

async function openStore(slug: string) {
  const store = await loadStorefront(slug);
  if (!store?.isOpen) throw new AppError("store_closed", "المتجر لا يستقبل طلبات حالياً.");
  return store;
}

export async function addToCartAction(slug: string, variantId: string, quantity: number): Promise<FormState> {
  try {
    const store = await openStore(slug);
    const { token } = await addToCart(store.id, await readCartToken(), variantId, quantity);
    if (token) await writeCartToken(token);
    revalidatePath("/", "layout");
    return { ok: true, message: "أُضيف إلى السلة." };
  } catch (err) {
    return toFormState(err);
  }
}

export async function updateQuantityAction(slug: string, variantId: string, quantity: number) {
  const store = await openStore(slug);
  await updateCartQuantity(store.id, await readCartToken(), variantId, quantity);
  revalidatePath("/", "layout");
}

export async function couponAction(slug: string, _prev: FormState, form: FormData): Promise<FormState> {
  try {
    const store = await openStore(slug);
    const meta = await getRequestMeta();
    if (meta.ip && !(await consume(`coupon:${store.id}:${meta.ip}`, { limit: 20, windowSeconds: 600 }))) {
      throw new AppError("rate_limited", "محاولات كثيرة. انتظر قليلاً.");
    }
    const remove = form.get("remove") === "1";
    await setCartCoupon(store.id, await readCartToken(), remove ? null : String(form.get("code") ?? ""));
    revalidatePath("/", "layout");
    return { ok: true, message: remove ? "أُزيل الكوبون." : "تم تطبيق الكوبون." };
  } catch (err) {
    return toFormState(err);
  }
}

export async function saveContactAction(slug: string, contact: { name: string; phone: string; email: string }) {
  const store = await loadStorefront(slug);
  if (!store?.isOpen) return;
  await recordCheckoutContact(store.id, await readCartToken(), {
    name: contact.name,
    phone: normalizeSaPhone(contact.phone) ?? undefined,
    email: contact.email,
  });
}

export async function placeOrderAction(slug: string, _prev: FormState, form: FormData): Promise<FormState> {
  let destination: string;
  try {
    const store = await openStore(slug);
    const meta = await getRequestMeta();
    if (meta.ip && !(await consume(`checkout:${store.id}:${meta.ip}`, { limit: 20, windowSeconds: 600 }))) {
      throw new AppError("rate_limited", "محاولات كثيرة. انتظر قليلاً ثم حاول مرة أخرى.");
    }
    const get = (k: string) => String(form.get(k) ?? "");
    const placed = await placeOrder(
      store.id,
      await readCartToken(),
      {
        name: get("name"),
        phone: get("phone"),
        email: get("email"),
        city: get("city"),
        district: get("district"),
        street: get("street"),
        details: get("details"),
        postalCode: get("postalCode"),
        shippingMethodId: get("shippingMethodId"),
        paymentMethod: get("paymentMethod"),
        note: get("note"),
        acceptsMarketing: form.get("acceptsMarketing") === "on",
        idempotencyKey: get("idempotencyKey"),
      },
      meta,
    );
    destination = placed.paymentRedirect ?? `/orders/${placed.number}?key=${placed.accessKey}&new=1`;
  } catch (err) {
    const values: Record<string, string> = {};
    for (const [k, v] of form.entries()) if (typeof v === "string" && k !== "idempotencyKey" && !k.startsWith("$")) values[k] = v;
    return toFormState(err, values);
  }
  redirect(destination);
}

export async function trackOrderAction(slug: string, _prev: FormState, form: FormData): Promise<FormState> {
  let destination: string;
  try {
    const store = await loadStorefront(slug);
    if (!store) throw new AppError("not_found", "المتجر غير موجود.");
    const meta = await getRequestMeta();
    if (meta.ip && !(await consume(`track:${store.id}:${meta.ip}`, { limit: 15, windowSeconds: 600 }))) {
      throw new AppError("rate_limited", "محاولات كثيرة. انتظر قليلاً.");
    }
    const number = Number(String(form.get("number") ?? "").replace(/[^\d]/g, ""));
    const phone = normalizeSaPhone(String(form.get("phone") ?? ""));
    const found = phone && number ? await findOrderForTracking(store.id, number, phone) : null;
    if (!found) throw new AppError("not_found", "لم نجد طلباً بهذا الرقم وهذا الجوال.");
    destination = `/orders/${found.number}?key=${found.accessKey}`;
  } catch (err) {
    return toFormState(err);
  }
  redirect(destination);
}

export async function retryPaymentAction(slug: string, number: number, key: string) {
  const store = await openStore(slug);
  const { getOrderForShopper } = await import("@/server/commerce/orders");
  const { getPaymentGateway } = await import("@/server/payments/gateway");
  const data = await getOrderForShopper(store.id, number, key);
  if (!data) throw new AppError("not_found", "الطلب غير موجود.");
  redirect(await getPaymentGateway().startPayment({ storeId: store.id, orderId: data.order.id }));
}
