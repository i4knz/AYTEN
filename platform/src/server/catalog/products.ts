import { and, asc, desc, eq, ilike, inArray, isNull, ne, sql } from "drizzle-orm";
import { audit, type RequestMeta } from "../audit";
import { type Tx } from "../db/client";
import {
  categories,
  inventoryLevels,
  inventoryMovements,
  productCategories,
  productImages,
  productOptions,
  products,
  productVariants,
  type ProductStatus,
} from "../db/schema";
import { withTenant } from "../db/tenant";
import { AppError, forbidden, isCheckViolation, isUniqueViolation, notFound } from "../lib/errors";
import { isUuid, uuidv7 } from "../lib/ids";
import { roleHas } from "../stores/permissions";
import { requireStoreAccess } from "../stores/service";
import { productInputSchema, toCatalogSlug, type ProductInput } from "./schemas";

function validationError(issues: { path: PropertyKey[]; message: string }[]) {
  const errors: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path.length ? issue.path.map(String).join(".") : "_form";
    errors[key] ??= issue.message;
  }
  // Surface the first variant/option problem as a readable form message too.
  const first = issues[0]?.message ?? "راجع الحقول المظللة.";
  return new AppError("validation", first, errors);
}

async function uniqueSlug(tx: Tx, base: string, excludeProductId?: string): Promise<string> {
  for (let i = 1; i < 100; i++) {
    const candidate = i === 1 ? base : `${base.slice(0, 150)}-${i}`;
    const conditions = [eq(products.slug, candidate)];
    if (excludeProductId) conditions.push(ne(products.id, excludeProductId));
    const taken = await tx.select({ id: products.id }).from(products).where(and(...conditions)).limit(1);
    if (!taken.length) return candidate;
  }
  return `${base.slice(0, 140)}-${uuidv7().slice(-8)}`;
}

const tupleKey = (values: (string | null)[]) => values.map((v) => v ?? "").join("\u0000");

/**
 * Creates or updates a product with its options, variants, stock and
 * categories in one transaction. Variants are matched by their option values,
 * so editing a product keeps variant ids (and their stock history) stable.
 * Variants no longer present are archived, not deleted, because past orders
 * will reference them.
 */
export async function saveProduct(
  userId: string,
  storeId: string,
  productId: string | null,
  rawInput: unknown,
  meta: RequestMeta = {},
): Promise<{ productId: string }> {
  const access = await requireStoreAccess(userId, storeId, "products.write");
  const parsed = productInputSchema.safeParse(rawInput);
  if (!parsed.success) throw validationError(parsed.error.issues);
  const input: ProductInput = parsed.data;
  const canAdjustStock = roleHas(access.role, "inventory.write");
  if (productId && !isUuid(productId)) throw notFound();

  try {
    return await withTenant({ storeId, userId }, async (tx) => {
      const id = productId ?? uuidv7();
      const slug = await uniqueSlug(tx, toCatalogSlug(input.slug || input.name, "product"), productId ?? undefined);

      if (productId) {
        const updated = await tx
          .update(products)
          .set({
            name: input.name,
            slug,
            description: input.description,
            status: input.status,
            seoTitle: input.seoTitle,
            seoDescription: input.seoDescription,
          })
          .where(eq(products.id, productId))
          .returning({ id: products.id });
        if (!updated.length) throw notFound();
      } else {
        await tx.insert(products).values({
          id,
          storeId,
          name: input.name,
          slug,
          description: input.description,
          status: input.status,
          seoTitle: input.seoTitle,
          seoDescription: input.seoDescription,
        });
      }

      // Options: small, replace wholesale.
      await tx.delete(productOptions).where(eq(productOptions.productId, id));
      if (input.options.length) {
        await tx.insert(productOptions).values(
          input.options.map((o, i) => ({ id: uuidv7(), storeId, productId: id, name: o.name, position: i + 1, values: o.values })),
        );
      }

      // Variants.
      const existing = await tx
        .select({ variant: productVariants, level: inventoryLevels })
        .from(productVariants)
        .leftJoin(inventoryLevels, eq(inventoryLevels.variantId, productVariants.id))
        .where(and(eq(productVariants.productId, id), isNull(productVariants.archivedAt)))
        // Serializes concurrent edits of the same product so stock deltas are computed from current values.
        .for("update", { of: productVariants });
      const byKey = new Map(existing.map((e) => [tupleKey([e.variant.option1, e.variant.option2, e.variant.option3]), e]));
      const keep = new Set<string>();
      const incoming = input.variants.map((v, position) => {
        const opts = [v.optionValues[0] ?? null, v.optionValues[1] ?? null, v.optionValues[2] ?? null] as const;
        const match = byKey.get(tupleKey([...opts]));
        if (match) keep.add(match.variant.id);
        return { v, position, opts, match };
      });

      // Archive removed variants first so their SKU / option tuple can be reused.
      const toArchive = existing.filter((e) => !keep.has(e.variant.id)).map((e) => e.variant.id);
      if (toArchive.length) {
        await tx.update(productVariants).set({ archivedAt: sql`now()` }).where(inArray(productVariants.id, toArchive));
      }

      for (const { v, position, opts, match } of incoming) {
        const fields = {
          option1: opts[0],
          option2: opts[1],
          option3: opts[2],
          sku: v.sku,
          price: v.price!,
          compareAtPrice: v.compareAtPrice,
          cost: v.cost,
          position,
        };
        const quantity = v.quantity === "" ? 0 : v.quantity;

        if (match) {
          await tx.update(productVariants).set(fields).where(eq(productVariants.id, match.variant.id));
          const level = match.level;
          const stockChanged = level && (level.trackInventory !== v.trackInventory || (v.trackInventory && level.onHand !== quantity));
          if (stockChanged && !canAdjustStock) throw forbidden();
          if (level && v.trackInventory && level.onHand !== quantity) {
            if (quantity < level.reserved) {
              throw new AppError("validation", `لا يمكن أن تقل الكمية عن ${level.reserved} لأنها محجوزة لطلبات قائمة.`);
            }
            await tx
              .update(inventoryLevels)
              .set({ onHand: quantity, trackInventory: true })
              .where(eq(inventoryLevels.variantId, match.variant.id));
            await tx.insert(inventoryMovements).values({
              id: uuidv7(),
              storeId,
              variantId: match.variant.id,
              delta: quantity - level.onHand,
              onHandAfter: quantity,
              reason: "manual_adjust",
              actorUserId: userId,
              note: "تعديل من صفحة المنتج",
            });
          } else if (level && level.trackInventory !== v.trackInventory) {
            await tx.update(inventoryLevels).set({ trackInventory: v.trackInventory }).where(eq(inventoryLevels.variantId, match.variant.id));
          }
        } else {
          const variantId = uuidv7();
          const initial = v.trackInventory ? quantity : 0;
          if (initial > 0 && !canAdjustStock) throw forbidden();
          await tx.insert(productVariants).values({ id: variantId, storeId, productId: id, ...fields });
          await tx.insert(inventoryLevels).values({ storeId, variantId, trackInventory: v.trackInventory, onHand: initial });
          if (initial > 0) {
            await tx.insert(inventoryMovements).values({
              id: uuidv7(),
              storeId,
              variantId,
              delta: initial,
              onHandAfter: initial,
              reason: "initial",
              actorUserId: userId,
            });
          }
        }
      }

      // Categories: only ids that exist in this store (RLS hides others; the composite FK would reject them anyway).
      await tx.delete(productCategories).where(eq(productCategories.productId, id));
      if (input.categoryIds.length) {
        const valid = await tx.select({ id: categories.id }).from(categories).where(inArray(categories.id, input.categoryIds));
        if (valid.length !== new Set(input.categoryIds).size) throw new AppError("validation", "أحد التصنيفات المختارة غير موجود.");
        await tx.insert(productCategories).values(valid.map((c) => ({ storeId, productId: id, categoryId: c.id })));
      }

      await audit(
        {
          storeId,
          actorId: userId,
          action: productId ? "product.updated" : "product.created",
          targetType: "product",
          targetId: id,
          metadata: { variants: input.variants.length, archivedVariants: toArchive.length },
          meta,
        },
        tx,
      );
      return { productId: id };
    });
  } catch (err) {
    if (isCheckViolation(err, "inventory_levels_check")) {
      throw new AppError("validation", "لا يمكن أن تقل الكمية عن الكمية المحجوزة لطلبات قائمة.");
    }
    if (isUniqueViolation(err, "product_variants_sku")) {
      throw new AppError("validation", "رمز SKU مستخدم في منتج آخر في متجرك.", { "variants.sku": "رمز SKU مستخدم في منتج آخر." });
    }
    throw err;
  }
}

export async function setProductStatus(
  userId: string,
  storeId: string,
  productId: string,
  status: ProductStatus,
  meta: RequestMeta = {},
) {
  await requireStoreAccess(userId, storeId, "products.write");
  if (!isUuid(productId)) throw notFound();
  await withTenant({ storeId, userId }, async (tx) => {
    const rows = await tx.update(products).set({ status }).where(eq(products.id, productId)).returning({ id: products.id });
    if (!rows.length) throw notFound();
    await audit({ storeId, actorId: userId, action: "product.status_changed", targetType: "product", targetId: productId, metadata: { status }, meta }, tx);
  });
}

export interface ProductListFilter {
  status?: ProductStatus | "all";
  q?: string;
  page?: number;
}

export const PAGE_SIZE = 25;

export async function listProducts(userId: string, storeId: string, filter: ProductListFilter = {}) {
  await requireStoreAccess(userId, storeId, "products.read");
  const page = Math.max(1, Math.floor(filter.page ?? 1));
  return withTenant({ storeId, userId }, async (tx) => {
    const conditions = [];
    if (filter.status && filter.status !== "all") conditions.push(eq(products.status, filter.status));
    else conditions.push(ne(products.status, "archived"));
    if (filter.q?.trim()) conditions.push(ilike(products.name, `%${filter.q.trim().replace(/[%_\\]/g, (c) => `\\${c}`)}%`));
    const where = and(...conditions);

    const rows = await tx
      .select({
        id: products.id,
        name: products.name,
        slug: products.slug,
        status: products.status,
        updatedAt: products.updatedAt,
        minPrice: sql<number | null>`(select min(price) from product_variants v where v.product_id = products.id and v.archived_at is null)`,
        maxPrice: sql<number | null>`(select max(price) from product_variants v where v.product_id = products.id and v.archived_at is null)`,
        variantCount: sql<number>`(select count(*)::int from product_variants v where v.product_id = products.id and v.archived_at is null)`,
        available: sql<number | null>`(select sum(l.on_hand - l.reserved)::int from product_variants v join inventory_levels l on l.variant_id = v.id where v.product_id = products.id and v.archived_at is null and l.track_inventory)`,
        untracked: sql<boolean>`exists (select 1 from product_variants v join inventory_levels l on l.variant_id = v.id where v.product_id = products.id and v.archived_at is null and not l.track_inventory)`,
        imageKey: sql<string | null>`(select storage_key from product_images i where i.product_id = products.id order by position, created_at limit 1)`,
      })
      .from(products)
      .where(where)
      .orderBy(desc(products.createdAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE);
    const [{ total }] = await tx.select({ total: sql<number>`count(*)::int` }).from(products).where(where);
    return { rows: rows.map((r) => ({ ...r, minPrice: r.minPrice == null ? null : Number(r.minPrice), maxPrice: r.maxPrice == null ? null : Number(r.maxPrice) })), total, page, pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
  });
}

export async function getProduct(userId: string, storeId: string, productId: string) {
  await requireStoreAccess(userId, storeId, "products.read");
  if (!isUuid(productId)) throw notFound();
  return withTenant({ storeId, userId }, async (tx) => {
    const [product] = await tx.select().from(products).where(eq(products.id, productId)).limit(1);
    if (!product) throw notFound();
    const [options, variants, images, cats] = await Promise.all([
      tx.select().from(productOptions).where(eq(productOptions.productId, productId)).orderBy(asc(productOptions.position)),
      tx
        .select({ variant: productVariants, level: inventoryLevels })
        .from(productVariants)
        .leftJoin(inventoryLevels, eq(inventoryLevels.variantId, productVariants.id))
        .where(and(eq(productVariants.productId, productId), isNull(productVariants.archivedAt)))
        .orderBy(asc(productVariants.position)),
      tx.select().from(productImages).where(eq(productImages.productId, productId)).orderBy(asc(productImages.position), asc(productImages.createdAt)),
      tx.select({ categoryId: productCategories.categoryId }).from(productCategories).where(eq(productCategories.productId, productId)),
    ]);
    return { product, options, variants, images, categoryIds: cats.map((c) => c.categoryId) };
  });
}

export async function countProducts(storeId: string, userId: string) {
  return withTenant({ storeId, userId }, async (tx) => {
    const [row] = await tx
      .select({
        total: sql<number>`count(*)::int`,
        active: sql<number>`count(*) filter (where ${products.status} = 'active')::int`,
      })
      .from(products)
      .where(ne(products.status, "archived"));
    return row;
  });
}
