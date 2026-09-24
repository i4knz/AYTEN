import "server-only";
import { isIP } from "node:net";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { RequestMeta } from "./audit";
import { getSession, SESSION_IDLE_TTL_MS, type CurrentSession } from "./auth/service";
import { AppError } from "./lib/errors";

// The __Host- prefix makes browsers reject the cookie unless it is Secure,
// path=/ and has no Domain, so it can never be shared with store subdomains.
const secure = (process.env.APP_URL ?? "").startsWith("https://");
export const SESSION_COOKIE = secure ? "__Host-ayten_session" : "ayten_session";

export async function setSessionCookie(token: string) {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(SESSION_IDLE_TTL_MS / 1000),
  });
}

export async function clearSessionCookie() {
  (await cookies()).delete(SESSION_COOKIE);
}

export async function readSessionToken() {
  return (await cookies()).get(SESSION_COOKIE)?.value;
}

/** Current session, resolved once per request. */
export const getCurrentSession = cache(async (): Promise<CurrentSession | null> => getSession(await readSessionToken()));

export async function requireSession(nextPath?: string): Promise<CurrentSession> {
  const session = await getCurrentSession();
  if (!session) redirect(nextPath ? `/login?next=${encodeURIComponent(nextPath)}` : "/login");
  return session;
}

/**
 * Client IP and user agent for audit logs and rate limits. X-Forwarded-For is
 * client-controlled unless a trusted proxy overwrites it: with TRUST_PROXY=1
 * we take the left-most entry (set by our load balancer), otherwise the
 * right-most (the hop closest to the app).
 */
export async function getRequestMeta(): Promise<RequestMeta> {
  const h = await headers();
  const forwarded = (h.get("x-forwarded-for") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const candidate = process.env.TRUST_PROXY === "1" ? forwarded[0] : forwarded[forwarded.length - 1];
  const ip = candidate?.replace(/^::ffff:/, "");
  return { ip: ip && isIP(ip) ? ip : null, userAgent: h.get("user-agent") };
}

/** Only same-site relative paths, so ?next= cannot become an open redirect. */
export function safeNextPath(value: FormDataEntryValue | string | null | undefined, fallback = "/dashboard"): string {
  if (typeof value !== "string") return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  return value;
}

export interface FormState {
  ok?: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
  values?: Record<string, string>;
}

/** Converts expected failures into form state; unexpected errors are logged and shown generically. */
export function toFormState(err: unknown, values?: Record<string, string>): FormState {
  if (err instanceof AppError) return { ok: false, message: err.message, fieldErrors: err.fieldErrors, values };
  console.error(err);
  return { ok: false, message: "حدث خطأ غير متوقع. حاول مرة أخرى، وإذا تكرر تواصل مع الدعم.", values };
}

/** Plain string values of a form, excluding secrets, for re-filling the form after an error. */
export function formValues(form: FormData, omit: string[] = ["password", "currentPassword", "newPassword", "token"]) {
  const out: Record<string, string> = {};
  for (const [k, v] of form.entries()) if (typeof v === "string" && !omit.includes(k) && !k.startsWith("$")) out[k] = v;
  return out;
}
