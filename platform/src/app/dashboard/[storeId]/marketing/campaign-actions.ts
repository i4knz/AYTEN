"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { markCartReminded } from "@/server/marketing/abandoned";
import { saveCampaign, sendCampaign } from "@/server/marketing/campaigns";
import { formValues, getRequestMeta, requireSession, toFormState, type FormState } from "@/server/web";

export async function remindCartAction(storeId: string, cartId: string, via: "whatsapp" | "email"): Promise<FormState> {
  const session = await requireSession();
  try {
    await markCartReminded(session.user.id, storeId, cartId, via, await getRequestMeta());
  } catch (err) {
    return toFormState(err);
  }
  revalidatePath(`/dashboard/${storeId}/marketing/abandoned`);
  return { ok: true, message: via === "email" ? "أُرسل التذكير." : "تم التسجيل." };
}

export async function saveCampaignAction(storeId: string, campaignId: string | null, _prev: FormState, form: FormData): Promise<FormState> {
  const session = await requireSession();
  let id: string;
  try {
    ({ campaignId: id } = await saveCampaign(session.user.id, storeId, campaignId, {
      name: form.get("name"),
      subject: form.get("subject"),
      body: form.get("body"),
      buttonText: String(form.get("buttonText") ?? ""),
      buttonLink: String(form.get("buttonLink") ?? ""),
      segment: form.get("segment"),
    }));
  } catch (err) {
    return toFormState(err, formValues(form));
  }
  revalidatePath(`/dashboard/${storeId}/marketing/campaigns`, "layout");
  if (!campaignId) redirect(`/dashboard/${storeId}/marketing/campaigns/${id}`);
  return { ok: true, message: "تم حفظ المسودة." };
}

export async function sendCampaignAction(storeId: string, campaignId: string): Promise<FormState> {
  const session = await requireSession();
  try {
    const { recipients, sent } = await sendCampaign(session.user.id, storeId, campaignId, await getRequestMeta());
    revalidatePath(`/dashboard/${storeId}/marketing/campaigns`, "layout");
    return { ok: true, message: `أُرسلت الحملة إلى ${sent} من ${recipients} مشترك.` };
  } catch (err) {
    return toFormState(err);
  }
}
