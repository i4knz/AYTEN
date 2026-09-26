import { eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { platformAdmins, type AdminRole } from "../db/schema";
import { forbidden, notFound } from "../lib/errors";

export const ADMIN_PERMISSIONS = [
  "stores.read",
  "stores.manage",
  "billing.manage",
  "payouts.manage",
  "support.manage",
  "content.manage",
  "settings.manage",
  "admins.manage",
  "audit.read",
] as const;
export type AdminPermission = (typeof ADMIN_PERMISSIONS)[number];

export const ADMIN_ROLE_PERMISSIONS: Record<AdminRole, readonly AdminPermission[]> = {
  owner: ADMIN_PERMISSIONS,
  admin: ADMIN_PERMISSIONS.filter((p) => p !== "admins.manage"),
  finance: ["stores.read", "billing.manage", "payouts.manage", "audit.read"],
  support: ["stores.read", "support.manage", "content.manage"],
  content: ["content.manage"],
};

export const ADMIN_ROLE_LABELS: Record<AdminRole, string> = {
  owner: "مالك المنصة",
  admin: "مدير",
  finance: "المالية",
  support: "الدعم الفني",
  content: "المحتوى",
};

export interface AdminAccess {
  userId: string;
  role: AdminRole;
  permissions: readonly AdminPermission[];
}

export async function getAdminAccess(userId: string): Promise<AdminAccess | null> {
  const [row] = await getDb().select({ role: platformAdmins.role }).from(platformAdmins).where(eq(platformAdmins.userId, userId)).limit(1);
  return row ? { userId, role: row.role, permissions: ADMIN_ROLE_PERMISSIONS[row.role] } : null;
}

/** Non-admins get "not found" so the admin area cannot be discovered by probing. */
export async function requireAdmin(userId: string, permission?: AdminPermission): Promise<AdminAccess> {
  const access = await getAdminAccess(userId);
  if (!access) throw notFound();
  if (permission && !access.permissions.includes(permission)) throw forbidden();
  return access;
}

export function adminCan(access: AdminAccess, permission: AdminPermission) {
  return access.permissions.includes(permission);
}
