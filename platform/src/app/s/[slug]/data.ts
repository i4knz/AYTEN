import "server-only";
import { cache } from "react";
import { mediaUrl } from "@/server/catalog/images";
import { listStorefrontCategories } from "@/server/catalog/storefront";
import { getPublishedTheme } from "@/server/design/theme";
import { getStoreTracking } from "@/server/design/settings";
import { listFooterPages } from "@/server/design/pages";
import { getStorefront } from "@/server/stores/service";

/** Store for the current storefront request, resolved once per request. */
export const loadStorefront = cache(async (slug: string) => {
  const store = await getStorefront(slug);
  if (!store) return null;
  return { ...store, logo: mediaUrl(store.logoUrl), isOpen: store.status === "published" };
});

export const loadCategories = cache((storeId: string) => listStorefrontCategories(storeId));
export const loadTheme = cache((storeId: string) => getPublishedTheme(storeId));
export const loadStoreSettings = cache((storeId: string) => getStoreTracking(storeId));
export const loadFooterPages = cache((storeId: string) => listFooterPages(storeId));

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
