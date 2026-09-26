"use server";

import { revalidatePath } from "next/cache";
import { deleteShippingMethod, savePaymentSettings, saveShippingMethod, saveTaxSettings } from "@/server/commerce/shipping";
import { formValues, getRequestMeta, requireSession, toFormState, type FormState } from "@/server/web";

export async function saveShippingAction(storeId: string, methodId: string | null, _prev: FormState, form: FormData): Promise<FormState> {
  const session = await requireSession();
  try {
    await saveShippingMethod(
      session.user.id,
      storeId,
      methodId,
      {
        name: form.get("name"),
        type: form.get("type"),
        price: String(form.get("price") ?? ""),
        freeThreshold: String(form.get("freeThreshold") ?? ""),
        cities: String(form.get("cities") ?? ""),
        estimatedDays: String(form.get("estimatedDays") ?? ""),
        pickupAddress: String(form.get("pickupAddress") ?? ""),
        active: form.get("active") === "on",
      },
      await getRequestMeta(),
    );
  } catch (err) {
    return toFormState(err, formValues(form));
  }
  revalidatePath(`/dashboard/${storeId}`, "layout");
  return { ok: true, message: "تم الحفظ." };
}

export async function deleteShippingAction(storeId: string, methodId: string) {
  const session = await requireSession();
  await deleteShippingMethod(session.user.id, storeId, methodId);
  revalidatePath(`/dashboard/${storeId}`, "layout");
}

export async function savePaymentsAction(storeId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const session = await requireSession();
  try {
    await savePaymentSettings(
      session.user.id,
      storeId,
      {
        codEnabled: form.get("codEnabled") === "on",
        codFee: String(form.get("codFee") ?? ""),
        bankEnabled: form.get("bankEnabled") === "on",
        bankName: String(form.get("bankName") ?? ""),
        accountName: String(form.get("accountName") ?? ""),
        iban: String(form.get("iban") ?? ""),
        onlineEnabled: form.get("onlineEnabled") === "on",
      },
      await getRequestMeta(),
    );
  } catch (err) {
    return toFormState(err, formValues(form));
  }
  revalidatePath(`/dashboard/${storeId}`, "layout");
  return { ok: true, message: "تم حفظ إعدادات الدفع." };
}

export async function saveTaxAction(storeId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const session = await requireSession();
  try {
    await saveTaxSettings(
      session.user.id,
      storeId,
      {
        taxEnabled: form.get("taxEnabled") === "on",
        pricesIncludeTax: form.get("pricesIncludeTax") === "on",
        vatNumber: String(form.get("vatNumber") ?? ""),
        commercialRegistration: String(form.get("commercialRegistration") ?? ""),
        requireEmail: form.get("requireEmail") === "on",
      },
      await getRequestMeta(),
    );
  } catch (err) {
    return toFormState(err, formValues(form));
  }
  revalidatePath(`/dashboard/${storeId}`, "layout");
  return { ok: true, message: "تم الحفظ." };
}
