import { and, desc, eq, sql } from "drizzle-orm";
import { audit, type RequestMeta } from "../audit";
import { processImage } from "../catalog/images";
import { listStorefrontProducts } from "../catalog/storefront";
import { categories, products, reviews, storeSettings } from "../db/schema";
import { withTenant } from "../db/tenant";
import { AppError } from "../lib/errors";
import { uuidv7 } from "../lib/ids";
import { getStorage } from "../storage";
import { requireStoreAccess, type StoreAccess } from "../stores/service";
import { readTheme, themeSchema, type Section, type ThemeConfig } from "@/themes/config";
import type { StorefrontData } from "@/themes/sections";

function imageKeys(t: ThemeConfig): string[] {
  return t.sections.flatMap((s: Section) => ("image" in s.settings && s.settings.image ? [s.settings.image] : []));
}

export async function getThemeState(access: StoreAccess) {
  return withTenant({ storeId: access.storeId, userId: access.userId }, async (tx) => {
    const [row] = await tx
      .select({ config: storeSettings.themeConfig, draft: storeSettings.themeDraft, brand: storeSettings.brandColor, publishedAt: storeSettings.themePublishedAt })
      .from(storeSettings)
      .where(eq(storeSettings.storeId, access.storeId))
      .limit(1);
    const published = readTheme(row?.config, row?.brand);
    const draft = row?.draft ? readTheme(row.draft, row.brand) : published;
    return { published, draft, hasDraft: !!row?.draft, publishedAt: row?.publishedAt ?? null };
  });
}

export async function getPublishedTheme(storeId: string) {
  return withTenant({ storeId }, async (tx) => {
    const [row] = await tx.select({ config: storeSettings.themeConfig, brand: storeSettings.brandColor }).from(storeSettings).where(eq(storeSettings.storeId, storeId)).limit(1);
    return readTheme(row?.config, row?.brand);
  });
}

function validateTheme(storeId: string, input: unknown): ThemeConfig {
  const parsed = themeSchema.safeParse(input);
  if (!parsed.success) throw new AppError("validation", `إعدادات التصميم غير صالحة: ${parsed.error.issues[0]?.message ?? ""}`);
  const ids = parsed.data.sections.map((s) => s.id);
  if (new Set(ids).size !== ids.length) throw new AppError("validation", "أقسام مكررة.");
  // Images must belong to this store.
  for (const key of imageKeys(parsed.data)) {
    if (!key.startsWith(`stores/${storeId}/theme/`)) throw new AppError("validation", "صورة غير صالحة.");
  }
  return parsed.data;
}

export async function saveThemeDraft(userId: string, storeId: string, input: unknown) {
  await requireStoreAccess(userId, storeId, "design.write");
  const theme = validateTheme(storeId, input);
  await withTenant({ storeId, userId }, (tx) => tx.update(storeSettings).set({ themeDraft: theme }).where(eq(storeSettings.storeId, storeId)));
}

export async function publishTheme(userId: string, storeId: string, input: unknown, meta: RequestMeta = {}) {
  await requireStoreAccess(userId, storeId, "design.write");
  const theme = validateTheme(storeId, input);
  await withTenant({ storeId, userId }, async (tx) => {
    await tx
      .update(storeSettings)
      .set({ themeConfig: theme, themeDraft: null, themePublishedAt: sql`now()`, brandColor: theme.colors.primary })
      .where(eq(storeSettings.storeId, storeId));
    await audit({ storeId, actorId: userId, action: "theme.published", metadata: { preset: theme.preset, sections: theme.sections.length }, meta }, tx);
  });
}

export async function discardThemeDraft(userId: string, storeId: string) {
  await requireStoreAccess(userId, storeId, "design.write");
  await withTenant({ storeId, userId }, (tx) => tx.update(storeSettings).set({ themeDraft: null }).where(eq(storeSettings.storeId, storeId)));
}

export async function uploadThemeImage(userId: string, storeId: string, file: unknown) {
  await requireStoreAccess(userId, storeId, "design.write");
  if (!(file instanceof Blob) || file.size === 0) throw new AppError("validation", "اختر صورة.");
  const image = await processImage(Buffer.from(await file.arrayBuffer()), 1920);
  const key = `stores/${storeId}/theme/${uuidv7()}.webp`;
  await getStorage().put(key, image.body, "image/webp");
  return { key, url: getStorage().url(key) };
}

/** Everything the home-page sections need, from live data. */
export async function getStorefrontData(storeId: string, store: { name: string; whatsapp: string | null }): Promise<StorefrontData> {
  const [list, cats, reviewRows] = await Promise.all([
    listStorefrontProducts(storeId, { limit: 60 }),
    withTenant({ storeId }, (tx) =>
      tx
        .select({
          name: categories.name,
          slug: categories.slug,
          imageKey: sql<string | null>`(select i.storage_key from product_categories pc join products p on p.id = pc.product_id and p.status = 'active'
             join product_images i on i.product_id = p.id where pc.category_id = categories.id order by i.position limit 1)`,
        })
        .from(categories)
        .where(
          and(
            sql`${categories.parentId} is null`,
            sql`exists (select 1 from product_categories pc join products p on p.id = pc.product_id left join categories ch on ch.id = pc.category_id
                        where (pc.category_id = categories.id or ch.parent_id = categories.id) and p.status = 'active')`,
          ),
        )
        .orderBy(categories.position),
    ),
    withTenant({ storeId }, (tx) =>
      tx
        .select({ authorName: reviews.authorName, rating: reviews.rating, body: reviews.body, productName: products.name })
        .from(reviews)
        .innerJoin(products, eq(products.id, reviews.productId))
        .where(and(eq(reviews.status, "approved"), sql`${reviews.rating} >= 4`))
        .orderBy(desc(reviews.createdAt))
        .limit(12),
    ),
  ]);
  return {
    store,
    products: list?.products ?? [],
    categories: cats.map((c) => ({ name: c.name, slug: c.slug, imageUrl: c.imageKey ? getStorage().url(c.imageKey) : null })),
    reviews: reviewRows,
    mediaBase: getStorage().publicBase(),
  };
}

