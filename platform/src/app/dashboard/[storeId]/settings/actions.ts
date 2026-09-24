"use server";

import { revalidatePath } from "next/cache";
import { removeStoreLogo, uploadStoreLogo } from "@/server/catalog/images";
import { publishStore, unpublishStore, updateStoreProfile } from "@/server/stores/service";
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

export async function uploadLogoAction(storeId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const session = await requireSession();
  try {
    await uploadStoreLogo(session.user.id, storeId, form.get("logo"), await getRequestMeta());
  } catch (err) {
    return toFormState(err);
  }
  revalidatePath(`/dashboard/${storeId}`, "layout");
  return { ok: true, message: "تم تحديث الشعار." };
}

export async function removeLogoAction(storeId: string) {
  const session = await requireSession();
  await removeStoreLogo(session.user.id, storeId, await getRequestMeta());
  revalidatePath(`/dashboard/${storeId}`, "layout");
}

export async function publishAction(storeId: string, _prev: FormState): Promise<FormState> {
  const session = await requireSession();
  try {
    await publishStore(session.user.id, storeId, await getRequestMeta());
  } catch (err) {
    return toFormState(err);
  }
  revalidatePath(`/dashboard/${storeId}`, "layout");
  return { ok: true, message: "تم نشر متجرك! شارك الرابط مع عملائك." };
}

export async function unpublishAction(storeId: string) {
  const session = await requireSession();
  await unpublishStore(session.user.id, storeId, await getRequestMeta());
  revalidatePath(`/dashboard/${storeId}`, "layout");
}
