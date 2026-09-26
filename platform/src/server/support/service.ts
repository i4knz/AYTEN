import { and, asc, desc, eq, gt, ilike, isNull, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import { audit, type RequestMeta } from "../audit";
import { getDb } from "../db/client";
import { announcements, helpArticles, supportTickets, ticketMessages, HELP_CATEGORIES, TICKET_CATEGORIES } from "../db/schema";
import { withTenant } from "../db/tenant";
import { AppError, notFound, rateLimited } from "../lib/errors";
import { isUuid, uuidv7 } from "../lib/ids";
import { consume } from "../lib/rate-limit";
import { requireStoreAccess } from "../stores/service";

export type TicketCategory = (typeof TICKET_CATEGORIES)[number];
export type HelpCategory = (typeof HELP_CATEGORIES)[number];

export const HELP_CATEGORY_LABELS: Record<HelpCategory, string> = {
  start: "البداية",
  products: "المنتجات",
  orders: "الطلبات",
  payments: "المدفوعات والرصيد",
  shipping: "الشحن",
  marketing: "التسويق",
  account: "الحساب والاشتراك",
};

export const TICKET_CATEGORY_LABELS: Record<TicketCategory, string> = {
  store_down: "المتجر لا يعمل",
  checkout: "العملاء لا يستطيعون الطلب",
  payments: "المدفوعات أو الرصيد",
  orders: "الطلبات",
  billing: "الاشتراك والفواتير",
  technical: "مشكلة تقنية أخرى",
  question: "استفسار",
};

/** Priority follows impact on the merchant's sales: 1 = store cannot sell at all. */
export const TICKET_PRIORITY: Record<TicketCategory, 1 | 2 | 3 | 4> = {
  store_down: 1,
  checkout: 1,
  payments: 2,
  orders: 2,
  billing: 3,
  technical: 3,
  question: 4,
};

export const PRIORITY_LABELS = { 1: "عاجل", 2: "مرتفع", 3: "عادي", 4: "منخفض" } as const;

export const TICKET_STATUS_LABELS = {
  open: "جديدة",
  waiting_support: "بانتظار الدعم",
  waiting_merchant: "بانتظار ردك",
  resolved: "تم الحل",
  closed: "مغلقة",
} as const;

// ---------------------------------------------------------------------------
// Help center (public to signed-in merchants)
// ---------------------------------------------------------------------------

export async function listHelpArticles({ q, category }: { q?: string; category?: string } = {}) {
  const conditions = [eq(helpArticles.published, true)];
  if (category && (HELP_CATEGORIES as readonly string[]).includes(category)) conditions.push(eq(helpArticles.category, category as HelpCategory));
  const term = q?.trim().slice(0, 80);
  if (term) {
    const like = `%${term.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    conditions.push(or(ilike(helpArticles.title, like), ilike(helpArticles.body, like))!);
  }
  return getDb()
    .select({ id: helpArticles.id, slug: helpArticles.slug, category: helpArticles.category, title: helpArticles.title, excerpt: sql<string>`left(${helpArticles.body}, 160)` })
    .from(helpArticles)
    .where(and(...conditions))
    .orderBy(asc(helpArticles.category), asc(helpArticles.position), asc(helpArticles.title));
}

export async function getHelpArticle(slug: string) {
  const [row] = await getDb().select().from(helpArticles).where(and(eq(helpArticles.slug, slug), eq(helpArticles.published, true))).limit(1);
  return row ?? null;
}

export async function listActiveAnnouncements(now = new Date()) {
  return getDb()
    .select()
    .from(announcements)
    .where(and(lte(announcements.startsAt, now), or(isNull(announcements.endsAt), gt(announcements.endsAt, now))))
    .orderBy(desc(announcements.startsAt))
    .limit(3);
}

// ---------------------------------------------------------------------------
// Support tickets (store-scoped)
// ---------------------------------------------------------------------------

const ticketSchema = z.object({
  subject: z.string().trim().min(3, { error: "اكتب عنواناً واضحاً للمشكلة." }).max(150),
  category: z.enum(TICKET_CATEGORIES, { error: "اختر نوع المشكلة." }),
  body: z.string().trim().min(10, { error: "اشرح المشكلة بتفصيل أكثر (10 أحرف على الأقل)." }).max(5000),
});

export async function createTicket(userId: string, storeId: string, input: unknown, meta: RequestMeta = {}) {
  await requireStoreAccess(userId, storeId);
  const parsed = ticketSchema.safeParse(input);
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) errors[String(issue.path[0])] ??= issue.message;
    throw new AppError("validation", "راجع الحقول المظللة.", errors);
  }
  if (!(await consume(`tickets:${storeId}`, { limit: 10, windowSeconds: 86_400 }))) throw rateLimited();
  const { subject, category, body } = parsed.data;
  return withTenant({ storeId, userId }, async (tx) => {
    const id = uuidv7();
    const [ticket] = await tx
      .insert(supportTickets)
      .values({ id, storeId, openedBy: userId, subject, category, priority: TICKET_PRIORITY[category] })
      .returning();
    await tx.insert(ticketMessages).values({ id: uuidv7(), storeId, ticketId: id, authorId: userId, authorType: "merchant", body });
    await audit({ storeId, actorId: userId, action: "support.ticket_opened", targetType: "ticket", targetId: id, metadata: { category }, meta }, tx);
    return ticket;
  });
}

export async function listTickets(userId: string, storeId: string) {
  await requireStoreAccess(userId, storeId);
  return withTenant({ storeId, userId }, (tx) => tx.select().from(supportTickets).orderBy(desc(supportTickets.updatedAt)).limit(100));
}

/** A ticket with its messages. Internal support notes are never returned to merchants. */
export async function getTicket(userId: string, storeId: string, ticketId: string) {
  await requireStoreAccess(userId, storeId);
  if (!isUuid(ticketId)) throw notFound();
  return withTenant({ storeId, userId }, async (tx) => {
    const [ticket] = await tx.select().from(supportTickets).where(eq(supportTickets.id, ticketId)).limit(1);
    if (!ticket) throw notFound();
    const messages = await tx
      .select()
      .from(ticketMessages)
      .where(and(eq(ticketMessages.ticketId, ticketId), eq(ticketMessages.internal, false)))
      .orderBy(asc(ticketMessages.createdAt));
    return { ticket, messages };
  });
}

export async function replyToTicket(userId: string, storeId: string, ticketId: string, body: unknown) {
  await requireStoreAccess(userId, storeId);
  if (!isUuid(ticketId)) throw notFound();
  const text = typeof body === "string" ? body.trim() : "";
  if (text.length < 1 || text.length > 5000) throw new AppError("validation", "اكتب ردك.", { body: "اكتب ردك." });
  await withTenant({ storeId, userId }, async (tx) => {
    const [ticket] = await tx.select().from(supportTickets).where(eq(supportTickets.id, ticketId)).for("update").limit(1);
    if (!ticket) throw notFound();
    if (ticket.status === "closed") throw new AppError("invalid_state", "التذكرة مغلقة. افتح تذكرة جديدة.");
    await tx.insert(ticketMessages).values({ id: uuidv7(), storeId, ticketId, authorId: userId, authorType: "merchant", body: text });
    await tx.update(supportTickets).set({ status: "waiting_support" }).where(eq(supportTickets.id, ticketId));
  });
}

export async function closeTicket(userId: string, storeId: string, ticketId: string, rating?: number) {
  await requireStoreAccess(userId, storeId);
  if (!isUuid(ticketId)) throw notFound();
  const score = rating && Number.isInteger(rating) && rating >= 1 && rating <= 5 ? rating : null;
  await withTenant({ storeId, userId }, async (tx) => {
    const [row] = await tx
      .update(supportTickets)
      .set({ status: "closed", ...(score ? { rating: score } : {}) })
      .where(eq(supportTickets.id, ticketId))
      .returning({ id: supportTickets.id });
    if (!row) throw notFound();
  });
}
