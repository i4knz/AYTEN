import { z } from "zod";

const email = z
  .string({ error: "البريد الإلكتروني مطلوب." })
  .trim()
  .toLowerCase()
  .max(254, { error: "البريد الإلكتروني طويل جداً." })
  .pipe(z.email({ error: "أدخل بريداً إلكترونياً صحيحاً." }));

const password = z.string({ error: "كلمة المرور مطلوبة." }).max(128, { error: "كلمة المرور طويلة جداً." });

export const registerSchema = z.object({
  name: z
    .string({ error: "الاسم مطلوب." })
    .trim()
    .min(2, { error: "الاسم قصير جداً." })
    .max(100, { error: "الاسم طويل جداً." }),
  email,
  password,
  acceptTerms: z.literal(true, { error: "يجب الموافقة على الشروط وسياسة الخصوصية." }),
});

export const loginSchema = z.object({
  email,
  password: password.min(1, { error: "كلمة المرور مطلوبة." }),
});

export const forgotPasswordSchema = z.object({ email });

export const resetPasswordSchema = z.object({
  token: z.string().min(20).max(200),
  password,
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, { error: "أدخل كلمة المرور الحالية." }).max(128),
  newPassword: password,
});

/** Flattens Zod issues into { field: firstMessage }. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_form";
    out[key] ??= issue.message;
  }
  return out;
}
