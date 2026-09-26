"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { saveCoupon, setCouponActive } from "@/server/commerce/coupons";
import { formValues, getRequestMeta, requireSession, toFormState, type FormState } from "@/server/web";

export async function saveCouponAction(storeId: string, couponId: string | null, _prev: FormState, form: FormData): Promise<FormState> {
  const session = await requireSession();
  try {
    await saveCoupon(
      session.user.id,
      storeId,
      couponId,
      {
        code: form.get("code"),
        type: form.get("type"),
        value: String(form.get("value") ?? ""),
        maxDiscount: String(form.get("maxDiscount") ?? ""),
        minSubtotal: String(form.get("minSubtotal") ?? ""),
        startsAt: String(form.get("startsAt") ?? ""),
        endsAt: String(form.get("endsAt") ?? ""),
        usageLimit: String(form.get("usageLimit") ?? ""),
        usageLimitPerCustomer: String(form.get("usageLimitPerCustomer") ?? ""),
        productIds: form.getAll("productIds").map(String),
        categoryIds: form.getAll("categoryIds").map(String),
        active: form.get("active") === "on",
      },
      await getRequestMeta(),
    );
  } catch (err) {
    return toFormState(err, formValues(form));
  }
  revalidatePath(`/dashboard/${storeId}/marketing`, "layout");
  redirect(`/dashboard/${storeId}/marketing/coupons`);
}

export async function toggleCouponAction(storeId: string, couponId: string, active: boolean) {
  const session = await requireSession();
  await setCouponActive(session.user.id, storeId, couponId, active);
  revalidatePath(`/dashboard/${storeId}/marketing/coupons`);
}
