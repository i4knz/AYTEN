import "server-only";
import { notFound } from "next/navigation";
import { cache } from "react";
import { adminCan, getAdminAccess, type AdminPermission } from "@/server/admin/access";
import { requireSession } from "@/server/web";

/** Session + platform-admin role for /admin pages. Everyone else sees a 404. */
export const loadAdmin = cache(async (permission?: AdminPermission) => {
  const session = await requireSession("/admin");
  const admin = await getAdminAccess(session.user.id);
  if (!admin || (permission && !adminCan(admin, permission))) notFound();
  return { session, admin };
});
