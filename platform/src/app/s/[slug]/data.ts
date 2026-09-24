import "server-only";
import { cache } from "react";
import { mediaUrl } from "@/server/catalog/images";
import { listStorefrontCategories } from "@/server/catalog/storefront";
import { getStorefront } from "@/server/stores/service";

/** Store for the current storefront request, resolved once per request. */
export const loadStorefront = cache(async (slug: string) => {
  const store = await getStorefront(slug);
  if (!store) return null;
  return { ...store, logo: mediaUrl(store.logoUrl), isOpen: store.status === "published" };
});

export const loadCategories = cache((storeId: string) => listStorefrontCategories(storeId));

export function decodeParam(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function whatsappLink(number: string | null | undefined, text: string) {
  const digits = number?.replace(/\D/g, "");
  if (!digits) return null;
  return text ? `https://wa.me/${digits}?text=${encodeURIComponent(text)}` : `https://wa.me/${digits}`;
}
