"use server";

import { redirect } from "next/navigation";
import {
  login,
  logout,
  register,
  requestPasswordReset,
  resetPassword,
} from "@/server/auth/service";
import {
  clearSessionCookie,
  formValues,
  getRequestMeta,
  readSessionToken,
  safeNextPath,
  setSessionCookie,
  toFormState,
  type FormState,
} from "@/server/web";

export async function registerAction(_prev: FormState, form: FormData): Promise<FormState> {
  let destination: string;
  try {
    const { sessionToken } = await register(
      {
        name: form.get("name"),
        email: form.get("email"),
        password: form.get("password"),
        acceptTerms: form.get("acceptTerms") === "on",
        ref: form.get("ref"),
      },
      await getRequestMeta(),
    );
    await setSessionCookie(sessionToken);
    destination = safeNextPath(form.get("next"), "/onboarding");
  } catch (err) {
    return toFormState(err, formValues(form));
  }
  redirect(destination);
}

export async function loginAction(_prev: FormState, form: FormData): Promise<FormState> {
  let destination: string;
  try {
    const { sessionToken } = await login(
      { email: form.get("email"), password: form.get("password") },
      await getRequestMeta(),
    );
    await setSessionCookie(sessionToken);
    destination = safeNextPath(form.get("next"));
  } catch (err) {
    return toFormState(err, formValues(form));
  }
  redirect(destination);
}

export async function logoutAction() {
  await logout(await readSessionToken());
  await clearSessionCookie();
  redirect("/login");
}

export async function forgotPasswordAction(_prev: FormState, form: FormData): Promise<FormState> {
  try {
    await requestPasswordReset({ email: form.get("email") }, await getRequestMeta());
    return {
      ok: true,
      message: "إذا كان البريد مسجلاً لدينا فستصلك رسالة خلال دقائق تحتوي رابط إعادة التعيين. تحقق من مجلد الرسائل غير المرغوبة أيضاً.",
    };
  } catch (err) {
    return toFormState(err, formValues(form));
  }
}

export async function resetPasswordAction(_prev: FormState, form: FormData): Promise<FormState> {
  try {
    await resetPassword({ token: form.get("token"), password: form.get("password") }, await getRequestMeta());
  } catch (err) {
    return toFormState(err);
  }
  redirect("/login?reset=1");
}
