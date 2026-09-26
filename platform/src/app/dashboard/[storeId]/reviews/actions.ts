"use server";

import { revalidatePath } from "next/cache";
import { moderateReview } from "@/server/design/reviews";
import { getRequestMeta, requireSession } from "@/server/web";

export async function moderateAction(storeId: string, reviewId: string, decision: { status?: "approved" | "rejected"; reply?: string }) {
  const session = await requireSession();
  await moderateReview(session.user.id, storeId, reviewId, decision, await getRequestMeta());
  revalidatePath(`/dashboard/${storeId}/reviews`);
}
