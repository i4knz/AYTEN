import { and, asc, eq, ne, sql } from "drizzle-orm";
import { audit, type RequestMeta } from "../audit";
import { fieldErrors } from "../auth/schemas";
import type { Tx } from "../db/client";
import { categories, productCategories } from "../db/schema";
import { withTenant } from "../db/tenant";
import { AppError, notFound } from "../lib/errors";
import { isUuid, uuidv7 } from "../lib/ids";
import { requireStoreAccess } from "../stores/service";
import { categoryInputSchema, toCatalogSlug } from "./schemas";

export const MAX_CATEGORIES = 200;

async function uniqueCategorySlug(tx: Tx, base: string, excludeId?: string) {
  for (let i = 1; i < 100; i++) {
    const candidate = i === 1 ? base : `${base.slice(0, 90)}-${i}`;
    const conditions = [eq(categories.slug, candidate)];
    if (excludeId) conditions.push(ne(categories.id, excludeId));
    if (!(await tx.select({ id: categories.id }).from(categories).where(and(...conditions)).limit(1)).length) return candidate;
  }
  return `${base.slice(0, 80)}-${uuidv7().slice(-8)}`;
}

/** Two levels only (main → sub): a parent must itself be top-level, and a category with children cannot become a child. */
async function assertValidParent(tx: Tx, parentId: string | null, selfId?: string) {
  if (!parentId) return;
  if (parentId === selfId) throw new AppError("validation", "لا يمكن أن يكون التصنيف تابعاً لنفسه.", { parentId: "اختيار غير صالح." });
  const [parent] = await tx.select().from(categories).where(eq(categories.id, parentId)).limit(1);
  if (!parent) throw new AppError("validation", "التصنيف الرئيسي غير موجود.", { parentId: "التصنيف الرئيسي غير موجود." });
  if (parent.parentId) {
    throw new AppError("validation", "يمكن إنشاء مستويين فقط: تصنيف رئيسي وتصنيف فرعي.", { parentId: "اختر تصنيفاً رئيسياً." });
  }
  if (selfId) {
    const [{ children }] = await tx.select({ children: sql<number>`count(*)::int` }).from(categories).where(eq(categories.parentId, selfId));
    if (children > 0) {
      throw new AppError("validation", "هذا التصنيف لديه تصنيفات فرعية ولا يمكن جعله فرعياً.", { parentId: "لديه تصنيفات فرعية." });
    }
  }
}

export async function listCategories(userId: string, storeId: string) {
  await requireStoreAccess(userId, storeId, "products.read");
  return withTenant({ storeId, userId }, (tx) =>
    tx
      .select({
        id: categories.id,
        name: categories.name,
        slug: categories.slug,
        parentId: categories.parentId,
        position: categories.position,
        productCount: sql<number>`(select count(*)::int from product_categories pc where pc.category_id = categories.id)`,
      })
      .from(categories)
      .orderBy(asc(categories.position), asc(categories.createdAt)),
  );
}

export async function createCategory(userId: string, storeId: string, input: unknown, meta: RequestMeta = {}) {
  await requireStoreAccess(userId, storeId, "products.write");
  const parsed = categoryInputSchema.safeParse(input);
  if (!parsed.success) throw new AppError("validation", "راجع الحقول المظللة.", fieldErrors(parsed.error));
  const { name, parentId, description } = parsed.data;
  return withTenant({ storeId, userId }, async (tx) => {
    const [{ count }] = await tx.select({ count: sql<number>`count(*)::int` }).from(categories);
    if (count >= MAX_CATEGORIES) throw new AppError("limit_reached", `الحد الأقصى ${MAX_CATEGORIES} تصنيف.`);
    await assertValidParent(tx, parentId);
    const id = uuidv7();
    await tx.insert(categories).values({
      id,
      storeId,
      name,
      parentId,
      description,
      slug: await uniqueCategorySlug(tx, toCatalogSlug(name, "category")),
      position: count,
    });
    await audit({ storeId, actorId: userId, action: "category.created", targetType: "category", targetId: id, meta }, tx);
    return { categoryId: id };
  });
}

export async function updateCategory(userId: string, storeId: string, categoryId: string, input: unknown, meta: RequestMeta = {}) {
  await requireStoreAccess(userId, storeId, "products.write");
  if (!isUuid(categoryId)) throw notFound();
  const parsed = categoryInputSchema.safeParse(input);
  if (!parsed.success) throw new AppError("validation", "راجع الحقول المظللة.", fieldErrors(parsed.error));
  const { name, parentId, description } = parsed.data;
  await withTenant({ storeId, userId }, async (tx) => {
    await assertValidParent(tx, parentId, categoryId);
    const rows = await tx
      .update(categories)
      .set({ name, parentId, description, slug: await uniqueCategorySlug(tx, toCatalogSlug(name, "category"), categoryId) })
      .where(eq(categories.id, categoryId))
      .returning({ id: categories.id });
    if (!rows.length) throw notFound();
    await audit({ storeId, actorId: userId, action: "category.updated", targetType: "category", targetId: categoryId, meta }, tx);
  });
}

/** Deletes a category. Products stay; they are only unlinked. Sub-categories become top-level. */
export async function deleteCategory(userId: string, storeId: string, categoryId: string, meta: RequestMeta = {}) {
  await requireStoreAccess(userId, storeId, "products.write");
  if (!isUuid(categoryId)) throw notFound();
  await withTenant({ storeId, userId }, async (tx) => {
    await tx.delete(productCategories).where(eq(productCategories.categoryId, categoryId));
    const rows = await tx.delete(categories).where(eq(categories.id, categoryId)).returning({ id: categories.id });
    if (!rows.length) throw notFound();
    await audit({ storeId, actorId: userId, action: "category.deleted", targetType: "category", targetId: categoryId, meta }, tx);
  });
}
