import { and, desc, eq, gt, isNull, ne, sql } from "drizzle-orm";
import { audit, type RequestMeta } from "../audit";
import { getDb } from "../db/client";
import { users, userSessions, verificationTokens } from "../db/schema";
import { getEmailProvider } from "../email";
import { passwordChangedMessage, passwordResetMessage, verifyEmailMessage } from "../email/templates";
import { AppError, isUniqueViolation, rateLimited } from "../lib/errors";
import { uuidv7 } from "../lib/ids";
import { consume, isLimited, RATE_LIMITS, resetLimit } from "../lib/rate-limit";
import { generateToken, hashToken } from "../lib/tokens";
import { attachReferrer, normalizeReferralCode } from "../referrals/service";
import { burnPasswordCheck, hashPassword, passwordProblem, verifyPassword } from "./password";
import {
  changePasswordSchema,
  fieldErrors,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
} from "./schemas";

const DAY_MS = 24 * 60 * 60 * 1000;
export const SESSION_IDLE_TTL_MS = 30 * DAY_MS;
export const SESSION_ABSOLUTE_TTL_MS = 90 * DAY_MS;
const SESSION_TOUCH_INTERVAL_MS = 60 * 60 * 1000;
const VERIFY_TTL_MS = DAY_MS;
const RESET_TTL_MS = 60 * 60 * 1000;

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
}

export interface CurrentSession {
  sessionId: string;
  user: SessionUser;
}

function appUrl(pathname: string) {
  return new URL(pathname, process.env.APP_URL ?? "http://localhost:3000").toString();
}

async function sendSafely(send: () => Promise<void>, what: string) {
  try {
    await send();
  } catch (err) {
    // Mail delivery failure must not undo the account change; the user can
    // request the email again. Surfaced to monitoring via the error log.
    console.error(`[email] failed to send ${what}:`, err);
  }
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export async function createSession(userId: string, meta: RequestMeta = {}): Promise<string> {
  const token = generateToken();
  const now = Date.now();
  await getDb().insert(userSessions).values({
    id: uuidv7(),
    userId,
    tokenHash: hashToken(token),
    ip: meta.ip ?? null,
    userAgent: meta.userAgent?.slice(0, 500) ?? null,
    expiresAt: new Date(now + SESSION_IDLE_TTL_MS),
  });
  return token;
}

/** Resolves a session cookie value to its user, extending the idle timeout. */
export async function getSession(token: string | undefined | null): Promise<CurrentSession | null> {
  if (!token || token.length > 200) return null;
  const db = getDb();
  const rows = await db
    .select({
      sessionId: userSessions.id,
      createdAt: userSessions.createdAt,
      lastSeenAt: userSessions.lastSeenAt,
      id: users.id,
      email: users.email,
      name: users.name,
      emailVerifiedAt: users.emailVerifiedAt,
    })
    .from(userSessions)
    .innerJoin(users, eq(users.id, userSessions.userId))
    .where(
      and(
        eq(userSessions.tokenHash, hashToken(token)),
        isNull(userSessions.revokedAt),
        gt(userSessions.expiresAt, sql`now()`),
        eq(users.status, "active"),
      ),
    )
    .limit(1);
  const row = rows[0];
  if (!row) return null;

  const now = Date.now();
  if (now - row.lastSeenAt.getTime() > SESSION_TOUCH_INTERVAL_MS) {
    const expiresAt = new Date(Math.min(now + SESSION_IDLE_TTL_MS, row.createdAt.getTime() + SESSION_ABSOLUTE_TTL_MS));
    await db
      .update(userSessions)
      .set({ lastSeenAt: new Date(now), expiresAt })
      .where(eq(userSessions.id, row.sessionId));
  }

  return {
    sessionId: row.sessionId,
    user: { id: row.id, email: row.email, name: row.name, emailVerified: row.emailVerifiedAt !== null },
  };
}

export async function logout(token: string | undefined | null): Promise<void> {
  if (!token) return;
  await getDb()
    .update(userSessions)
    .set({ revokedAt: sql`now()` })
    .where(and(eq(userSessions.tokenHash, hashToken(token)), isNull(userSessions.revokedAt)));
}

export async function listActiveSessions(userId: string) {
  return getDb()
    .select({
      id: userSessions.id,
      ip: userSessions.ip,
      userAgent: userSessions.userAgent,
      createdAt: userSessions.createdAt,
      lastSeenAt: userSessions.lastSeenAt,
    })
    .from(userSessions)
    .where(and(eq(userSessions.userId, userId), isNull(userSessions.revokedAt), gt(userSessions.expiresAt, sql`now()`)))
    .orderBy(desc(userSessions.lastSeenAt));
}

/** Revokes one of the user's own sessions. Scoped by user id, so a guessed id of someone else's session does nothing. */
export async function revokeSession(userId: string, sessionId: string, meta: RequestMeta = {}): Promise<boolean> {
  const result = await getDb()
    .update(userSessions)
    .set({ revokedAt: sql`now()` })
    .where(and(eq(userSessions.id, sessionId), eq(userSessions.userId, userId), isNull(userSessions.revokedAt)))
    .returning({ id: userSessions.id });
  if (result.length) {
    await audit({ actorId: userId, action: "session.revoked", targetType: "session", targetId: sessionId, meta });
  }
  return result.length > 0;
}

export async function revokeOtherSessions(userId: string, keepSessionId: string | null, meta: RequestMeta = {}) {
  const conditions = [eq(userSessions.userId, userId), isNull(userSessions.revokedAt)];
  if (keepSessionId) conditions.push(ne(userSessions.id, keepSessionId));
  const result = await getDb()
    .update(userSessions)
    .set({ revokedAt: sql`now()` })
    .where(and(...conditions))
    .returning({ id: userSessions.id });
  if (result.length) {
    await audit({ actorId: userId, action: "session.revoked_all", metadata: { count: result.length }, meta });
  }
  return result.length;
}

// ---------------------------------------------------------------------------
// Registration and email verification
// ---------------------------------------------------------------------------

export async function register(input: unknown, meta: RequestMeta = {}) {
  if (meta.ip && !(await consume(`register:ip:${meta.ip}`, RATE_LIMITS.registerPerIp))) throw rateLimited();

  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) throw new AppError("validation", "راجع الحقول المظللة.", fieldErrors(parsed.error));
  const { name, email, password } = parsed.data;

  const problem = passwordProblem(password, email);
  if (problem) throw new AppError("validation", "راجع الحقول المظللة.", { password: problem });

  const userId = uuidv7();
  try {
    await getDb().insert(users).values({ id: userId, email, name, passwordHash: await hashPassword(password) });
  } catch (err) {
    if (isUniqueViolation(err, "users_email_key")) {
      throw new AppError("email_taken", "هذا البريد مسجل مسبقاً.", {
        email: "هذا البريد مسجل مسبقاً. سجّل الدخول أو استعد كلمة المرور.",
      });
    }
    throw err;
  }

  await attachReferrer(userId, normalizeReferralCode((input as { ref?: unknown } | null)?.ref));
  await audit({ actorId: userId, action: "user.registered", targetType: "user", targetId: userId, meta });
  await issueVerificationEmail(userId, email, name);
  const sessionToken = await createSession(userId, meta);
  return { userId, sessionToken };
}

async function issueVerificationEmail(userId: string, email: string, name: string) {
  const token = generateToken();
  await getDb().insert(verificationTokens).values({
    id: uuidv7(),
    userId,
    purpose: "email_verify",
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + VERIFY_TTL_MS),
  });
  const url = appUrl(`/verify-email?token=${encodeURIComponent(token)}`);
  await sendSafely(() => getEmailProvider().send(verifyEmailMessage(email, name, url)), "verification email");
}

export async function resendVerificationEmail(userId: string): Promise<"sent" | "already_verified"> {
  const [user] = await getDb().select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new AppError("not_found", "الحساب غير موجود.");
  if (user.emailVerifiedAt) return "already_verified";
  if (!(await consume(`verify:user:${userId}`, RATE_LIMITS.verifyResendPerUser))) throw rateLimited();
  await issueVerificationEmail(user.id, user.email, user.name);
  return "sent";
}

/** Consumes a single-use token of the given purpose. Returns its user id, or null if invalid/expired/used. */
async function consumeToken(token: string, purpose: "email_verify" | "password_reset"): Promise<string | null> {
  if (!token || token.length > 200) return null;
  const result = await getDb()
    .update(verificationTokens)
    .set({ usedAt: sql`now()` })
    .where(
      and(
        eq(verificationTokens.tokenHash, hashToken(token)),
        eq(verificationTokens.purpose, purpose),
        isNull(verificationTokens.usedAt),
        gt(verificationTokens.expiresAt, sql`now()`),
      ),
    )
    .returning({ userId: verificationTokens.userId });
  return result[0]?.userId ?? null;
}

export async function verifyEmail(token: string): Promise<boolean> {
  const userId = await consumeToken(token, "email_verify");
  if (!userId) return false;
  await getDb()
    .update(users)
    .set({ emailVerifiedAt: sql`coalesce(${users.emailVerifiedAt}, now())` })
    .where(eq(users.id, userId));
  await audit({ actorId: userId, action: "user.email_verified", targetType: "user", targetId: userId });
  return true;
}

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------

const INVALID_CREDENTIALS = () => new AppError("invalid_credentials", "البريد الإلكتروني أو كلمة المرور غير صحيحة.");

export async function login(input: unknown, meta: RequestMeta = {}) {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) throw new AppError("validation", "راجع الحقول المظللة.", fieldErrors(parsed.error));
  const { email, password } = parsed.data;

  const emailKey = `login:email:${email}`;
  if (meta.ip && !(await consume(`login:ip:${meta.ip}`, RATE_LIMITS.loginPerIp))) throw rateLimited();
  if (await isLimited(emailKey, RATE_LIMITS.loginPerEmail)) throw rateLimited();

  const [user] = await getDb().select().from(users).where(eq(users.email, email)).limit(1);
  const ok = user ? await verifyPassword(user.passwordHash, password) : (await burnPasswordCheck(password), false);

  if (!user || !ok) {
    await consume(emailKey, RATE_LIMITS.loginPerEmail);
    await audit({
      actorId: user?.id ?? null,
      action: "auth.login_failed",
      metadata: { reason: user ? "bad_password" : "unknown_email" },
      meta,
    });
    throw INVALID_CREDENTIALS();
  }
  if (user.status !== "active") {
    throw new AppError("account_inactive", "هذا الحساب موقوف. تواصل مع الدعم.");
  }

  await resetLimit(emailKey);
  await getDb().update(users).set({ lastLoginAt: sql`now()` }).where(eq(users.id, user.id));
  await audit({ actorId: user.id, action: "auth.login", meta });
  return { userId: user.id, sessionToken: await createSession(user.id, meta) };
}

// ---------------------------------------------------------------------------
// Password reset and change
// ---------------------------------------------------------------------------

/** Always resolves the same way whether or not the email exists, to prevent account enumeration. */
export async function requestPasswordReset(input: unknown, meta: RequestMeta = {}): Promise<void> {
  const parsed = forgotPasswordSchema.safeParse(input);
  if (!parsed.success) throw new AppError("validation", "راجع الحقول المظللة.", fieldErrors(parsed.error));
  const { email } = parsed.data;

  if (meta.ip && !(await consume(`reset:ip:${meta.ip}`, RATE_LIMITS.resetPerIp))) throw rateLimited();
  if (!(await consume(`reset:email:${email}`, RATE_LIMITS.resetPerEmail))) return;

  const [user] = await getDb().select().from(users).where(eq(users.email, email)).limit(1);
  if (!user || user.status !== "active") return;

  const token = generateToken();
  await getDb().transaction(async (tx) => {
    // Only the newest link works.
    await tx
      .update(verificationTokens)
      .set({ usedAt: sql`now()` })
      .where(
        and(
          eq(verificationTokens.userId, user.id),
          eq(verificationTokens.purpose, "password_reset"),
          isNull(verificationTokens.usedAt),
        ),
      );
    await tx.insert(verificationTokens).values({
      id: uuidv7(),
      userId: user.id,
      purpose: "password_reset",
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + RESET_TTL_MS),
    });
  });
  await audit({ actorId: user.id, action: "auth.password_reset_requested", meta });
  const url = appUrl(`/reset-password?token=${encodeURIComponent(token)}`);
  await sendSafely(() => getEmailProvider().send(passwordResetMessage(user.email, user.name, url)), "password reset");
}

export async function resetPassword(input: unknown, meta: RequestMeta = {}): Promise<void> {
  const parsed = resetPasswordSchema.safeParse(input);
  if (!parsed.success) throw new AppError("validation", "راجع الحقول المظللة.", fieldErrors(parsed.error));
  const { token, password } = parsed.data;

  const problem = passwordProblem(password);
  if (problem) throw new AppError("validation", "راجع الحقول المظللة.", { password: problem });

  const passwordHash = await hashPassword(password);
  const userId = await consumeToken(token, "password_reset");
  if (!userId) throw new AppError("invalid_token", "رابط إعادة التعيين غير صالح أو منتهي. اطلب رابطاً جديداً.");

  const [user] = await getDb()
    .update(users)
    // Receiving the reset link proves control of the inbox.
    .set({ passwordHash, emailVerifiedAt: sql`coalesce(${users.emailVerifiedAt}, now())` })
    .where(eq(users.id, userId))
    .returning();
  await revokeOtherSessions(userId, null, meta);
  await audit({ actorId: userId, action: "auth.password_reset", meta });
  await sendSafely(
    () => getEmailProvider().send(passwordChangedMessage(user.email, user.name, appUrl("/forgot-password"))),
    "password changed notice",
  );
}

export async function changePassword(userId: string, currentSessionId: string, input: unknown, meta: RequestMeta = {}) {
  const parsed = changePasswordSchema.safeParse(input);
  if (!parsed.success) throw new AppError("validation", "راجع الحقول المظللة.", fieldErrors(parsed.error));
  const { currentPassword, newPassword } = parsed.data;

  const [user] = await getDb().select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new AppError("not_found", "الحساب غير موجود.");
  if (!(await consume(`change-password:user:${userId}`, RATE_LIMITS.loginPerEmail))) throw rateLimited();
  if (!(await verifyPassword(user.passwordHash, currentPassword))) {
    throw new AppError("validation", "راجع الحقول المظللة.", { currentPassword: "كلمة المرور الحالية غير صحيحة." });
  }
  const problem = passwordProblem(newPassword, user.email);
  if (problem) throw new AppError("validation", "راجع الحقول المظللة.", { newPassword: problem });

  await getDb().update(users).set({ passwordHash: await hashPassword(newPassword) }).where(eq(users.id, userId));
  await revokeOtherSessions(userId, currentSessionId, meta);
  await audit({ actorId: userId, action: "auth.password_changed", meta });
  await sendSafely(
    () => getEmailProvider().send(passwordChangedMessage(user.email, user.name, appUrl("/forgot-password"))),
    "password changed notice",
  );
}
