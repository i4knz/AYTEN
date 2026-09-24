"use server";

import { revalidatePath } from "next/cache";
import {
  changePassword,
  resendVerificationEmail,
  revokeOtherSessions,
  revokeSession,
} from "@/server/auth/service";
import { getRequestMeta, requireSession, toFormState, type FormState } from "@/server/web";

export async function resendVerificationAction(_prev: FormState): Promise<FormState> {
  const session = await requireSession("/account/security");
  try {
    const result = await resendVerificationEmail(session.user.id);
    return { ok: true, message: result === "sent" ? "أرسلنا رابط تأكيد جديداً إلى بريدك." : "بريدك مؤكد مسبقاً." };
  } catch (err) {
    return toFormState(err);
  }
}

export async function changePasswordAction(_prev: FormState, form: FormData): Promise<FormState> {
  const session = await requireSession("/account/security");
  try {
    await changePassword(
      session.user.id,
      session.sessionId,
      { currentPassword: form.get("currentPassword"), newPassword: form.get("newPassword") },
      await getRequestMeta(),
    );
  } catch (err) {
    return toFormState(err);
  }
  revalidatePath("/account/security");
  return { ok: true, message: "تم تغيير كلمة المرور وتسجيل الخروج من الأجهزة الأخرى." };
}

export async function revokeSessionAction(form: FormData) {
  const session = await requireSession("/account/security");
  const id = form.get("sessionId");
  if (typeof id === "string" && id !== session.sessionId) {
    await revokeSession(session.user.id, id, await getRequestMeta());
  }
  revalidatePath("/account/security");
}

export async function revokeOtherSessionsAction() {
  const session = await requireSession("/account/security");
  await revokeOtherSessions(session.user.id, session.sessionId, await getRequestMeta());
  revalidatePath("/account/security");
}
