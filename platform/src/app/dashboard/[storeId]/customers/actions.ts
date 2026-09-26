"use server";

import { revalidatePath } from "next/cache";
import { anonymizeCustomer, updateCustomerNote } from "@/server/commerce/customers";
import { getRequestMeta, requireSession, toFormState, type FormState } from "@/server/web";

export async function saveCustomerNoteAction(storeId: string, customerId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const session = await requireSession();
  try {
    await updateCustomerNote(session.user.id, storeId, customerId, String(form.get("note") ?? ""));
  } catch (err) {
    return toFormState(err);
  }
  revalidatePath(`/dashboard/${storeId}/customers/${customerId}`);
  return { ok: true, message: "تم الحفظ." };
}

export async function anonymizeCustomerAction(storeId: string, customerId: string) {
  const session = await requireSession();
  await anonymizeCustomer(session.user.id, storeId, customerId, await getRequestMeta());
  revalidatePath(`/dashboard/${storeId}/customers`, "layout");
}
