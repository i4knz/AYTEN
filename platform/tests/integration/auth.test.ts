import { describe, expect, it } from "vitest";
import {
  changePassword,
  getSession,
  listActiveSessions,
  login,
  logout,
  register,
  requestPasswordReset,
  resendVerificationEmail,
  resetPassword,
  revokeSession,
  verifyEmail,
} from "@/server/auth/service";
import { AppError } from "@/server/lib/errors";
import { asOwner, lastTokenFromOutbox, outbox } from "../support/db";
import { makeUser } from "../support/factories";

const meta = { ip: "203.0.113.7", userAgent: "vitest" };

async function expectAppError(p: Promise<unknown>, code: string) {
  await expect(p).rejects.toSatisfy((e: unknown) => e instanceof AppError && e.code === code);
}

describe("registration", () => {
  it("creates a user with a hashed password, a session, and sends a verification email", async () => {
    const { userId, sessionToken } = await register(
      { name: "سارة", email: "Sara@Example.com", password: "correct horse battery", acceptTerms: true },
      meta,
    );
    const { rows } = await asOwner((c) => c.query("select email, password_hash from users where id = $1", [userId]));
    expect(rows[0].email).toBe("sara@example.com");
    expect(rows[0].password_hash).toMatch(/^\$argon2id\$/);
    expect(rows[0].password_hash).not.toContain("correct horse");

    const session = await getSession(sessionToken);
    expect(session?.user).toMatchObject({ id: userId, emailVerified: false });
    expect(outbox.map((m) => m.tag)).toEqual(["email_verify"]);
  });

  it("stores only a hash of the session token", async () => {
    const { userId, sessionToken } = await makeUser();
    const { rows } = await asOwner((c) => c.query("select token_hash from user_sessions where user_id = $1", [userId]));
    expect(rows).toHaveLength(1);
    expect(Buffer.from(rows[0].token_hash).toString("base64url")).not.toBe(sessionToken);
  });

  it("rejects duplicate emails (case-insensitive), weak passwords and missing consent", async () => {
    await makeUser({ email: "dup@example.com" });
    await expectAppError(
      register({ name: "x y", email: "DUP@example.com", password: "another good pass", acceptTerms: true }),
      "email_taken",
    );
    await expectAppError(
      register({ name: "x y", email: "weak@example.com", password: "1234567890", acceptTerms: true }),
      "validation",
    );
    await expectAppError(
      register({ name: "x y", email: "noterms@example.com", password: "correct horse battery" }),
      "validation",
    );
  });

  it("rate-limits sign-ups per IP", async () => {
    for (let i = 0; i < 10; i++) {
      await register(
        { name: "مستخدم", email: `ip${i}@example.com`, password: "correct horse battery", acceptTerms: true },
        { ip: "198.51.100.1" },
      );
    }
    await expectAppError(
      register(
        { name: "مستخدم", email: "ip-over@example.com", password: "correct horse battery", acceptTerms: true },
        { ip: "198.51.100.1" },
      ),
      "rate_limited",
    );
  });
});

describe("email verification", () => {
  it("verifies once with a valid token and rejects reuse or garbage", async () => {
    const { sessionToken } = await makeUser();
    const token = lastTokenFromOutbox("email_verify");
    expect(await verifyEmail("not-a-real-token-at-all-000000")).toBe(false);
    expect(await verifyEmail(token)).toBe(true);
    expect(await verifyEmail(token)).toBe(false);
    expect((await getSession(sessionToken))?.user.emailVerified).toBe(true);
  });

  it("rejects expired tokens", async () => {
    await makeUser();
    const token = lastTokenFromOutbox("email_verify");
    await asOwner((c) => c.query("update verification_tokens set expires_at = now() - interval '1 minute'"));
    expect(await verifyEmail(token)).toBe(false);
  });

  it("does not resend to verified users and limits resends", async () => {
    const { userId } = await makeUser();
    for (let i = 0; i < 3; i++) expect(await resendVerificationEmail(userId)).toBe("sent");
    await expectAppError(resendVerificationEmail(userId), "rate_limited");
    await verifyEmail(lastTokenFromOutbox("email_verify"));
    expect(await resendVerificationEmail(userId)).toBe("already_verified");
  });
});

describe("login", () => {
  it("logs in with correct credentials, case-insensitive email", async () => {
    const u = await makeUser({ email: "login@example.com" });
    const { sessionToken, userId } = await login({ email: "LOGIN@example.com", password: u.password }, meta);
    expect(userId).toBe(u.userId);
    expect((await getSession(sessionToken))?.user.id).toBe(u.userId);
  });

  it("returns the same error for wrong password and unknown email", async () => {
    await makeUser({ email: "known@example.com" });
    await expectAppError(login({ email: "known@example.com", password: "wrong password!" }), "invalid_credentials");
    await expectAppError(login({ email: "nobody@example.com", password: "wrong password!" }), "invalid_credentials");
  });

  it("locks an email after 5 failures, even with the right password", async () => {
    const u = await makeUser({ email: "brute@example.com" });
    for (let i = 0; i < 5; i++) {
      await expectAppError(login({ email: u.email, password: `wrong-${i}-password` }), "invalid_credentials");
    }
    await expectAppError(login({ email: u.email, password: u.password }), "rate_limited");
  });

  it("clears the failure counter after a successful login", async () => {
    const u = await makeUser();
    for (let i = 0; i < 4; i++) await expectAppError(login({ email: u.email, password: "wrong pass word" }), "invalid_credentials");
    await login({ email: u.email, password: u.password });
    for (let i = 0; i < 4; i++) await expectAppError(login({ email: u.email, password: "wrong pass word" }), "invalid_credentials");
  });

  it("refuses suspended accounts", async () => {
    const u = await makeUser();
    await asOwner((c) => c.query("update users set status = 'suspended' where id = $1", [u.userId]));
    await expectAppError(login({ email: u.email, password: u.password }), "account_inactive");
    expect(await getSession(u.sessionToken)).toBeNull();
  });
});

describe("sessions", () => {
  it("logout revokes the session", async () => {
    const u = await makeUser();
    await logout(u.sessionToken);
    expect(await getSession(u.sessionToken)).toBeNull();
  });

  it("expired sessions are rejected", async () => {
    const u = await makeUser();
    await asOwner((c) => c.query("update user_sessions set expires_at = now() - interval '1 second'"));
    expect(await getSession(u.sessionToken)).toBeNull();
  });

  it("a user can revoke their own sessions but not someone else's", async () => {
    const a = await makeUser();
    const b = await makeUser();
    const [bSession] = await listActiveSessions(b.userId);
    expect(await revokeSession(a.userId, bSession.id)).toBe(false);
    expect(await getSession(b.sessionToken)).not.toBeNull();
    expect(await revokeSession(b.userId, bSession.id)).toBe(true);
    expect(await getSession(b.sessionToken)).toBeNull();
  });
});

describe("password reset", () => {
  it("behaves identically for unknown emails and sends nothing", async () => {
    await expect(requestPasswordReset({ email: "ghost@example.com" })).resolves.toBeUndefined();
    expect(outbox).toHaveLength(0);
  });

  it("resets the password once, revokes all sessions, and invalidates older links", async () => {
    const u = await makeUser();
    await requestPasswordReset({ email: u.email });
    const first = lastTokenFromOutbox("password_reset");
    await requestPasswordReset({ email: u.email });
    const second = lastTokenFromOutbox("password_reset");

    await expectAppError(resetPassword({ token: first, password: "brand new password" }), "invalid_token");
    await resetPassword({ token: second, password: "brand new password" });
    await expectAppError(resetPassword({ token: second, password: "another new password" }), "invalid_token");

    expect(await getSession(u.sessionToken)).toBeNull();
    await expectAppError(login({ email: u.email, password: u.password }), "invalid_credentials");
    await expect(login({ email: u.email, password: "brand new password" })).resolves.toBeTruthy();
    expect(outbox.some((m) => m.tag === "password_changed")).toBe(true);
  });

  it("does not burn the token on a weak new password", async () => {
    const u = await makeUser();
    await requestPasswordReset({ email: u.email });
    const token = lastTokenFromOutbox("password_reset");
    await expectAppError(resetPassword({ token, password: "short" }), "validation");
    await expect(resetPassword({ token, password: "brand new password" })).resolves.toBeUndefined();
  });
});

describe("change password", () => {
  it("requires the current password and keeps only the current session", async () => {
    const u = await makeUser();
    const other = await login({ email: u.email, password: u.password });
    const current = (await getSession(u.sessionToken))!;

    await expectAppError(
      changePassword(u.userId, current.sessionId, { currentPassword: "wrong one here", newPassword: "brand new password" }),
      "validation",
    );
    await changePassword(u.userId, current.sessionId, { currentPassword: u.password, newPassword: "brand new password" });

    expect(await getSession(u.sessionToken)).not.toBeNull();
    expect(await getSession(other.sessionToken)).toBeNull();
  });
});
