import { and, eq } from "drizzle-orm";
import { products } from "@/server/db/schema";
import { withTenant } from "@/server/db/tenant";
import { classifyPath, recordPageView } from "@/server/marketing/traffic";
import { getRequestMeta } from "@/server/web";
import { loadStorefront } from "../data";

// Page-view beacon: POST /t on the store's own host. Always answers 204 so
// failures never affect shoppers.
export async function POST(request: Request, { params }: RouteContext<"/s/[slug]/t">) {
  try {
    const raw = await request.text();
    if (raw.length > 2000) return new Response(null, { status: 204 });
    const body = JSON.parse(raw) as { path?: unknown; referrer?: unknown; utmSource?: unknown; utmCampaign?: unknown };
    const store = await loadStorefront((await params).slug);
    if (!store?.isOpen || typeof body.path !== "string") return new Response(null, { status: 204 });
    const str = (v: unknown) => (typeof v === "string" ? v.slice(0, 300) : null);
    const { productSlug } = classifyPath(body.path);
    let productId: string | null = null;
    if (productSlug) {
      productId = await withTenant({ storeId: store.id }, async (tx) => {
        const [row] = await tx.select({ id: products.id }).from(products).where(and(eq(products.slug, productSlug), eq(products.status, "active"))).limit(1);
        return row?.id ?? null;
      });
    }
    const meta = await getRequestMeta();
    await recordPageView(store.id, {
      path: body.path.slice(0, 300),
      referrer: str(body.referrer),
      utmSource: str(body.utmSource),
      utmCampaign: str(body.utmCampaign),
      ip: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
      productId,
    });
  } catch {
    // Ignore malformed beacons.
  }
  return new Response(null, { status: 204 });
}
