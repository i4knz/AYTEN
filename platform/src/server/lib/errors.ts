/**
 * Expected, user-facing failures. `message` is safe to show (Arabic);
 * `code` is stable for tests and clients. Anything else thrown is a bug and
 * surfaces as a generic error.
 */
export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly fieldErrors?: Record<string, string>,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const notFound = () => new AppError("not_found", "الصفحة أو العنصر غير موجود.");
export const forbidden = () => new AppError("forbidden", "ليست لديك صلاحية لتنفيذ هذا الإجراء.");
export const rateLimited = () =>
  new AppError("rate_limited", "محاولات كثيرة خلال وقت قصير. انتظر قليلاً ثم حاول مرة أخرى.");

/** Postgres unique_violation on a given constraint. */
export function isUniqueViolation(err: unknown, constraint?: string): boolean {
  const e = findPgError(err);
  return e?.code === "23505" && (!constraint || e.constraint === constraint);
}

function findPgError(err: unknown): { code?: string; constraint?: string } | undefined {
  let current: unknown = err;
  for (let i = 0; i < 5 && current && typeof current === "object"; i++) {
    const c = current as { code?: string; constraint?: string; cause?: unknown };
    if (typeof c.code === "string" && /^[0-9A-Z]{5}$/.test(c.code)) return c;
    current = c.cause;
  }
  return undefined;
}
