import type { StoreRole } from "../db/schema";

export const PERMISSIONS = [
  "products.read",
  "products.write",
  "orders.read",
  "orders.write",
  "customers.read",
  "customers.export",
  "inventory.write",
  "reports.read",
  "design.write",
  "marketing.write",
  "settings.write",
  "team.manage",
  "billing.read",
  "billing.manage",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

// Built-in roles. Custom roles are P2; until then this table is the single
// source of truth, and it is covered by a matrix test.
export const ROLE_PERMISSIONS: Record<StoreRole, readonly Permission[]> = {
  owner: PERMISSIONS,
  manager: PERMISSIONS.filter((p) => p !== "billing.manage"),
  orders: ["orders.read", "orders.write", "customers.read", "products.read", "inventory.write"],
  products: ["products.read", "products.write", "inventory.write", "orders.read"],
  marketing: ["products.read", "customers.read", "reports.read", "design.write", "marketing.write"],
  support: ["orders.read", "customers.read", "products.read"],
  viewer: ["products.read", "orders.read", "customers.read", "reports.read", "billing.read"],
};

export const ROLE_LABELS: Record<StoreRole, string> = {
  owner: "مالك المتجر",
  manager: "مدير المتجر",
  orders: "مسؤول الطلبات",
  products: "مسؤول المنتجات",
  marketing: "مسؤول التسويق",
  support: "خدمة العملاء",
  viewer: "مشاهد التقارير",
};

export function roleHas(role: StoreRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}
