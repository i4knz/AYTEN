import { and, asc, eq, sql } from "drizzle-orm";
import { audit, type RequestMeta } from "../audit";
import { getDb } from "../db/client";
import { products, storeMembers, stores, storeSettings, users, type StoreRole } from "../db/schema";
import { withTenant } from "../db/tenant";
import { AppError, forbidden, isUniqueViolation, notFound, rateLimited } from "../lib/errors";
import { isUuid, uuidv7 } from "../lib/ids";
import { consume, RATE_LIMITS } from "../lib/rate-limit";
import { fieldErrors } from "../auth/schemas";
import { roleHas, ROLE_PERMISSIONS, type Permission } from "./permissions";
import { createStoreSchema, updateStoreProfileSchema } from "./schemas";
import { slugProblem, suggestSlug } from "./slug";

/** Beta usage limit. Will move to plan limits when billing lands. */
export const MAX_OWNED_STORES = 3;

export async function isSlugTaken(slug: string): Promise<boolean> {
  const rows = await getDb().select({ id: stores.id }).from(stores).where(eq(stores.slug, slug)).limit(1);
  return rows.length > 0;
}

export async function checkSlug(rawSlug: string): Promise<{ ok: boolean; message?: string; suggestion?: string }> {
  const slug = rawSlug.trim().toLowerCase();
  const problem = slugProblem(slug);
  if (problem) return { ok: false, message: problem };
  if (await isSlugTaken(slug)) {
    return { ok: false, message: "هذا الرابط مستخدم.", suggestion: await findFreeSlug(slug) };
  }
  return { ok: true };
}

/** First free variant of `base` (base, base-2, base-3, …). */
export async function findFreeSlug(base: string): Promise<string> {
  const root = (slugProblem(base) ? suggestSlug(base) : base).slice(0, 36).replace(/-+$/, "");
  for (let i = 1; i < 50; i++) {
    const candidate = i === 1 ? root : `${root}-${i}`;
    if (!slugProblem(candidate) && !(await isSlugTaken(candidate))) return candidate;
  }
  return `${root.slice(0, 27)}-${uuidv7().slice(-8)}`;
}

export async function suggestAvailableSlug(name: string): Promise<string> {
  return findFreeSlug(suggestSlug(name));
}

export async function createStore(userId: string, input: unknown, meta: RequestMeta = {}) {
  const parsed = createStoreSchema.safeParse(input);
  if (!parsed.success) throw new AppError("validation", "راجع الحقول المظللة.", fieldErrors(parsed.error));
  const { name, slug, businessType } = parsed.data;

  const problem = slugProblem(slug);
  if (problem) throw new AppError("validation", "راجع الحقول المظللة.", { slug: problem });

  if (!(await consume(`store-create:user:${userId}`, RATE_LIMITS.storeCreatePerUser))) throw rateLimited();

  const [{ owned }] = await getDb()
    .select({ owned: sql<number>`count(*)::int` })
    .from(stores)
    .where(eq(stores.ownerUserId, userId));
  if (owned >= MAX_OWNED_STORES) {
    throw new AppError("limit_reached", `يمكنك إنشاء ${MAX_OWNED_STORES} متاجر كحد أقصى في النسخة التجريبية.`);
  }

  const storeId = uuidv7();
  try {
    await withTenant({ storeId, userId }, async (tx) => {
      await tx.insert(stores).values({ id: storeId, ownerUserId: userId, name, slug, businessType });
      await tx.insert(storeSettings).values({ storeId });
      await tx.insert(storeMembers).values({ id: uuidv7(), storeId, userId, role: "owner" });
      await audit(
        { storeId, actorId: userId, action: "store.created", targetType: "store", targetId: storeId, metadata: { slug }, meta },
        tx,
      );
    });
  } catch (err) {
    if (isUniqueViolation(err, "stores_slug_key")) {
      throw new AppError("validation", "راجع الحقول المظللة.", {
        slug: `هذا الرابط مستخدم. جرّب: ${await findFreeSlug(slug)}`,
      });
    }
    throw err;
  }
  return { storeId, slug };
}

export interface StoreAccess {
  storeId: string;
  userId: string;
  role: StoreRole;
  permissions: readonly Permission[];
  store: typeof stores.$inferSelect;
}

/** The user's membership in the store, or null when they have none (or the id is malformed). */
export async function getStoreAccess(userId: string, storeId: string): Promise<StoreAccess | null> {
  if (!isUuid(storeId)) return null;
  return withTenant({ storeId, userId }, async (tx) => {
    const rows = await tx
      .select({ role: storeMembers.role, store: stores })
      .from(storeMembers)
      .innerJoin(stores, eq(stores.id, storeMembers.storeId))
      .where(and(eq(storeMembers.storeId, storeId), eq(storeMembers.userId, userId), eq(storeMembers.status, "active")))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    return { storeId, userId, role: row.role, permissions: ROLE_PERMISSIONS[row.role], store: row.store };
  });
}

/**
 * Authorization gate for every store-scoped operation. Non-members get
 * "not found" rather than "forbidden" so store ids cannot be probed.
 */
export async function requireStoreAccess(userId: string, storeId: string, permission?: Permission): Promise<StoreAccess> {
  const access = await getStoreAccess(userId, storeId);
  if (!access) throw notFound();
  if (permission && !roleHas(access.role, permission)) throw forbidden();
  return access;
}

export async function listMyStores(userId: string) {
  return withTenant({ userId }, (tx) =>
    tx
      .select({ id: stores.id, name: stores.name, slug: stores.slug, status: stores.status, role: storeMembers.role })
      .from(storeMembers)
      .innerJoin(stores, eq(stores.id, storeMembers.storeId))
      .where(and(eq(storeMembers.userId, userId), eq(storeMembers.status, "active")))
      .orderBy(asc(storeMembers.createdAt)),
  );
}

export async function getStoreSettings(access: StoreAccess) {
  return withTenant({ storeId: access.storeId, userId: access.userId }, async (tx) => {
    const [row] = await tx.select().from(storeSettings).where(eq(storeSettings.storeId, access.storeId)).limit(1);
    if (!row) throw notFound();
    return row;
  });
}

export async function updateStoreProfile(userId: string, storeId: string, input: unknown, meta: RequestMeta = {}) {
  const access = await requireStoreAccess(userId, storeId, "settings.write");
  const parsed = updateStoreProfileSchema.safeParse(input);
  if (!parsed.success) throw new AppError("validation", "راجع الحقول المظللة.", fieldErrors(parsed.error));
  const { name, contactEmail, contactPhone, whatsapp, brandColor } = parsed.data;

  await withTenant({ storeId, userId }, async (tx) => {
    await tx.update(stores).set({ name }).where(eq(stores.id, storeId));
    await tx
      .update(storeSettings)
      .set({ contactEmail, contactPhone, whatsapp, brandColor })
      .where(eq(storeSettings.storeId, storeId));
    await audit(
      {
        storeId,
        actorId: userId,
        action: "store.profile_updated",
        targetType: "store",
        targetId: storeId,
        metadata: { previousName: access.store.name !== name ? access.store.name : undefined },
        meta,
      },
      tx,
    );
  });
}

/**
 * Publishing requires a verified owner email (so every live store has a
 * reachable, accountable owner) and at least one active product.
 */
export async function publishStore(userId: string, storeId: string, meta: RequestMeta = {}) {
  const access = await requireStoreAccess(userId, storeId, "settings.write");
  if (access.store.status === "suspended") throw new AppError("forbidden", "المتجر موقوف من إدارة المنصة. تواصل مع الدعم.");
  const [owner] = await getDb().select({ verified: users.emailVerifiedAt }).from(users).where(eq(users.id, access.store.ownerUserId)).limit(1);
  if (!owner?.verified) throw new AppError("precondition", "يجب تأكيد البريد الإلكتروني لمالك المتجر قبل النشر.");
  await withTenant({ storeId, userId }, async (tx) => {
    const [{ active }] = await tx
      .select({ active: sql<number>`count(*)::int` })
      .from(products)
      .where(
        and(
          eq(products.status, "active"),
          sql`exists (select 1 from product_variants v where v.product_id = products.id and v.archived_at is null)`,
        ),
      );
    if (active === 0) throw new AppError("precondition", "أضف منتجاً واحداً على الأقل بحالة «منشور» قبل نشر المتجر.");
    await tx.update(stores).set({ status: "published", publishedAt: sql`coalesce(${stores.publishedAt}, now())` }).where(eq(stores.id, storeId));
    await audit({ storeId, actorId: userId, action: "store.published", targetType: "store", targetId: storeId, meta }, tx);
  });
}

export async function unpublishStore(userId: string, storeId: string, meta: RequestMeta = {}) {
  const access = await requireStoreAccess(userId, storeId, "settings.write");
  if (access.store.status !== "published") return;
  await withTenant({ storeId, userId }, async (tx) => {
    await tx.update(stores).set({ status: "paused" }).where(eq(stores.id, storeId));
    await audit({ storeId, actorId: userId, action: "store.paused", targetType: "store", targetId: storeId, meta }, tx);
  });
}

export type ChecklistItem = { key: string; label: string; done: boolean; available: boolean; href?: string };

/**
 * Setup checklist derived from real data, never from stored flags, so it
 * cannot drift from the store's actual state. `available: false` marks
 * steps whose feature is not built yet; the UI shows them as upcoming.
 */
export async function getSetupChecklist(access: StoreAccess): Promise<ChecklistItem[]> {
  const settings = await getStoreSettings(access);
  const [owner] = await getDb()
    .select({ emailVerifiedAt: users.emailVerifiedAt })
    .from(users)
    .where(eq(users.id, access.store.ownerUserId))
    .limit(1);
  const base = `/dashboard/${access.storeId}`;
  const productCounts = await withTenant({ storeId: access.storeId, userId: access.userId }, async (tx) => {
    const [row] = await tx
      .select({
        total: sql<number>`count(*)::int`,
        active: sql<number>`count(*) filter (where ${products.status} = 'active')::int`,
      })
      .from(products)
      .where(sql`${products.status} <> 'archived'`);
    return row;
  });
  return [
    { key: "verify_email", label: "تأكيد البريد الإلكتروني", done: !!owner?.emailVerifiedAt, available: true, href: "/account/security" },
    { key: "first_product", label: "إضافة أول منتج", done: productCounts.total > 0, available: true, href: `${base}/products/new` },
    { key: "product_active", label: "نشر منتج واحد على الأقل", done: productCounts.active > 0, available: true, href: `${base}/products` },
    { key: "contact", label: "إضافة معلومات التواصل", done: !!(settings.contactPhone || settings.whatsapp || settings.contactEmail), available: true, href: `${base}/settings` },
    { key: "logo", label: "رفع الشعار", done: !!settings.logoUrl, available: true, href: `${base}/settings` },
    { key: "publish", label: "نشر المتجر", done: access.store.status === "published", available: true, href: `${base}#publish` },
    { key: "shipping", label: "ضبط الشحن", done: false, available: false },
    { key: "payments", label: "تفعيل وسائل الدفع", done: false, available: false },
  ];
}

/** Public storefront lookup by subdomain slug. */
export async function getStorefront(slug: string) {
  if (!/^[a-z0-9-]{1,63}$/.test(slug.toLowerCase())) return null;
  const [store] = await getDb()
    .select({ id: stores.id, name: stores.name, slug: stores.slug, status: stores.status })
    .from(stores)
    .where(eq(stores.slug, slug.toLowerCase()))
    .limit(1);
  if (!store) return null;
  const settings = await withTenant({ storeId: store.id }, async (tx) => {
    const [row] = await tx
      .select({ brandColor: storeSettings.brandColor, whatsapp: storeSettings.whatsapp, logoUrl: storeSettings.logoUrl })
      .from(storeSettings)
      .where(eq(storeSettings.storeId, store.id))
      .limit(1);
    return row;
  });
  return { ...store, ...settings };
}
