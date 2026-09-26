"use server";

import { revalidatePath } from "next/cache";
import { cancelPayout, requestPayout } from "@/server/wallet/service";
import { formValues, getRequestMeta, requireSession, toFormState, type FormState } from "@/server/web";

export async function requestPayoutAction(storeId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const session = await requireSession();
  try {
    await requestPayout(
      session.user.id,
      storeId,
      { amount: form.get("amount"), bankName: form.get("bankName"), accountName: form.get("accountName"), iban: form.get("iban") },
      await getRequestMeta(),
    );
  } catch (err) {
    return toFormState(err, formValues(form));
  }
  revalidatePath(`/dashboard/${storeId}/wallet`, "layout");
  return { ok: true, message: "استلمنا طلب السحب. ستصلك رسالة في الإشعارات عند التحويل." };
}

export async function cancelPayoutAction(storeId: string, payoutId: string) {
  const session = await requireSession();
  await cancelPayout(session.user.id, storeId, payoutId, await getRequestMeta());
  revalidatePath(`/dashboard/${storeId}/wallet`, "layout");
}
