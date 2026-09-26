"use server";

import { revalidatePath } from "next/cache";
import {
  addOrderNote,
  cancelOrder,
  markOrderDelivered,
  markOrderPaid,
  recordRefund,
  setOrderPreparation,
  shipOrder,
} from "@/server/commerce/orders";
import { getRequestMeta, requireSession, toFormState, type FormState } from "@/server/web";

type Action = "paid" | "processing" | "ready" | "ship" | "delivered" | "cancel" | "refund" | "note";

export async function orderAction(storeId: string, orderId: string, action: Action, _prev: FormState, form: FormData): Promise<FormState> {
  const session = await requireSession();
  const meta = await getRequestMeta();
  const userId = session.user.id;
  try {
    switch (action) {
      case "paid":
        await markOrderPaid(userId, storeId, orderId, meta);
        break;
      case "processing":
      case "ready":
        await setOrderPreparation(userId, storeId, orderId, action, meta);
        break;
      case "ship":
        await shipOrder(userId, storeId, orderId, { carrier: form.get("carrier") ?? "", trackingNumber: form.get("trackingNumber") ?? "", trackingUrl: form.get("trackingUrl") ?? "" }, meta);
        break;
      case "delivered":
        await markOrderDelivered(userId, storeId, orderId, meta);
        break;
      case "cancel":
        await cancelOrder(userId, storeId, orderId, { reason: form.get("reason") ?? "", restock: form.get("restock") === "on" }, meta);
        break;
      case "refund":
        await recordRefund(userId, storeId, orderId, { amount: form.get("amount") ?? "", reason: form.get("reason") ?? "" }, meta);
        break;
      case "note":
        await addOrderNote(userId, storeId, orderId, String(form.get("body") ?? ""));
        break;
    }
  } catch (err) {
    return toFormState(err);
  }
  revalidatePath(`/dashboard/${storeId}`, "layout");
  return { ok: true, message: "تم." };
}
