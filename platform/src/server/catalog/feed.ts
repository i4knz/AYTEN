import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { inventoryLevels, productImages, products, productVariants } from "../db/schema";
import { withTenant } from "../db/tenant";
import { toMajorString } from "../lib/money";
import { getStorage } from "../storage";

export interface FeedItem {
  id: string;
  groupId: string | null;
  title: string;
  description: string;
  link: string;
  imageLink: string | null;
  price: number;
  salePrice: number | null;
  inStock: boolean;
  sku: string | null;
  barcode: string | null;
}

/** One item per active variant with the fields Google Merchant Center requires. */
export async function listFeedItems(storeId: string, baseUrl: string): Promise<FeedItem[]> {
  return withTenant({ storeId }, async (tx) => {
    const rows = await tx
      .select({
        productId: products.id,
        name: products.name,
        slug: products.slug,
        description: products.description,
        variantId: productVariants.id,
        option1: productVariants.option1,
        option2: productVariants.option2,
        option3: productVariants.option3,
        sku: productVariants.sku,
        barcode: productVariants.barcode,
        price: productVariants.price,
        compareAtPrice: productVariants.compareAtPrice,
        trackInventory: inventoryLevels.trackInventory,
        available: sql<number>`coalesce(${inventoryLevels.onHand} - ${inventoryLevels.reserved}, 0)`,
        variantCount: sql<number>`(select count(*)::int from product_variants v2 where v2.product_id = products.id and v2.archived_at is null)`,
        imageKey: sql<string | null>`(select storage_key from ${productImages} i where i.product_id = products.id order by position, created_at limit 1)`,
      })
      .from(products)
      .innerJoin(productVariants, and(eq(productVariants.productId, products.id), isNull(productVariants.archivedAt)))
      .leftJoin(inventoryLevels, eq(inventoryLevels.variantId, productVariants.id))
      .where(eq(products.status, "active"))
      .orderBy(asc(products.createdAt), asc(productVariants.position))
      .limit(5000);
    return rows.map((r) => {
      const options = [r.option1, r.option2, r.option3].filter(Boolean).join(" / ");
      const onSale = r.compareAtPrice != null && r.compareAtPrice > r.price;
      return {
        id: r.sku || r.variantId,
        groupId: r.variantCount > 1 ? r.productId : null,
        title: (options ? `${r.name} - ${options}` : r.name).slice(0, 150),
        description: plainText(r.description || r.name).slice(0, 5000),
        link: `${baseUrl}/products/${encodeURIComponent(r.slug)}`,
        imageLink: r.imageKey ? getStorage().url(r.imageKey) : null,
        price: onSale ? r.compareAtPrice! : r.price,
        salePrice: onSale ? r.price : null,
        inStock: r.trackInventory === false || Number(r.available) > 0,
        sku: r.sku,
        barcode: r.barcode,
      };
    });
  });
}

function plainText(value: string) {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

export function escapeXml(value: string) {
  return value.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!);
}

/** RSS 2.0 with the Google product namespace (the format Merchant Center accepts for scheduled fetches). */
export function renderGoogleFeed(store: { name: string; url: string; currency: string }, items: FeedItem[]): string {
  const money = (v: number) => `${toMajorString(v, store.currency)} ${store.currency}`;
  const entries = items
    .filter((i) => i.imageLink)
    .map((i) =>
      [
        "<item>",
        `<g:id>${escapeXml(i.id)}</g:id>`,
        i.groupId ? `<g:item_group_id>${escapeXml(i.groupId)}</g:item_group_id>` : "",
        `<g:title>${escapeXml(i.title)}</g:title>`,
        `<g:description>${escapeXml(i.description)}</g:description>`,
        `<g:link>${escapeXml(i.link)}</g:link>`,
        `<g:image_link>${escapeXml(i.imageLink!)}</g:image_link>`,
        `<g:availability>${i.inStock ? "in_stock" : "out_of_stock"}</g:availability>`,
        `<g:price>${money(i.price)}</g:price>`,
        i.salePrice != null ? `<g:sale_price>${money(i.salePrice)}</g:sale_price>` : "",
        `<g:condition>new</g:condition>`,
        `<g:brand>${escapeXml(store.name)}</g:brand>`,
        i.barcode ? `<g:gtin>${escapeXml(i.barcode)}</g:gtin>` : `<g:identifier_exists>no</g:identifier_exists>`,
        i.sku ? `<g:mpn>${escapeXml(i.sku)}</g:mpn>` : "",
        "</item>",
      ]
        .filter(Boolean)
        .join(""),
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
<channel>
<title>${escapeXml(store.name)}</title>
<link>${escapeXml(store.url)}</link>
<description>${escapeXml(store.name)}</description>
${entries}
</channel>
</rss>
`;
}
