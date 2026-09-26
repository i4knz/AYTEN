import { asc, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import type { RequestMeta } from "../audit";
import { announcements, HELP_CATEGORIES, helpArticles, notifications, stores, supportTickets, TICKET_STATUSES, ticketMessages, users } from "../db/schema";
import { AppError, isUniqueViolation, notFound } from "../lib/errors";
import { isUuid, uuidv7 } from "../lib/ids";
import { requireAdmin } from "./access";
import { adminAudit, adminTx, getAdminDb } from "./db";

// ---------------------------------------------------------------------------
// Ticket queue
// ---------------------------------------------------------------------------

export async function listTicketQueue(adminId: string, filter = "active") {
  await requireAdmin(adminId, "support.manage");
  const where =
    filter === "active"
      ? inArray(supportTickets.status, ["open", "waiting_support"])
      : (TICKET_STATUSES as readonly string[]).includes(filter)
        ? eq(supportTickets.status, filter as "open")
        : undefined;
  return getAdminDb()
    .select({ ticket: supportTickets, storeName: stores.name, assignee: users.name })
    .from(supportTickets)
    .innerJoin(stores, eq(stores.id, supportTickets.storeId))
    .leftJoin(users, eq(users.id, supportTickets.assigneeId))
    .where(where)
    .orderBy(asc(supportTickets.priority), asc(supportTickets.updatedAt))
    .limit(200);
}

export async function getTicketAdmin(adminId: string, ticketId: string) {
  await requireAdmin(adminId, "support.manage");
  if (!isUuid(ticketId)) throw notFound();
  const db = getAdminDb();
  const [row] = await db
    .select({ ticket: supportTickets, store: { id: stores.id, name: stores.name, slug: stores.slug, status: stores.status } })
    .from(supportTickets)
    .innerJoin(stores, eq(stores.id, supportTickets.storeId))
    .where(eq(supportTickets.id, ticketId))
    .limit(1);
  if (!row) throw notFound();
  const messages = await db
    .select({ message: ticketMessages, authorName: users.name })
    .from(ticketMessages)
    .leftJoin(users, eq(users.id, ticketMessages.authorId))
    .where(eq(ticketMessages.ticketId, ticketId))
    .orderBy(asc(ticketMessages.createdAt));
  return { ...row, messages };
}

const replySchema = z.object({
  body: z.string().trim().min(1, { error: "اكتب الرد." }).max(5000),
  internal: z.boolean(),
  status: z.enum(TICKET_STATUSES).optional(),
});

export async function replyAsSupport(adminId: string, ticketId: string, input: unknown, meta: RequestMeta = {}) {
  await requireAdmin(adminId, "support.manage");
  if (!isUuid(ticketId)) throw notFound();
  const parsed = replySchema.safeParse(input);
  if (!parsed.success) throw new AppError("validation", parsed.error.issues[0].message, { body: parsed.error.issues[0].message });
  const { body, internal } = parsed.data;
  await adminTx(async (tx) => {
    const [ticket] = await tx.select().from(supportTickets).where(eq(supportTickets.id, ticketId)).for("update").limit(1);
    if (!ticket) throw notFound();
    await tx.insert(ticketMessages).values({ id: uuidv7(), storeId: ticket.storeId, ticketId, authorId: adminId, authorType: "support", body, internal });
    if (!internal) {
      const status = parsed.data.status ?? "waiting_merchant";
      await tx.update(supportTickets).set({ status, assigneeId: ticket.assigneeId ?? adminId }).where(eq(supportTickets.id, ticketId));
      await tx.insert(notifications).values({
        id: uuidv7(),
        storeId: ticket.storeId,
        type: "support.reply",
        title: `رد الدعم على التذكرة #${ticket.number}`,
        body: body.slice(0, 140),
        link: `/dashboard/${ticket.storeId}/help/tickets/${ticketId}`,
      });
    }
    await adminAudit(tx, { adminId, storeId: ticket.storeId, action: internal ? "admin.ticket_note" : "admin.ticket_reply", targetType: "ticket", targetId: ticketId, meta });
  });
}

const ticketUpdateSchema = z.object({
  status: z.enum(TICKET_STATUSES),
  priority: z.coerce.number().int().min(1).max(4),
  assignToMe: z.boolean(),
});

export async function updateTicketAdmin(adminId: string, ticketId: string, input: unknown, meta: RequestMeta = {}) {
  await requireAdmin(adminId, "support.manage");
  if (!isUuid(ticketId)) throw notFound();
  const parsed = ticketUpdateSchema.safeParse(input);
  if (!parsed.success) throw new AppError("validation", "قيم غير صالحة.");
  const { status, priority, assignToMe } = parsed.data;
  await adminTx(async (tx) => {
    const [ticket] = await tx
      .update(supportTickets)
      .set({ status, priority, ...(assignToMe ? { assigneeId: adminId } : {}) })
      .where(eq(supportTickets.id, ticketId))
      .returning();
    if (!ticket) throw notFound();
    await adminAudit(tx, { adminId, storeId: ticket.storeId, action: "admin.ticket_updated", targetType: "ticket", targetId: ticketId, metadata: { status, priority }, meta });
  });
}

// ---------------------------------------------------------------------------
// Help center CMS
// ---------------------------------------------------------------------------

export async function listHelpArticlesAdmin(adminId: string) {
  await requireAdmin(adminId, "content.manage");
  return getAdminDb().select().from(helpArticles).orderBy(asc(helpArticles.category), asc(helpArticles.position), asc(helpArticles.title));
}

export async function getHelpArticleAdmin(adminId: string, id: string) {
  await requireAdmin(adminId, "content.manage");
  if (!isUuid(id)) throw notFound();
  const [row] = await getAdminDb().select().from(helpArticles).where(eq(helpArticles.id, id)).limit(1);
  if (!row) throw notFound();
  return row;
}

const articleSchema = z.object({
  title: z.string().trim().min(1, { error: "العنوان مطلوب." }).max(150),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[^/?#\s]{1,80}$/, { error: "الرابط بدون مسافات أو رموز / ? #" }),
  category: z.enum(HELP_CATEGORIES),
  body: z.string().trim().min(1, { error: "المحتوى مطلوب." }).max(30000),
  position: z.coerce.number().int().min(0).max(1000).default(0),
  published: z.boolean(),
});

export async function saveHelpArticle(adminId: string, id: string | null, input: unknown, meta: RequestMeta = {}) {
  await requireAdmin(adminId, "content.manage");
  if (id && !isUuid(id)) throw notFound();
  const parsed = articleSchema.safeParse(input);
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) errors[String(issue.path[0])] ??= issue.message;
    throw new AppError("validation", "راجع الحقول المظللة.", errors);
  }
  try {
    return await adminTx(async (tx) => {
      const articleId = id ?? uuidv7();
      if (id) {
        const updated = await tx.update(helpArticles).set({ ...parsed.data, updatedBy: adminId }).where(eq(helpArticles.id, id)).returning({ id: helpArticles.id });
        if (!updated.length) throw notFound();
      } else {
        await tx.insert(helpArticles).values({ id: articleId, ...parsed.data, updatedBy: adminId });
      }
      await adminAudit(tx, { adminId, action: id ? "admin.help_updated" : "admin.help_created", targetType: "help_article", targetId: articleId, meta });
      return { id: articleId };
    });
  } catch (err) {
    if (isUniqueViolation(err, "help_articles_slug_key")) throw new AppError("validation", "راجع الحقول المظللة.", { slug: "هذا الرابط مستخدم لمقال آخر." });
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Announcements shown on merchant dashboards
// ---------------------------------------------------------------------------

export async function listAnnouncementsAdmin(adminId: string) {
  await requireAdmin(adminId, "content.manage");
  return getAdminDb().select().from(announcements).orderBy(desc(announcements.createdAt)).limit(50);
}

const announcementSchema = z.object({
  title: z.string().trim().min(1, { error: "العنوان مطلوب." }).max(120),
  body: z.string().trim().max(1000).default(""),
  level: z.enum(["info", "warning"]),
  days: z.coerce.number().int().min(1).max(365),
});

export async function createAnnouncement(adminId: string, input: unknown, meta: RequestMeta = {}) {
  await requireAdmin(adminId, "content.manage");
  const parsed = announcementSchema.safeParse(input);
  if (!parsed.success) throw new AppError("validation", parsed.error.issues[0].message);
  const { title, body, level, days } = parsed.data;
  await adminTx(async (tx) => {
    const id = uuidv7();
    await tx.insert(announcements).values({ id, title, body, level, endsAt: sql`now() + make_interval(days => ${days})`, createdBy: adminId });
    await adminAudit(tx, { adminId, action: "admin.announcement_created", targetType: "announcement", targetId: id, metadata: { title, days }, meta });
  });
}

export async function deleteAnnouncement(adminId: string, id: string, meta: RequestMeta = {}) {
  await requireAdmin(adminId, "content.manage");
  if (!isUuid(id)) throw notFound();
  await adminTx(async (tx) => {
    await tx.delete(announcements).where(eq(announcements.id, id));
    await adminAudit(tx, { adminId, action: "admin.announcement_deleted", targetType: "announcement", targetId: id, meta });
  });
}
