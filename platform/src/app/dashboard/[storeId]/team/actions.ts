"use server";

import { revalidatePath } from "next/cache";
import { changeMemberRole, inviteMember, removeMember, revokeInvitation } from "@/server/team/service";
import { formValues, getRequestMeta, requireSession, toFormState, type FormState } from "@/server/web";

export async function inviteAction(storeId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const session = await requireSession();
  try {
    await inviteMember(session.user.id, storeId, { email: form.get("email"), role: form.get("role") }, await getRequestMeta());
  } catch (err) {
    revalidatePath(`/dashboard/${storeId}/team`);
    return toFormState(err, formValues(form));
  }
  revalidatePath(`/dashboard/${storeId}/team`);
  return { ok: true, message: `أرسلنا الدعوة إلى ${String(form.get("email")).trim()}. صالحة لمدة 7 أيام.` };
}

export async function revokeInvitationAction(storeId: string, invitationId: string) {
  const session = await requireSession();
  await revokeInvitation(session.user.id, storeId, invitationId, await getRequestMeta());
  revalidatePath(`/dashboard/${storeId}/team`);
}

export async function changeRoleAction(storeId: string, memberId: string, form: FormData) {
  const session = await requireSession();
  await changeMemberRole(session.user.id, storeId, memberId, String(form.get("role")), await getRequestMeta());
  revalidatePath(`/dashboard/${storeId}/team`);
}

export async function removeMemberAction(storeId: string, memberId: string) {
  const session = await requireSession();
  await removeMember(session.user.id, storeId, memberId, await getRequestMeta());
  revalidatePath(`/dashboard/${storeId}/team`);
}
