"use server";

import { revalidatePath } from "next/cache";
import { requestPlanInvoice, setCancelAtPeriodEnd } from "@/server/billing/service";
import { getRequestMeta, requireSession, toFormState, type FormState } from "@/server/web";

export async function requestInvoiceAction(storeId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const session = await requireSession();
  try {
    const invoice = await requestPlanInvoice(session.user.id, storeId, { planId: form.get("planId"), interval: form.get("interval") }, await getRequestMeta());
    revalidatePath(`/dashboard/${storeId}/billing`);
    return { ok: true, message: `صدرت الفاتورة رقم ${invoice.number}. تفاصيل الدفع في أعلى الصفحة.` };
  } catch (err) {
    return toFormState(err);
  }
}

export async function cancelRenewalAction(storeId: string, cancel: boolean) {
  const session = await requireSession();
  await setCancelAtPeriodEnd(session.user.id, storeId, cancel, await getRequestMeta());
  revalidatePath(`/dashboard/${storeId}/billing`);
}
