"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { closeTicket, createTicket, replyToTicket } from "@/server/support/service";
import { formValues, getRequestMeta, requireSession, toFormState, type FormState } from "@/server/web";

export async function createTicketAction(storeId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const session = await requireSession();
  let id: string;
  try {
    const ticket = await createTicket(session.user.id, storeId, { subject: form.get("subject"), category: form.get("category"), body: form.get("body") }, await getRequestMeta());
    id = ticket.id;
  } catch (err) {
    return toFormState(err, formValues(form));
  }
  revalidatePath(`/dashboard/${storeId}/help`);
  redirect(`/dashboard/${storeId}/help/tickets/${id}`);
}

export async function replyTicketAction(storeId: string, ticketId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const session = await requireSession();
  try {
    await replyToTicket(session.user.id, storeId, ticketId, form.get("body"));
  } catch (err) {
    return toFormState(err, formValues(form));
  }
  revalidatePath(`/dashboard/${storeId}/help/tickets/${ticketId}`);
  return { ok: true };
}

export async function closeTicketAction(storeId: string, ticketId: string, form: FormData) {
  const session = await requireSession();
  await closeTicket(session.user.id, storeId, ticketId, Number(form.get("rating")) || undefined);
  revalidatePath(`/dashboard/${storeId}/help/tickets/${ticketId}`);
}
