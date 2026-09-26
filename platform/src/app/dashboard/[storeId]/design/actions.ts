"use server";

import { revalidatePath } from "next/cache";
import { discardThemeDraft, publishTheme, saveThemeDraft, uploadThemeImage } from "@/server/design/theme";
import { getRequestMeta, requireSession, toFormState, type FormState } from "@/server/web";

export async function saveDraftAction(storeId: string, theme: unknown): Promise<FormState> {
  const session = await requireSession();
  try {
    await saveThemeDraft(session.user.id, storeId, theme);
    return { ok: true, message: "تم حفظ المسودة." };
  } catch (err) {
    return toFormState(err);
  }
}

export async function publishThemeAction(storeId: string, theme: unknown): Promise<FormState> {
  const session = await requireSession();
  try {
    await publishTheme(session.user.id, storeId, theme, await getRequestMeta());
  } catch (err) {
    return toFormState(err);
  }
  revalidatePath(`/dashboard/${storeId}`, "layout");
  return { ok: true, message: "تم نشر التصميم على متجرك." };
}

export async function discardDraftAction(storeId: string) {
  const session = await requireSession();
  await discardThemeDraft(session.user.id, storeId);
  revalidatePath(`/dashboard/${storeId}/design`);
}

export async function uploadThemeImageAction(storeId: string, form: FormData): Promise<{ ok: boolean; key?: string; message?: string }> {
  const session = await requireSession();
  try {
    const { key } = await uploadThemeImage(session.user.id, storeId, form.get("image"));
    return { ok: true, key };
  } catch (err) {
    const s = toFormState(err);
    return { ok: false, message: s.message };
  }
}
