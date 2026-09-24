import { hash, verify } from "@node-rs/argon2";

// Argon2id with the library defaults (m=19 MiB, t=2, p=1), which match the
// OWASP Password Storage Cheat Sheet minimum recommendation.
export async function hashPassword(password: string): Promise<string> {
  return hash(password);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

// Used when the account does not exist, so a failed login costs the same time
// either way and response timing does not reveal registered emails.
let dummyHash: Promise<string> | undefined;
export async function burnPasswordCheck(password: string): Promise<void> {
  dummyHash ??= hash("timing-equalizer-not-a-real-password");
  await verifyPassword(await dummyHash, password);
}

const COMMON_PASSWORDS = new Set([
  "1234567890", "12345678910", "123456789a", "password123", "password1234", "qwertyuiop",
  "1q2w3e4r5t", "qwerty12345", "iloveyou123", "0123456789", "1111111111", "aaaaaaaaaa",
  "abcdefghij", "abc1234567", "admin12345", "welcome123", "a123456789", "0000000000",
]);

/** Returns an Arabic error message, or null when acceptable. */
export function passwordProblem(password: string, email?: string): string | null {
  if (password.length < 10) return "كلمة المرور يجب أن تتكون من 10 أحرف على الأقل.";
  if (password.length > 128) return "كلمة المرور طويلة جداً (الحد الأقصى 128 حرفاً).";
  if (COMMON_PASSWORDS.has(password.toLowerCase())) return "كلمة المرور شائعة جداً. اختر كلمة مرور أصعب.";
  if (/^(.)\1+$/.test(password)) return "كلمة المرور لا يمكن أن تكون حرفاً مكرراً.";
  if (email && password.toLowerCase() === email.toLowerCase()) return "لا تستخدم بريدك الإلكتروني ككلمة مرور.";
  return null;
}
