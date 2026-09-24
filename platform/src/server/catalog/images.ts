import { and, asc, eq, sql } from "drizzle-orm";
import sharp from "sharp";
import { audit, type RequestMeta } from "../audit";
import { productImages, products, storeSettings } from "../db/schema";
import { withTenant } from "../db/tenant";
import { AppError, notFound } from "../lib/errors";
import { isUuid, uuidv7 } from "../lib/ids";
import { getStorage } from "../storage";
import { requireStoreAccess } from "../stores/service";
import { MAX_IMAGES } from "./schemas";

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const ALLOWED_FORMATS = new Set(["jpeg", "png", "webp", "avif", "gif"]);

/**
 * Decodes the upload with sharp and re-encodes it as WebP. Anything that is
 * not a real image fails to decode, and re-encoding drops embedded metadata
 * (including GPS location from phone photos) and any non-image payload.
 */
export async function processImage(data: Buffer, maxSize: number) {
  if (data.length === 0) throw new AppError("validation", "الملف فارغ.");
  if (data.length > MAX_UPLOAD_BYTES) throw new AppError("validation", "حجم الصورة أكبر من 8 ميجابايت.");
  let meta;
  try {
    meta = await sharp(data, { limitInputPixels: 40_000_000 }).metadata();
  } catch {
    throw new AppError("validation", "الملف ليس صورة صالحة. استخدم JPG أو PNG أو WebP.");
  }
  if (!meta.format || !ALLOWED_FORMATS.has(meta.format)) {
    throw new AppError("validation", "صيغة غير مدعومة. استخدم JPG أو PNG أو WebP.");
  }
  try {
    const { data: body, info } = await sharp(data, { limitInputPixels: 40_000_000, animated: false })
      .rotate()
      .resize({ width: maxSize, height: maxSize, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true });
    return { body, width: info.width, height: info.height };
  } catch {
    throw new AppError("validation", "تعذرت معالجة الصورة. جرّب صورة أخرى.");
  }
}

async function fileToBuffer(file: unknown): Promise<Buffer> {
  if (!(file instanceof Blob) || file.size === 0) throw new AppError("validation", "اختر صورة.");
  if (file.size > MAX_UPLOAD_BYTES) throw new AppError("validation", "حجم الصورة أكبر من 8 ميجابايت.");
  return Buffer.from(await file.arrayBuffer());
}

export async function uploadProductImage(userId: string, storeId: string, productId: string, file: unknown, meta: RequestMeta = {}) {
  await requireStoreAccess(userId, storeId, "products.write");
  if (!isUuid(productId)) throw notFound();
  const image = await processImage(await fileToBuffer(file), 1600);
  const key = `stores/${storeId}/products/${uuidv7()}.webp`;

  // Check the product and the limit before writing the file.
  await withTenant({ storeId, userId }, async (tx) => {
    const [product] = await tx.select({ id: products.id }).from(products).where(eq(products.id, productId)).limit(1);
    if (!product) throw notFound();
    const [{ count }] = await tx.select({ count: sql<number>`count(*)::int` }).from(productImages).where(eq(productImages.productId, productId));
    if (count >= MAX_IMAGES) throw new AppError("limit_reached", `الحد الأقصى ${MAX_IMAGES} صور للمنتج.`);
  });
  await getStorage().put(key, image.body, "image/webp");
  try {
    return await withTenant({ storeId, userId }, async (tx) => {
      const id = uuidv7();
      await tx.insert(productImages).values({
        id,
        storeId,
        productId,
        storageKey: key,
        width: image.width,
        height: image.height,
        position: sql`(select coalesce(max(position) + 1, 0) from product_images where product_id = ${productId})` as unknown as number,
      });
      await audit({ storeId, actorId: userId, action: "product.image_added", targetType: "product", targetId: productId, meta }, tx);
      return { imageId: id, key };
    });
  } catch (err) {
    await getStorage().delete(key).catch(() => undefined);
    throw err;
  }
}

export async function deleteProductImage(userId: string, storeId: string, imageId: string, meta: RequestMeta = {}) {
  await requireStoreAccess(userId, storeId, "products.write");
  if (!isUuid(imageId)) throw notFound();
  const key = await withTenant({ storeId, userId }, async (tx) => {
    const [row] = await tx.delete(productImages).where(eq(productImages.id, imageId)).returning();
    if (!row) throw notFound();
    await audit({ storeId, actorId: userId, action: "product.image_removed", targetType: "product", targetId: row.productId, meta }, tx);
    return row.storageKey;
  });
  await getStorage().delete(key).catch((err) => console.error("[storage] delete failed", key, err));
}

/** Moves an image to the first position (the one shown in listings). */
export async function makePrimaryImage(userId: string, storeId: string, imageId: string) {
  await requireStoreAccess(userId, storeId, "products.write");
  if (!isUuid(imageId)) throw notFound();
  await withTenant({ storeId, userId }, async (tx) => {
    const [image] = await tx.select().from(productImages).where(eq(productImages.id, imageId)).limit(1);
    if (!image) throw notFound();
    const all = await tx
      .select({ id: productImages.id })
      .from(productImages)
      .where(eq(productImages.productId, image.productId))
      .orderBy(asc(productImages.position), asc(productImages.createdAt));
    const ordered = [image.id, ...all.map((i) => i.id).filter((id) => id !== image.id)];
    for (const [position, id] of ordered.entries()) {
      await tx.update(productImages).set({ position }).where(and(eq(productImages.id, id)));
    }
  });
}

export async function updateImageAlt(userId: string, storeId: string, imageId: string, alt: string) {
  await requireStoreAccess(userId, storeId, "products.write");
  if (!isUuid(imageId)) throw notFound();
  await withTenant({ storeId, userId }, async (tx) => {
    const rows = await tx.update(productImages).set({ alt: alt.trim().slice(0, 200) }).where(eq(productImages.id, imageId)).returning({ id: productImages.id });
    if (!rows.length) throw notFound();
  });
}

/** Stores the logo's storage key in store_settings.logo_url (the column holds a key, resolved to a URL at render time). */
export async function uploadStoreLogo(userId: string, storeId: string, file: unknown, meta: RequestMeta = {}) {
  await requireStoreAccess(userId, storeId, "settings.write");
  const image = await processImage(await fileToBuffer(file), 512);
  const key = `stores/${storeId}/logos/${uuidv7()}.webp`;
  await getStorage().put(key, image.body, "image/webp");
  const previous = await withTenant({ storeId, userId }, async (tx) => {
    const [row] = await tx.select({ logo: storeSettings.logoUrl }).from(storeSettings).where(eq(storeSettings.storeId, storeId)).limit(1);
    await tx.update(storeSettings).set({ logoUrl: key }).where(eq(storeSettings.storeId, storeId));
    await audit({ storeId, actorId: userId, action: "store.logo_updated", targetType: "store", targetId: storeId, meta }, tx);
    return row?.logo;
  });
  if (previous) await getStorage().delete(previous).catch(() => undefined);
  return { key };
}

export async function removeStoreLogo(userId: string, storeId: string, meta: RequestMeta = {}) {
  await requireStoreAccess(userId, storeId, "settings.write");
  const previous = await withTenant({ storeId, userId }, async (tx) => {
    const [row] = await tx.select({ logo: storeSettings.logoUrl }).from(storeSettings).where(eq(storeSettings.storeId, storeId)).limit(1);
    await tx.update(storeSettings).set({ logoUrl: null }).where(eq(storeSettings.storeId, storeId));
    await audit({ storeId, actorId: userId, action: "store.logo_removed", targetType: "store", targetId: storeId, meta }, tx);
    return row?.logo;
  });
  if (previous) await getStorage().delete(previous).catch(() => undefined);
}

export const mediaUrl = (key: string | null | undefined) => (key ? getStorage().url(key) : null);
