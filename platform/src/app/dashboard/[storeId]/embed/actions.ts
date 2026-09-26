"use server";

import { revalidatePath } from "next/cache";
import { saveTracking, setFeature } from "@/server/design/settings";
import type { StoreFeatures } from "@/server/db/schema";
import { formValues, getRequestMeta, requireSession, toFormState, type FormState } from "@/server/web";

export async function saveTrackingAction(storeId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const session = await requireSession();
  try {
    await saveTracking(
      session.user.id,
      storeId,
      Object.fromEntries(["ga4", "gtm", "metaPixel", "tiktokPixel", "snapPixel"].map((k) => [k, String(form.get(k) ?? "")])),
      await getRequestMeta(),
    );
  } catch (err) {
    return toFormState(err, formValues(form));
  }
  revalidatePath(`/dashboard/${storeId}/embed`);
  return { ok: true, message: "تم الحفظ." };
}

export async function setFeatureAction(storeId: string, key: keyof StoreFeatures, enabled: boolean) {
  const session = await requireSession();
  await setFeature(session.user.id, storeId, key, enabled, await getRequestMeta());
  revalidatePath(`/dashboard/${storeId}/features`);
}
