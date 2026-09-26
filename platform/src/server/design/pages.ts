import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { audit, type RequestMeta } from "../audit";
import { fieldErrors } from "../auth/schemas";
import { pages } from "../db/schema";
import { withTenant } from "../db/tenant";
import { AppError, isUniqueViolation, notFound } from "../lib/errors";
import { isUuid, uuidv7 } from "../lib/ids";
import { toCatalogSlug } from "../catalog/schemas";
import { requireStoreAccess } from "../stores/service";

// Starting points only. Merchants must adapt them to their business, and
// they are not legal advice. The Saudi E-Commerce Law gives consumers rights
// (e.g. withdrawal/return rules) that a store policy cannot remove. [Verify
// wording with a lawyer before launch.]
export const PAGE_TEMPLATES = {
  about: { title: "من نحن", body: "## قصتنا\nاكتب هنا نبذة عن متجرك: متى بدأت، وما الذي تقدمه، ولماذا يختارك العملاء.\n\n## تواصل معنا\n- واتساب: \n- البريد الإلكتروني: " },
  returns: {
    title: "سياسة الاستبدال والاسترجاع",
    body: "## مدة الاسترجاع\nيحق لك استرجاع المنتج خلال ___ أيام من تاريخ الاستلام بشرط أن يكون بحالته الأصلية.\n\n## المنتجات غير القابلة للاسترجاع\n- \n\n## طريقة الاسترجاع\n1. تواصل معنا عبر واتساب مع رقم الطلب.\n2. نرسل لك طريقة الشحن.\n3. يُعاد المبلغ بنفس طريقة الدفع خلال ___ أيام عمل بعد استلام المنتج.",
  },
  shipping: { title: "سياسة الشحن", body: "## مدة التوصيل\n- داخل المدينة: \n- باقي المدن: \n\n## رسوم الشحن\nتظهر الرسوم عند إتمام الطلب حسب مدينتك." },
  privacy: {
    title: "سياسة الخصوصية",
    body: "## البيانات التي نجمعها\nالاسم ورقم الجوال والعنوان والبريد الإلكتروني (إن وُجد) لتنفيذ طلبك والتواصل معك.\n\n## استخدام البيانات\nلا نبيع بياناتك. نشاركها فقط مع شركة الشحن لتوصيل طلبك.\n\n## حقوقك\nيمكنك طلب الاطلاع على بياناتك أو تصحيحها أو حذفها بالتواصل معنا.",
  },
  terms: { title: "الشروط والأحكام", body: "## الطلبات\nيُعد الطلب مؤكداً بعد استلام رسالة التأكيد.\n\n## الأسعار\nالأسعار بالريال السعودي.\n\n## التواصل\nلأي استفسار تواصل معنا." },
} as const;
export type PageTemplate = keyof typeof PAGE_TEMPLATES;

export const pageSchema = z.object({
  title: z.string().trim().min(1, { error: "العنوان مطلوب." }).max(120),
  slug: z.string().trim().max(80).optional().default(""),
  body: z.string().max(30000, { error: "المحتوى طويل جداً." }).default(""),
  published: z.boolean().default(true),
  showInFooter: z.boolean().default(true),
});

export async function listPages(userId: string, storeId: string) {
  await requireStoreAccess(userId, storeId, "products.read");
  return withTenant({ storeId, userId }, (tx) => tx.select().from(pages).orderBy(asc(pages.position), asc(pages.createdAt)));
}

export async function getPage(userId: string, storeId: string, pageId: string) {
  await requireStoreAccess(userId, storeId, "products.read");
  if (!isUuid(pageId)) throw notFound();
  return withTenant({ storeId, userId }, async (tx) => {
    const [row] = await tx.select().from(pages).where(eq(pages.id, pageId)).limit(1);
    if (!row) throw notFound();
    return row;
  });
}

export async function savePage(userId: string, storeId: string, pageId: string | null, input: unknown, meta: RequestMeta = {}) {
  await requireStoreAccess(userId, storeId, "design.write");
  const parsed = pageSchema.safeParse(input);
  if (!parsed.success) throw new AppError("validation", "راجع الحقول المظللة.", fieldErrors(parsed.error));
  const p = parsed.data;
  if (pageId && !isUuid(pageId)) throw notFound();
  const slug = toCatalogSlug(p.slug || p.title, "page");
  try {
    return await withTenant({ storeId, userId }, async (tx) => {
      const id = pageId ?? uuidv7();
      const values = { title: p.title, slug, body: p.body, published: p.published, showInFooter: p.showInFooter };
      if (pageId) {
        const rows = await tx.update(pages).set(values).where(eq(pages.id, pageId)).returning({ id: pages.id });
        if (!rows.length) throw notFound();
      } else {
        await tx.insert(pages).values({ id, storeId, ...values });
      }
      await audit({ storeId, actorId: userId, action: pageId ? "page.updated" : "page.created", targetType: "page", targetId: id, meta }, tx);
      return { pageId: id, slug };
    });
  } catch (err) {
    if (isUniqueViolation(err, "pages_store_id_slug_key")) throw new AppError("validation", "راجع الحقول المظللة.", { slug: "يوجد صفحة بنفس الرابط." });
    throw err;
  }
}

export async function createPageFromTemplate(userId: string, storeId: string, template: PageTemplate) {
  const t = PAGE_TEMPLATES[template];
  if (!t) throw new AppError("validation", "قالب غير موجود.");
  return savePage(userId, storeId, null, { title: t.title, slug: template, body: t.body, published: false, showInFooter: true });
}

export async function deletePage(userId: string, storeId: string, pageId: string) {
  await requireStoreAccess(userId, storeId, "design.write");
  if (!isUuid(pageId)) throw notFound();
  await withTenant({ storeId, userId }, async (tx) => {
    const rows = await tx.delete(pages).where(eq(pages.id, pageId)).returning({ id: pages.id });
    if (!rows.length) throw notFound();
  });
}

export async function getPublicPage(storeId: string, slug: string) {
  return withTenant({ storeId }, async (tx) => {
    const [row] = await tx.select().from(pages).where(eq(pages.slug, slug)).limit(1);
    return row?.published ? row : null;
  });
}

export async function listFooterPages(storeId: string) {
  return withTenant({ storeId }, (tx) =>
    tx.select({ title: pages.title, slug: pages.slug, published: pages.published, showInFooter: pages.showInFooter }).from(pages).orderBy(asc(pages.position), asc(pages.createdAt)),
  ).then((rows) => rows.filter((r) => r.published && r.showInFooter));
}

// --- Minimal, safe markup: "## heading", "- item", "1. item", paragraphs. Output is React elements, never HTML. ---
export type Block = { type: "h"; text: string } | { type: "ul"; items: string[] } | { type: "ol"; items: string[] } | { type: "p"; text: string };

export function parseBody(body: string): Block[] {
  const blocks: Block[] = [];
  for (const chunk of body.replace(/\r\n/g, "\n").split(/\n{2,}/)) {
    const lines = chunk.split("\n").filter((l) => l.trim());
    let para: string[] = [];
    const flush = () => {
      if (para.length) blocks.push({ type: "p", text: para.join("\n") });
      para = [];
    };
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith("## ")) {
        flush();
        blocks.push({ type: "h", text: line.slice(3) });
      } else if (/^[-•] /.test(line) || /^\d+[.)] /.test(line)) {
        flush();
        const ordered = /^\d/.test(line);
        const items: string[] = [];
        while (i < lines.length && (ordered ? /^\d+[.)] /.test(lines[i].trim()) : /^[-•] /.test(lines[i].trim()))) {
          items.push(lines[i].trim().replace(/^([-•]|\d+[.)]) /, ""));
          i++;
        }
        i--;
        blocks.push(ordered ? { type: "ol", items } : { type: "ul", items });
      } else {
        para.push(line);
      }
    }
    flush();
  }
  return blocks;
}
