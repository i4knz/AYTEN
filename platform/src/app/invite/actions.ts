"use server";

import { redirect } from "next/navigation";
import { acceptInvitation } from "@/server/team/service";
import { getRequestMeta, requireSession, toFormState, type FormState } from "@/server/web";

export async function acceptInvitationAction(storeId: string, token: string, _prev: FormState): Promise<FormState> {
  const session = await requireSession();
  try {
    await acceptInvitation(session.user.id, storeId, token, await getRequestMeta());
  } catch (err) {
    return toFormState(err);
  }
  redirect(`/dashboard/${storeId}`);
}
