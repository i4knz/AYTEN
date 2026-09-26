"use server";

import { revalidatePath } from "next/cache";
import { markNotificationsRead } from "@/server/notifications";
import { requireSession } from "@/server/web";

export async function markNotificationsReadAction(storeId: string) {
  const session = await requireSession();
  await markNotificationsRead(session.user.id, storeId);
  revalidatePath(`/dashboard/${storeId}`, "layout");
}
