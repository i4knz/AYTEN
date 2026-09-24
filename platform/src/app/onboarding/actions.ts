"use server";

import { redirect } from "next/navigation";
import { checkSlug, createStore, suggestAvailableSlug } from "@/server/stores/service";
import { formValues, getRequestMeta, requireSession, toFormState, type FormState } from "@/server/web";

export async function suggestSlugAction(name: string): Promise<string> {
  await requireSession();
  return suggestAvailableSlug(String(name).slice(0, 60));
}

export async function checkSlugAction(slug: string) {
  await requireSession();
  return checkSlug(String(slug).slice(0, 64));
}

export async function createStoreAction(_prev: FormState, form: FormData): Promise<FormState> {
  const session = await requireSession("/onboarding");
  let storeId: string;
  try {
    ({ storeId } = await createStore(
      session.user.id,
      { name: form.get("name"), slug: form.get("slug"), businessType: form.get("businessType") },
      await getRequestMeta(),
    ));
  } catch (err) {
    return toFormState(err, formValues(form));
  }
  redirect(`/dashboard/${storeId}?welcome=1`);
}
