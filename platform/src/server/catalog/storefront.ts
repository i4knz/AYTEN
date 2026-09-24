import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { categories, inventoryLevels, productCategories, productImages, productOptions, products, productVariants } from "../db/schema";
import { withTenant } from "../db/tenant";
import { getStorage } from "../storage";

// Public, read-only catalog queries for storefronts. They run with only the
// store context (no user) and return active products only.

export interface StorefrontProductCard {
  id: string;
  name: string;
  slug: string;
  minPrice: number;
  compareAtPrice: number | null;
  imageUrl: string | null;
  imageAlt: string;
  inStock: boolean;
}

export async function listStorefrontProducts(storeId: string, { categorySlug, limit = 48 }: { categorySlug?: string; limit?: number } = {}) {
  return withTenant({ storeId }, async (tx) => {
    let categoryName: string | null = null;
    const conditions = [eq(products.status, "active")];
    if (categorySlug) {
      const [cat] = await tx.select({ id: categories.id, name: categories.name }).from(categories).where(eq(categories.slug, categorySlug)).limit(1);
      if (!cat) return null;
      categoryName = cat.name;
      const children = await tx.select({ id: categories.id }).from(categories).where(eq(categories.parentId, cat.id));
      const ids = [cat.id, ...children.map((c) => c.id)];
      conditions.push(
        sql`exists (select 1 from product_categories pc where pc.product_id = products.id and pc.category_id in ${ids})`,
      );
    }
    const rows = await tx
      .select({
        id: products.id,
        name: products.name,
        slug: products.slug,
        minPrice: sql<string>`(select min(price) from product_variants v where v.product_id = products.id and v.archived_at is null)`,
        compareAtPrice: sql<string | null>`(select compare_at_price from product_variants v where v.product_id = products.id and v.archived_at is null order by price limit 1)`,
        inStock: sql<boolean>`exists (select 1 from product_variants v join inventory_levels l on l.variant_id = v.id where v.product_id = products.id and v.archived_at is null and (not l.track_inventory or l.on_hand - l.reserved > 0))`,
        imageKey: sql<string | null>`(select storage_key from product_images i where i.product_id = products.id order by position, created_at limit 1)`,
        imageAlt: sql<string | null>`(select alt from product_images i where i.product_id = products.id order by position, created_at limit 1)`,
      })
      .from(products)
      .where(and(...conditions))
      .orderBy(desc(products.createdAt))
      .limit(limit);
    const cards: StorefrontProductCard[] = rows
      .filter((r) => r.minPrice != null)
      .map((r) => ({
        id: r.id,
        name: r.name,
        slug: r.slug,
        minPrice: Number(r.minPrice),
        compareAtPrice: r.compareAtPrice == null ? null : Number(r.compareAtPrice),
        imageUrl: r.imageKey ? getStorage().url(r.imageKey) : null,
        imageAlt: r.imageAlt || r.name,
        inStock: r.inStock,
      }));
    return { categoryName, products: cards };
  });
}

export async function listStorefrontCategories(storeId: string) {
  return withTenant({ storeId }, (tx) =>
    tx
      .select({ id: categories.id, name: categories.name, slug: categories.slug, parentId: categories.parentId })
      .from(categories)
      .where(
        sql`exists (select 1 from product_categories pc join products p on p.id = pc.product_id
                     left join categories child on child.id = pc.category_id
                     where (pc.category_id = categories.id or child.parent_id = categories.id) and p.status = 'active')`,
      )
      .orderBy(asc(categories.position)),
  );
}

export async function getStorefrontProduct(storeId: string, slug: string) {
  return withTenant({ storeId }, async (tx) => {
    const [product] = await tx
      .select()
      .from(products)
      .where(and(eq(products.slug, slug), eq(products.status, "active")))
      .limit(1);
    if (!product) return null;
    const [options, variants, images, cats] = await Promise.all([
      tx.select({ name: productOptions.name, values: productOptions.values }).from(productOptions).where(eq(productOptions.productId, product.id)).orderBy(asc(productOptions.position)),
      tx
        .select({
          id: productVariants.id,
          option1: productVariants.option1,
          option2: productVariants.option2,
          option3: productVariants.option3,
          price: productVariants.price,
          compareAtPrice: productVariants.compareAtPrice,
          trackInventory: inventoryLevels.trackInventory,
          available: sql<number>`${inventoryLevels.onHand} - ${inventoryLevels.reserved}`,
        })
        .from(productVariants)
        .innerJoin(inventoryLevels, eq(inventoryLevels.variantId, productVariants.id))
        .where(and(eq(productVariants.productId, product.id), isNull(productVariants.archivedAt)))
        .orderBy(asc(productVariants.position)),
      tx.select().from(productImages).where(eq(productImages.productId, product.id)).orderBy(asc(productImages.position), asc(productImages.createdAt)),
      tx.select({ categoryId: productCategories.categoryId }).from(productCategories).where(eq(productCategories.productId, product.id)),
    ]);
    if (!variants.length) return null;
    const categoryRows = cats.length
      ? await tx.select({ name: categories.name, slug: categories.slug }).from(categories).where(inArray(categories.id, cats.map((c) => c.categoryId)))
      : [];
    return {
      product,
      options,
      categories: categoryRows,
      variants: variants.map((v) => ({
        id: v.id,
        values: [v.option1, v.option2, v.option3].filter((x): x is string => x !== null),
        price: Number(v.price),
        compareAtPrice: v.compareAtPrice == null ? null : Number(v.compareAtPrice),
        inStock: !v.trackInventory || Number(v.available) > 0,
        // Exact stock is only hinted when low, never exposed in full.
        lowStock: v.trackInventory && Number(v.available) > 0 && Number(v.available) <= 3 ? Number(v.available) : null,
      })),
      images: images.map((i) => ({ id: i.id, url: getStorage().url(i.storageKey), alt: i.alt || product.name, width: i.width, height: i.height })),
    };
  });
}
