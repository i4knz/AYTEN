import { escapeXml } from "@/server/catalog/feed";
import { listStorefrontProducts } from "@/server/catalog/storefront";
import { storefrontUrl } from "@/server/urls";
import { loadCategories, loadFooterPages, loadStorefront } from "../data";

// Sitemap for search engines: home, categories, products and content pages.
export async function GET(_request: Request, { params }: RouteContext<"/s/[slug]/sitemap.xml">) {
  const store = await loadStorefront((await params).slug);
  if (!store?.isOpen) return new Response("Not found", { status: 404 });
  const base = storefrontUrl(store.slug);
  const [catalog, categories, pages] = await Promise.all([listStorefrontProducts(store.id, { limit: 5000 }), loadCategories(store.id), loadFooterPages(store.id)]);
  const urls = [
    base,
    ...categories.map((c) => `${base}/categories/${encodeURIComponent(c.slug)}`),
    ...(catalog?.products ?? []).map((p) => `${base}/products/${encodeURIComponent(p.slug)}`),
    ...pages.map((p) => `${base}/pages/${encodeURIComponent(p.slug)}`),
  ];
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `<url><loc>${escapeXml(u)}</loc></url>`).join("\n")}
</urlset>
`;
  return new Response(body, { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600" } });
}
