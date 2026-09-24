"use server";

import { revalidatePath } from "next/cache";
import { updateStoreProfile } from "@/server/stores/service";
import { formValues, getRequestMeta, requireSession, toFormState, type FormState } from "@/server/web";

export async function updateStoreProfileAction(storeId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const session = await requireSession();
  try {
    await updateStoreProfile(
      session.user.id,
      storeId,
      {
        name: form.get("name"),
        contactEmail: form.get("contactEmail") ?? "",
        contactPhone: form.get("contactPhone") ?? "",
        whatsapp: form.get("whatsapp") ?? "",
        brandColor: form.get("brandColor"),
      },
      await getRequestMeta(),
    );
  } catch (err) {
    return toFormState(err, formValues(form));
  }
  revalidatePath(`/dashboard/${storeId}`, "layout");
  return { ok: true, message: "تم حفظ التغييرات.", values: formValues(form) };
}
