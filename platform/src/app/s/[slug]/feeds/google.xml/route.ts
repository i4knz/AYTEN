import { listFeedItems, renderGoogleFeed } from "@/server/catalog/feed";
import { storefrontUrl } from "@/server/urls";
import { loadStoreSettings, loadStorefront } from "../../data";

// Product feed for Google Merchant Center (and other catalogs that accept
// the same format). Served only when the merchant enables the app.
export async function GET(_request: Request, { params }: RouteContext<"/s/[slug]/feeds/google.xml">) {
  const store = await loadStorefront((await params).slug);
  if (!store?.isOpen) return new Response("Not found", { status: 404 });
  const { features } = await loadStoreSettings(store.id);
  if (!features.googleFeed) return new Response("Not found", { status: 404 });
  const url = storefrontUrl(store.slug);
  const items = await listFeedItems(store.id, url);
  return new Response(renderGoogleFeed({ name: store.name, url, currency: "SAR" }, items), {
    headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=900" },
  });
}
