import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import { audit, type RequestMeta } from "../audit";
import { customers } from "../db/schema";
import { withTenant } from "../db/tenant";
import { AppError, notFound } from "../lib/errors";
import { isUuid } from "../lib/ids";
import { requireStoreAccess } from "../stores/service";

// Segments are explicit rules over stored counters, so merchants can see
// exactly why a customer is in a segment.
export const SEGMENTS = {
  all: { label: "كل العملاء", rule: "" },
  new: { label: "عملاء جدد", rule: "أول طلب خلال آخر 30 يوماً" },
  repeat: { label: "عملاء متكررون", rule: "طلبان أو أكثر" },
  inactive: { label: "لم يشتروا منذ فترة", rule: "آخر طلب قبل أكثر من 90 يوماً" },
  cancellers: { label: "إلغاءات متكررة", rule: "طلبان ملغيان أو أكثر" },
  subscribers: { label: "مشتركون في العروض", rule: "وافقوا على استقبال الرسائل التسويقية" },
} as const;
export type Segment = keyof typeof SEGMENTS;

function segmentCondition(segment: Segment): SQL | undefined {
  switch (segment) {
    case "new":
      return sql`${customers.firstOrderAt} >= now() - interval '30 days'`;
    case "repeat":
      return sql`${customers.ordersCount} >= 2`;
    case "inactive":
      return sql`${customers.lastOrderAt} < now() - interval '90 days'`;
    case "cancellers":
      return sql`${customers.cancelledCount} >= 2`;
    case "subscribers":
      return eq(customers.acceptsMarketing, true);
    default:
      return undefined;
  }
}

export const CUSTOMERS_PAGE_SIZE = 30;

export async function listCustomers(userId: string, storeId: string, opts: { segment?: Segment; q?: string; page?: number } = {}) {
  await requireStoreAccess(userId, storeId, "customers.read");
  const page = Math.max(1, Math.floor(opts.page ?? 1));
  return withTenant({ storeId, userId }, async (tx) => {
    const conditions: (SQL | undefined)[] = [segmentCondition(opts.segment ?? "all"), sql`${customers.anonymizedAt} is null`];
    const q = opts.q?.trim();
    if (q) {
      const digits = q.replace(/\D/g, "");
      const like = `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
      conditions.push(digits.length >= 4 ? sql`(${customers.phone} like ${`%${digits.slice(-9)}%`} or ${customers.name} ilike ${like})` : sql`${customers.name} ilike ${like}`);
    }
    const where = and(...conditions);
    const rows = await tx.select().from(customers).where(where).orderBy(desc(customers.lastOrderAt)).limit(CUSTOMERS_PAGE_SIZE).offset((page - 1) * CUSTOMERS_PAGE_SIZE);
    const [{ total }] = await tx.select({ total: sql<number>`count(*)::int` }).from(customers).where(where);
    return { rows, total, page, pageCount: Math.max(1, Math.ceil(total / CUSTOMERS_PAGE_SIZE)) };
  });
}

export async function getCustomer(userId: string, storeId: string, customerId: string) {
  await requireStoreAccess(userId, storeId, "customers.read");
  if (!isUuid(customerId)) throw notFound();
  return withTenant({ storeId, userId }, async (tx) => {
    const [row] = await tx.select().from(customers).where(eq(customers.id, customerId)).limit(1);
    if (!row) throw notFound();
    return row;
  });
}

export async function updateCustomerNote(userId: string, storeId: string, customerId: string, note: string) {
  await requireStoreAccess(userId, storeId, "orders.write");
  if (!isUuid(customerId)) throw notFound();
  await withTenant({ storeId, userId }, async (tx) => {
    const rows = await tx.update(customers).set({ note: note.trim().slice(0, 2000) || null }).where(eq(customers.id, customerId)).returning({ id: customers.id });
    if (!rows.length) throw notFound();
  });
}

/**
 * Honors a customer's erasure request: personal data is replaced, while the
 * order history (needed for accounting) stays with anonymized contact details.
 */
export async function anonymizeCustomer(userId: string, storeId: string, customerId: string, meta: RequestMeta = {}) {
  await requireStoreAccess(userId, storeId, "settings.write");
  if (!isUuid(customerId)) throw notFound();
  await withTenant({ storeId, userId }, async (tx) => {
    const [row] = await tx.select().from(customers).where(eq(customers.id, customerId)).limit(1);
    if (!row) throw notFound();
    if (row.anonymizedAt) throw new AppError("invalid_state", "تم حذف بيانات هذا العميل مسبقاً.");
    await tx
      .update(customers)
      .set({
        name: "عميل محذوف",
        phone: `+000${customerId.replace(/\D/g, "").slice(0, 11).padEnd(8, "0")}`,
        email: null,
        note: null,
        acceptsMarketing: false,
        anonymizedAt: sql`now()`,
      })
      .where(eq(customers.id, customerId));
    await tx.execute(sql`
      update orders set customer_snapshot = jsonb_build_object('name', 'عميل محذوف', 'phone', '', 'email', null),
        shipping_address = jsonb_build_object('city', shipping_address->>'city', 'district', '', 'street', '', 'details', '', 'postalCode', '')
      where customer_id = ${customerId}`);
    await audit({ storeId, actorId: userId, action: "customer.anonymized", targetType: "customer", targetId: customerId, meta }, tx);
  });
}

/** CSV export (UTF-8 with BOM so Excel shows Arabic correctly). */
export async function exportCustomersCsv(userId: string, storeId: string, meta: RequestMeta = {}) {
  await requireStoreAccess(userId, storeId, "customers.export");
  const rows = await withTenant({ storeId, userId }, (tx) =>
    tx.select().from(customers).where(sql`${customers.anonymizedAt} is null`).orderBy(desc(customers.lastOrderAt)).limit(50_000),
  );
  await audit({ storeId, actorId: userId, action: "customers.exported", metadata: { count: rows.length }, meta });
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    // Neutralize spreadsheet formulas (CSV injection).
    const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
    return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const header = ["الاسم", "الجوال", "البريد", "عدد الطلبات", "إجمالي المشتريات", "آخر طلب", "يقبل التسويق"];
  const lines = rows.map((c) =>
    [c.name, c.phone, c.email, c.ordersCount, (c.totalSpent / 100).toFixed(2), c.lastOrderAt?.toISOString().slice(0, 10) ?? "", c.acceptsMarketing ? "نعم" : "لا"].map(esc).join(","),
  );
  return "﻿" + [header.join(","), ...lines].join("\n");
}
