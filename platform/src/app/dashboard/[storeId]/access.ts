import "server-only";
import { notFound } from "next/navigation";
import { cache } from "react";
import { getStoreAccess } from "@/server/stores/service";
import { requireSession } from "@/server/web";

/** Session + store membership for dashboard pages. Non-members see a 404. Cached per request. */
export const loadStore = cache(async (storeId: string) => {
  const session = await requireSession(`/dashboard/${storeId}`);
  const access = await getStoreAccess(session.user.id, storeId);
  if (!access) notFound();
  return { session, access };
});
