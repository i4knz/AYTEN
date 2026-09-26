import { and, asc, eq, isNull, ne, sql } from "drizzle-orm";
import { z } from "zod";
import type { RequestMeta } from "../audit";
import { ADMIN_ROLES, platformAdmins, platformSettings, plans, subscriptions, users } from "../db/schema";
import { AppError, isUniqueViolation, notFound } from "../lib/errors";
import { isValidSaudiIban, normalizeIban } from "../lib/iban";
import { isUuid, uuidv7 } from "../lib/ids";
import { parseMoney } from "../lib/money";
import { getPlatformSettings, type PlatformSettings } from "../platform/settings";
import { requireAdmin } from "./access";
import { adminAudit, adminTx, getAdminDb } from "./db";

function issuesToErrors(issues: { path: PropertyKey[]; message: string }[]) {
  const errors: Record<string, string> = {};
  for (const issue of issues) errors[String(issue.path[0])] ??= issue.message;
  return errors;
}

// ---------------------------------------------------------------------------
// Plans
// ---------------------------------------------------------------------------

export async function listPlansAdmin(adminId: string) {
  await requireAdmin(adminId, "billing.manage");
  return getAdminDb()
    .select({ plan: plans, stores: sql<number>`(select count(*)::int from subscriptions s where s.plan_id = plans.id)` })
    .from(plans)
    .orderBy(asc(plans.position), asc(plans.createdAt));
}

export async function getPlanAdmin(adminId: string, planId: string) {
  await requireAdmin(adminId, "billing.manage");
  if (!isUuid(planId)) throw notFound();
  const [plan] = await getAdminDb().select().from(plans).where(eq(plans.id, planId)).limit(1);
  if (!plan) throw notFound();
  return plan;
}

const money = (label: string) =>
  z
    .string()
    .trim()
    .transform((v, ctx) => {
      const n = v === "" ? 0 : parseMoney(v);
      if (n == null || n < 0) {
        ctx.addIssue({ code: "custom", message: `${label} غير صحيح.` });
        return z.NEVER;
      }
      return n;
    });

const optionalLimit = z
  .string()
  .trim()
  .transform((v, ctx) => {
    if (v === "") return null;
    const n = Number(v);
    if (!Number.isInteger(n) || n < 0 || n > 1_000_000) {
      ctx.addIssue({ code: "custom", message: "رقم صحيح أو اتركه فارغاً لغير محدود." });
      return z.NEVER;
    }
    return n;
  });

const planSchema = z.object({
  key: z.string().trim().toLowerCase().regex(/^[a-z0-9_]{2,30}$/, { error: "أحرف إنجليزية صغيرة وأرقام و _ فقط." }),
  name: z.string().trim().min(1, { error: "الاسم مطلوب." }).max(60),
  description: z.string().trim().max(300).default(""),
  priceMonthly: money("السعر الشهري"),
  priceYearly: money("السعر السنوي"),
  trialDays: z.coerce.number().int().min(0).max(365),
  position: z.coerce.number().int().min(0).max(100),
  isPublic: z.boolean(),
  products: optionalLimit,
  staff: optionalLimit,
  ordersPerMonth: optionalLimit,
  campaigns: z.boolean(),
  advancedReports: z.boolean(),
  removeBranding: z.boolean(),
});

export async function savePlan(adminId: string, planId: string | null, input: unknown, meta: RequestMeta = {}) {
  await requireAdmin(adminId, "billing.manage");
  if (planId && !isUuid(planId)) throw notFound();
  const parsed = planSchema.safeParse(input);
  if (!parsed.success) throw new AppError("validation", "راجع الحقول المظللة.", issuesToErrors(parsed.error.issues));
  const d = parsed.data;
  const values = {
    key: d.key,
    name: d.name,
    description: d.description,
    priceMonthly: d.priceMonthly,
    priceYearly: d.priceYearly,
    trialDays: d.trialDays,
    position: d.position,
    isPublic: d.isPublic,
    limits: { products: d.products, staff: d.staff, ordersPerMonth: d.ordersPerMonth },
    features: { campaigns: d.campaigns, advancedReports: d.advancedReports, removeBranding: d.removeBranding },
  };
  try {
    return await adminTx(async (tx) => {
      const id = planId ?? uuidv7();
      if (planId) {
        const updated = await tx.update(plans).set(values).where(eq(plans.id, planId)).returning({ id: plans.id });
        if (!updated.length) throw notFound();
      } else {
        await tx.insert(plans).values({ id, ...values });
      }
      // Price changes apply to new invoices only; issued invoices keep their amounts.
      await adminAudit(tx, { adminId, action: planId ? "admin.plan_updated" : "admin.plan_created", targetType: "plan", targetId: id, metadata: { key: d.key, priceMonthly: d.priceMonthly, priceYearly: d.priceYearly }, meta });
      return { id };
    });
  } catch (err) {
    if (isUniqueViolation(err, "plans_key_key")) throw new AppError("validation", "راجع الحقول المظللة.", { key: "هذا المعرّف مستخدم." });
    throw err;
  }
}

export async function setDefaultPlan(adminId: string, planId: string, meta: RequestMeta = {}) {
  await requireAdmin(adminId, "billing.manage");
  if (!isUuid(planId)) throw notFound();
  await adminTx(async (tx) => {
    const [plan] = await tx.select().from(plans).where(and(eq(plans.id, planId), isNull(plans.archivedAt))).limit(1);
    if (!plan) throw notFound();
    await tx.update(plans).set({ isDefault: false }).where(ne(plans.id, planId));
    await tx.update(plans).set({ isDefault: true }).where(eq(plans.id, planId));
    await adminAudit(tx, { adminId, action: "admin.plan_default", targetType: "plan", targetId: planId, meta });
  });
}

export async function setPlanArchived(adminId: string, planId: string, archived: boolean, meta: RequestMeta = {}) {
  await requireAdmin(adminId, "billing.manage");
  if (!isUuid(planId)) throw notFound();
  await adminTx(async (tx) => {
    const [plan] = await tx.select().from(plans).where(eq(plans.id, planId)).limit(1);
    if (!plan) throw notFound();
    if (archived && plan.isDefault) throw new AppError("invalid_state", "لا يمكن أرشفة الباقة الافتراضية. اختر باقة افتراضية أخرى أولاً.");
    // Existing subscribers keep an archived plan; it just stops being offered.
    await tx.update(plans).set({ archivedAt: archived ? sql`now()` : null }).where(eq(plans.id, planId));
    await adminAudit(tx, { adminId, action: archived ? "admin.plan_archived" : "admin.plan_restored", targetType: "plan", targetId: planId, meta });
  });
}

export async function countSubscribers(planId: string) {
  const [row] = await getAdminDb().select({ n: sql<number>`count(*)::int` }).from(subscriptions).where(eq(subscriptions.planId, planId));
  return row.n;
}

// ---------------------------------------------------------------------------
// Platform settings
// ---------------------------------------------------------------------------

export async function getSettingsAdmin(adminId: string) {
  await requireAdmin(adminId, "settings.manage");
  return getPlatformSettings(getAdminDb());
}

const bps = z.coerce.number().int().min(0).max(10_000);

const SETTING_SCHEMAS = {
  fees: z.object({
    onlinePaymentFeeBps: bps,
    payoutHoldDays: z.coerce.number().int().min(0).max(90),
    minPayout: money("الحد الأدنى للسحب"),
  }),
  billing: z.object({
    bankName: z.string().trim().max(80),
    accountName: z.string().trim().max(120),
    iban: z
      .string()
      .transform(normalizeIban)
      .refine((v) => v === "" || isValidSaudiIban(v), { error: "آيبان غير صحيح." }),
    vatBps: bps,
    vatNumber: z
      .string()
      .trim()
      .refine((v) => v === "" || /^3\d{13}3$/.test(v), { error: "الرقم الضريبي 15 رقماً يبدأ وينتهي بـ 3." }),
    graceDays: z.coerce.number().int().min(0).max(60),
  }),
  support: z.object({
    email: z.union([z.literal(""), z.email({ error: "بريد غير صحيح." })]),
    whatsapp: z
      .string()
      .trim()
      .refine((v) => v === "" || /^\+?\d{9,15}$/.test(v), { error: "رقم غير صحيح." }),
  }),
  referrals: z.object({ rewardDays: z.coerce.number().int().min(0).max(365) }),
} satisfies Record<keyof PlatformSettings, z.ZodType>;

export async function saveSetting<K extends keyof PlatformSettings>(adminId: string, key: K, input: unknown, meta: RequestMeta = {}) {
  await requireAdmin(adminId, "settings.manage");
  const schema = SETTING_SCHEMAS[key];
  if (!schema) throw notFound();
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new AppError("validation", "راجع الحقول المظللة.", issuesToErrors(parsed.error.issues));
  await adminTx(async (tx) => {
    await tx
      .insert(platformSettings)
      .values({ key, value: parsed.data, updatedBy: adminId })
      .onConflictDoUpdate({ target: platformSettings.key, set: { value: parsed.data, updatedBy: adminId, updatedAt: sql`now()` } });
    await adminAudit(tx, { adminId, action: "admin.settings_updated", targetType: "platform_setting", metadata: { key, value: parsed.data }, meta });
  });
}

// ---------------------------------------------------------------------------
// Platform administrators
// ---------------------------------------------------------------------------

export async function listAdmins(adminId: string) {
  await requireAdmin(adminId, "admins.manage");
  return getAdminDb()
    .select({ userId: platformAdmins.userId, role: platformAdmins.role, createdAt: platformAdmins.createdAt, name: users.name, email: users.email })
    .from(platformAdmins)
    .innerJoin(users, eq(users.id, platformAdmins.userId))
    .orderBy(asc(platformAdmins.createdAt));
}

const grantSchema = z.object({
  email: z.email({ error: "بريد غير صحيح." }).transform((v) => v.toLowerCase()),
  role: z.enum(ADMIN_ROLES),
});

export async function grantAdmin(adminId: string, input: unknown, meta: RequestMeta = {}) {
  await requireAdmin(adminId, "admins.manage");
  const parsed = grantSchema.safeParse(input);
  if (!parsed.success) throw new AppError("validation", "راجع الحقول المظللة.", issuesToErrors(parsed.error.issues));
  await adminTx(async (tx) => {
    const [user] = await tx.select({ id: users.id }).from(users).where(eq(users.email, parsed.data.email)).limit(1);
    if (!user) throw new AppError("validation", "راجع الحقول المظللة.", { email: "لا يوجد حساب بهذا البريد. اطلب من الشخص التسجيل أولاً." });
    await tx.delete(platformAdmins).where(eq(platformAdmins.userId, user.id));
    await tx.insert(platformAdmins).values({ userId: user.id, role: parsed.data.role, createdBy: adminId });
    await adminAudit(tx, { adminId, action: "admin.admin_granted", targetType: "user", targetId: user.id, metadata: { role: parsed.data.role }, meta });
  });
}

export async function revokeAdmin(adminId: string, userId: string, meta: RequestMeta = {}) {
  await requireAdmin(adminId, "admins.manage");
  if (!isUuid(userId)) throw notFound();
  if (userId === adminId) throw new AppError("invalid_state", "لا يمكنك إزالة صلاحيتك بنفسك.");
  await adminTx(async (tx) => {
    const [target] = await tx.select().from(platformAdmins).where(eq(platformAdmins.userId, userId)).limit(1);
    if (!target) throw notFound();
    if (target.role === "owner") {
      const [{ owners }] = await tx.select({ owners: sql<number>`count(*)::int` }).from(platformAdmins).where(eq(platformAdmins.role, "owner"));
      if (owners <= 1) throw new AppError("invalid_state", "يجب أن يبقى مالك واحد للمنصة على الأقل.");
    }
    await tx.delete(platformAdmins).where(eq(platformAdmins.userId, userId));
    await adminAudit(tx, { adminId, action: "admin.admin_revoked", targetType: "user", targetId: userId, metadata: { role: target.role }, meta });
  });
}
