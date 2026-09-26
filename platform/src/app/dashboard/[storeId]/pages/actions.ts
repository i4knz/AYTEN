"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createPageFromTemplate, deletePage, savePage, type PageTemplate } from "@/server/design/pages";
import { getRequestMeta, requireSession, toFormState, type FormState } from "@/server/web";

export async function savePageAction(storeId: string, pageId: string | null, _prev: FormState, form: FormData): Promise<FormState> {
  const session = await requireSession();
  let id: string;
  try {
    ({ pageId: id } = await savePage(
      session.user.id,
      storeId,
      pageId,
      {
        title: form.get("title"),
        slug: String(form.get("slug") ?? ""),
        body: String(form.get("body") ?? ""),
        published: form.get("published") === "on",
        showInFooter: form.get("showInFooter") === "on",
      },
      await getRequestMeta(),
    ));
  } catch (err) {
    return toFormState(err);
  }
  revalidatePath(`/dashboard/${storeId}/pages`, "layout");
  if (!pageId) redirect(`/dashboard/${storeId}/pages/${id}`);
  return { ok: true, message: "تم الحفظ." };
}

export async function createFromTemplateAction(storeId: string, template: PageTemplate) {
  const session = await requireSession();
  const { pageId } = await createPageFromTemplate(session.user.id, storeId, template);
  redirect(`/dashboard/${storeId}/pages/${pageId}`);
}

export async function deletePageAction(storeId: string, pageId: string) {
  const session = await requireSession();
  await deletePage(session.user.id, storeId, pageId);
  redirect(`/dashboard/${storeId}/pages`);
}
