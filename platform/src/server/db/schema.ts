// Typed mirror of db/migrations. The SQL files are the source of truth for
// constraints, indexes and RLS policies; keep this file in sync with them.
import { sql } from "drizzle-orm";
import { boolean, customType, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

const citext = customType<{ data: string }>({ dataType: () => "citext" });
const bytea = customType<{ data: Buffer }>({ dataType: () => "bytea" });
const inet = customType<{ data: string }>({ dataType: () => "inet" });
const tz = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export const users = pgTable("users", {
  id: uuid("id").primaryKey(),
  email: citext("email").notNull(),
  emailVerifiedAt: tz("email_verified_at"),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  phone: text("phone"),
  locale: text("locale").notNull().default("ar"),
  status: text("status", { enum: ["active", "suspended", "deleted"] }).notNull().default("active"),
  lastLoginAt: tz("last_login_at"),
  createdAt: tz("created_at").notNull().default(sql`now()`),
  updatedAt: tz("updated_at").notNull().default(sql`now()`),
});

export const userSessions = pgTable("user_sessions", {
  id: uuid("id").primaryKey(),
  userId: uuid("user_id").notNull(),
  tokenHash: bytea("token_hash").notNull(),
  ip: inet("ip"),
  userAgent: text("user_agent"),
  createdAt: tz("created_at").notNull().default(sql`now()`),
  lastSeenAt: tz("last_seen_at").notNull().default(sql`now()`),
  expiresAt: tz("expires_at").notNull(),
  revokedAt: tz("revoked_at"),
});

export const verificationTokens = pgTable("verification_tokens", {
  id: uuid("id").primaryKey(),
  userId: uuid("user_id").notNull(),
  purpose: text("purpose", { enum: ["email_verify", "password_reset"] }).notNull(),
  tokenHash: bytea("token_hash").notNull(),
  expiresAt: tz("expires_at").notNull(),
  usedAt: tz("used_at"),
  createdAt: tz("created_at").notNull().default(sql`now()`),
});

export const BUSINESS_TYPES = ["fashion", "beauty", "electronics", "digital", "food", "general"] as const;
export type BusinessType = (typeof BUSINESS_TYPES)[number];

export const stores = pgTable("stores", {
  id: uuid("id").primaryKey(),
  ownerUserId: uuid("owner_user_id").notNull(),
  name: text("name").notNull(),
  slug: citext("slug").notNull(),
  businessType: text("business_type", { enum: BUSINESS_TYPES }).notNull(),
  countryCode: text("country_code").notNull().default("SA"),
  currency: text("currency").notNull().default("SAR"),
  defaultLocale: text("default_locale").notNull().default("ar"),
  timezone: text("timezone").notNull().default("Asia/Riyadh"),
  status: text("status", { enum: ["draft", "published", "paused", "suspended"] }).notNull().default("draft"),
  suspendedReason: text("suspended_reason"),
  publishedAt: tz("published_at"),
  createdAt: tz("created_at").notNull().default(sql`now()`),
  updatedAt: tz("updated_at").notNull().default(sql`now()`),
});

export const storeSettings = pgTable("store_settings", {
  storeId: uuid("store_id").primaryKey(),
  contactEmail: citext("contact_email"),
  contactPhone: text("contact_phone"),
  whatsapp: text("whatsapp"),
  logoUrl: text("logo_url"),
  brandColor: text("brand_color").notNull().default("#0f766e"),
  themeKey: text("theme_key").notNull().default("essential"),
  themeConfig: jsonb("theme_config").notNull().default({}),
  taxEnabled: boolean("tax_enabled").notNull().default(false),
  taxRateBps: integer("tax_rate_bps").notNull().default(1500),
  pricesIncludeTax: boolean("prices_include_tax").notNull().default(true),
  vatNumber: text("vat_number"),
  commercialRegistration: text("commercial_registration"),
  policies: jsonb("policies").notNull().default({}),
  updatedAt: tz("updated_at").notNull().default(sql`now()`),
});

export const STORE_ROLES = ["owner", "manager", "orders", "products", "marketing", "support", "viewer"] as const;
export type StoreRole = (typeof STORE_ROLES)[number];

export const storeMembers = pgTable("store_members", {
  id: uuid("id").primaryKey(),
  storeId: uuid("store_id").notNull(),
  userId: uuid("user_id").notNull(),
  role: text("role", { enum: STORE_ROLES }).notNull(),
  status: text("status", { enum: ["active", "removed"] }).notNull().default("active"),
  invitedBy: uuid("invited_by"),
  createdAt: tz("created_at").notNull().default(sql`now()`),
  updatedAt: tz("updated_at").notNull().default(sql`now()`),
});

export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").primaryKey(),
  storeId: uuid("store_id"),
  actorType: text("actor_type", { enum: ["user", "platform_admin", "system"] }).notNull(),
  actorId: uuid("actor_id"),
  action: text("action").notNull(),
  targetType: text("target_type"),
  targetId: uuid("target_id"),
  reason: text("reason"),
  ip: inet("ip"),
  userAgent: text("user_agent"),
  metadata: jsonb("metadata").notNull().default({}),
  createdAt: tz("created_at").notNull().default(sql`now()`),
});
