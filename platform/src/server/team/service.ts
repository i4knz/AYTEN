import { and, asc, eq, gt, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { audit, type RequestMeta } from "../audit";
import { fieldErrors } from "../auth/schemas";
import { assertWithinPlanLimit } from "../billing/service";
import { getDb } from "../db/client";
import {
  INVITABLE_ROLES,
  storeInvitations,
  storeMembers,
  stores,
  users,
  type InvitableRole,
  type StoreRole,
} from "../db/schema";
import { withTenant } from "../db/tenant";
import { getEmailProvider } from "../email";
import { invitationMessage } from "../email/templates";
import { AppError, forbidden, notFound, rateLimited } from "../lib/errors";
import { isUuid, uuidv7 } from "../lib/ids";
import { consume } from "../lib/rate-limit";
import { generateToken, hashToken } from "../lib/tokens";
import { ROLE_LABELS } from "../stores/permissions";
import { requireStoreAccess, type StoreAccess } from "../stores/service";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const MAX_MEMBERS = 15;
const INVITES_PER_DAY = { limit: 30, windowSeconds: 24 * 60 * 60 };

const inviteSchema = z.object({
  email: z
    .string({ error: "البريد الإلكتروني مطلوب." })
    .trim()
    .toLowerCase()
    .pipe(z.email({ error: "أدخل بريداً إلكترونياً صحيحاً." }).max(254)),
  role: z.enum(INVITABLE_ROLES, { error: "اختر الدور." }),
});

/** Only the owner may create or change managers, since a manager can manage the team. */
function assertCanAssign(access: StoreAccess, role: StoreRole) {
  if (role === "owner") throw forbidden();
  if (role === "manager" && access.role !== "owner") {
    throw new AppError("forbidden", "تعيين مدير للمتجر متاح لمالك المتجر فقط.");
  }
}

export async function listTeam(userId: string, storeId: string) {
  const access = await requireStoreAccess(userId, storeId, "team.manage");
  return withTenant({ storeId, userId }, async (tx) => {
    const members = await tx
      .select({
        id: storeMembers.id,
        userId: storeMembers.userId,
        role: storeMembers.role,
        name: users.name,
        email: users.email,
        createdAt: storeMembers.createdAt,
      })
      .from(storeMembers)
      .innerJoin(users, eq(users.id, storeMembers.userId))
      .where(and(eq(storeMembers.storeId, storeId), eq(storeMembers.status, "active")))
      .orderBy(asc(storeMembers.createdAt));
    const invitations = await tx
      .select({
        id: storeInvitations.id,
        email: storeInvitations.email,
        role: storeInvitations.role,
        expiresAt: storeInvitations.expiresAt,
        createdAt: storeInvitations.createdAt,
      })
      .from(storeInvitations)
      .where(
        and(
          eq(storeInvitations.storeId, storeId),
          isNull(storeInvitations.acceptedAt),
          isNull(storeInvitations.revokedAt),
          gt(storeInvitations.expiresAt, sql`now()`),
        ),
      )
      .orderBy(asc(storeInvitations.createdAt));
    return { access, members, invitations };
  });
}

export async function inviteMember(userId: string, storeId: string, input: unknown, meta: RequestMeta = {}) {
  const access = await requireStoreAccess(userId, storeId, "team.manage");
  const parsed = inviteSchema.safeParse(input);
  if (!parsed.success) throw new AppError("validation", "راجع الحقول المظللة.", fieldErrors(parsed.error));
  const { email, role } = parsed.data;
  assertCanAssign(access, role);
  if (!(await consume(`invite:store:${storeId}`, INVITES_PER_DAY))) throw rateLimited();

  const token = generateToken();
  const inviter = await getDb().select({ name: users.name }).from(users).where(eq(users.id, userId)).limit(1);

  await withTenant({ storeId, userId }, async (tx) => {
    const [{ count }] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(storeMembers)
      .where(and(eq(storeMembers.storeId, storeId), eq(storeMembers.status, "active")));
    if (count >= MAX_MEMBERS) {
      throw new AppError("limit_reached", `الحد الأقصى لأعضاء الفريق ${MAX_MEMBERS}.`);
    }
    await assertWithinPlanLimit(tx, storeId, "staff");
    const existing = await tx
      .select({ id: storeMembers.id })
      .from(storeMembers)
      .innerJoin(users, eq(users.id, storeMembers.userId))
      .where(and(eq(storeMembers.storeId, storeId), eq(storeMembers.status, "active"), eq(users.email, email)))
      .limit(1);
    if (existing.length) throw new AppError("validation", "راجع الحقول المظللة.", { email: "هذا الشخص عضو في الفريق بالفعل." });

    // Replace any expired or open invitation for the same email.
    await tx
      .update(storeInvitations)
      .set({ revokedAt: sql`now()` })
      .where(
        and(
          eq(storeInvitations.storeId, storeId),
          eq(storeInvitations.email, email),
          isNull(storeInvitations.acceptedAt),
          isNull(storeInvitations.revokedAt),
        ),
      );
    const id = uuidv7();
    await tx.insert(storeInvitations).values({
      id,
      storeId,
      email,
      role,
      tokenHash: hashToken(token),
      invitedBy: userId,
      expiresAt: new Date(Date.now() + INVITE_TTL_MS),
    });
    await audit(
      { storeId, actorId: userId, action: "team.invited", targetType: "invitation", targetId: id, metadata: { email, role }, meta },
      tx,
    );
  });

  const url = new URL(`/invite?store=${storeId}&token=${encodeURIComponent(token)}`, process.env.APP_URL ?? "http://localhost:3000");
  try {
    await getEmailProvider().send(
      invitationMessage(email, inviter[0]?.name ?? "", access.store.name, ROLE_LABELS[role], url.toString()),
    );
  } catch (err) {
    console.error("[email] failed to send invitation:", err);
    throw new AppError("email_failed", "تم إنشاء الدعوة لكن تعذر إرسال البريد. حاول إعادة الإرسال لاحقاً.");
  }
}

export async function revokeInvitation(userId: string, storeId: string, invitationId: string, meta: RequestMeta = {}) {
  await requireStoreAccess(userId, storeId, "team.manage");
  if (!isUuid(invitationId)) throw notFound();
  await withTenant({ storeId, userId }, async (tx) => {
    const rows = await tx
      .update(storeInvitations)
      .set({ revokedAt: sql`now()` })
      .where(and(eq(storeInvitations.id, invitationId), isNull(storeInvitations.acceptedAt), isNull(storeInvitations.revokedAt)))
      .returning({ id: storeInvitations.id });
    if (!rows.length) throw notFound();
    await audit({ storeId, actorId: userId, action: "team.invitation_revoked", targetType: "invitation", targetId: invitationId, meta }, tx);
  });
}

/** Looks up an open invitation for the accept page. The store id travels in the link because RLS needs it. */
export async function getInvitation(storeId: string, token: string) {
  if (!isUuid(storeId) || !token || token.length > 200) return null;
  return withTenant({ storeId }, async (tx) => {
    const [row] = await tx
      .select({
        id: storeInvitations.id,
        email: storeInvitations.email,
        role: storeInvitations.role,
        invitedBy: storeInvitations.invitedBy,
        storeName: stores.name,
      })
      .from(storeInvitations)
      .innerJoin(stores, eq(stores.id, storeInvitations.storeId))
      .where(
        and(
          eq(storeInvitations.tokenHash, hashToken(token)),
          isNull(storeInvitations.acceptedAt),
          isNull(storeInvitations.revokedAt),
          gt(storeInvitations.expiresAt, sql`now()`),
        ),
      )
      .limit(1);
    return row ?? null;
  });
}

/**
 * Accepts an invitation for the signed-in user. The account email must match
 * the invited email; opening the emailed link also proves control of that
 * inbox, so the email is marked verified.
 */
export async function acceptInvitation(userId: string, storeId: string, token: string, meta: RequestMeta = {}) {
  const invitation = await getInvitation(storeId, token);
  if (!invitation) throw new AppError("invalid_token", "الدعوة غير صالحة أو منتهية أو استُخدمت من قبل.");
  const [user] = await getDb().select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user || user.email.toLowerCase() !== invitation.email.toLowerCase()) {
    throw new AppError("wrong_account", `هذه الدعوة مرسلة إلى ${invitation.email}. سجّل الدخول بهذا البريد لقبولها.`);
  }

  await withTenant({ storeId, userId }, async (tx) => {
    const claimed = await tx
      .update(storeInvitations)
      .set({ acceptedAt: sql`now()`, acceptedBy: userId })
      .where(and(eq(storeInvitations.id, invitation.id), isNull(storeInvitations.acceptedAt), isNull(storeInvitations.revokedAt)))
      .returning({ id: storeInvitations.id });
    if (!claimed.length) throw new AppError("invalid_token", "الدعوة غير صالحة أو استُخدمت من قبل.");
    // A previously removed member is re-activated; an active member is left as is.
    const joined = await tx
      .insert(storeMembers)
      .values({ id: uuidv7(), storeId, userId, role: invitation.role, invitedBy: invitation.invitedBy })
      .onConflictDoUpdate({
        target: [storeMembers.storeId, storeMembers.userId],
        set: { role: invitation.role, status: "active", invitedBy: invitation.invitedBy },
        where: sql`${storeMembers.status} = 'removed'`,
      })
      .returning({ id: storeMembers.id });
    if (!joined.length) throw new AppError("already_member", "أنت عضو في هذا المتجر بالفعل.");
    await audit(
      { storeId, actorId: userId, action: "team.invitation_accepted", targetType: "invitation", targetId: invitation.id, meta },
      tx,
    );
  });
  await getDb()
    .update(users)
    .set({ emailVerifiedAt: sql`coalesce(${users.emailVerifiedAt}, now())` })
    .where(eq(users.id, userId));
}

export async function changeMemberRole(
  userId: string,
  storeId: string,
  memberId: string,
  role: string,
  meta: RequestMeta = {},
) {
  const access = await requireStoreAccess(userId, storeId, "team.manage");
  if (!isUuid(memberId)) throw notFound();
  const parsed = z.enum(INVITABLE_ROLES).safeParse(role);
  if (!parsed.success) throw new AppError("validation", "دور غير صالح.");
  assertCanAssign(access, parsed.data);

  await withTenant({ storeId, userId }, async (tx) => {
    const [member] = await tx
      .select()
      .from(storeMembers)
      .where(and(eq(storeMembers.id, memberId), eq(storeMembers.status, "active")))
      .limit(1);
    if (!member) throw notFound();
    if (member.role === "owner") throw new AppError("forbidden", "لا يمكن تغيير دور مالك المتجر.");
    if (member.userId === userId) throw new AppError("forbidden", "لا يمكنك تغيير دورك بنفسك.");
    if (member.role === "manager" && access.role !== "owner") throw new AppError("forbidden", "تعديل المديرين متاح للمالك فقط.");
    await tx.update(storeMembers).set({ role: parsed.data as InvitableRole }).where(eq(storeMembers.id, memberId));
    await audit(
      {
        storeId,
        actorId: userId,
        action: "team.role_changed",
        targetType: "member",
        targetId: memberId,
        metadata: { from: member.role, to: parsed.data },
        meta,
      },
      tx,
    );
  });
}

export async function removeMember(userId: string, storeId: string, memberId: string, meta: RequestMeta = {}) {
  const access = await requireStoreAccess(userId, storeId, "team.manage");
  if (!isUuid(memberId)) throw notFound();
  await withTenant({ storeId, userId }, async (tx) => {
    const [member] = await tx
      .select()
      .from(storeMembers)
      .where(and(eq(storeMembers.id, memberId), eq(storeMembers.status, "active")))
      .limit(1);
    if (!member) throw notFound();
    if (member.role === "owner") throw new AppError("forbidden", "لا يمكن إزالة مالك المتجر.");
    if (member.role === "manager" && access.role !== "owner") throw new AppError("forbidden", "إزالة المديرين متاحة للمالك فقط.");
    await tx.update(storeMembers).set({ status: "removed" }).where(eq(storeMembers.id, memberId));
    await audit(
      { storeId, actorId: userId, action: "team.member_removed", targetType: "member", targetId: memberId, metadata: { role: member.role }, meta },
      tx,
    );
  });
}
