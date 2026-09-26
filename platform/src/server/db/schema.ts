// Typed mirror of db/migrations. The SQL files are the source of truth for
// constraints, indexes and RLS policies; keep this file in sync with them.
import { sql } from "drizzle-orm";
import { bigint, boolean, customType, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

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
  referralCode: text("referral_code"),
  referredBy: uuid("referred_by"),
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
  // Defaults are applied by the database (see 0003_orders.sql).
  payments: jsonb("payments").$type<PaymentSettings>().notNull().default(sql`DEFAULT`),
  checkout: jsonb("checkout").$type<{ requireEmail: boolean }>().notNull().default(sql`DEFAULT`),
  themeDraft: jsonb("theme_draft"),
  themePublishedAt: tz("theme_published_at"),
  tracking: jsonb("tracking").$type<TrackingSettings>().notNull().default(sql`DEFAULT`),
  features: jsonb("features").$type<StoreFeatures>().notNull().default(sql`DEFAULT`),
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

export const INVITABLE_ROLES = ["manager", "orders", "products", "marketing", "support", "viewer"] as const;
export type InvitableRole = (typeof INVITABLE_ROLES)[number];

export const storeInvitations = pgTable("store_invitations", {
  id: uuid("id").primaryKey(),
  storeId: uuid("store_id").notNull(),
  email: citext("email").notNull(),
  role: text("role", { enum: INVITABLE_ROLES }).notNull(),
  tokenHash: bytea("token_hash").notNull(),
  invitedBy: uuid("invited_by"),
  expiresAt: tz("expires_at").notNull(),
  acceptedAt: tz("accepted_at"),
  acceptedBy: uuid("accepted_by"),
  revokedAt: tz("revoked_at"),
  createdAt: tz("created_at").notNull().default(sql`now()`),
});

export const categories = pgTable("categories", {
  id: uuid("id").primaryKey(),
  storeId: uuid("store_id").notNull(),
  parentId: uuid("parent_id"),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  description: text("description"),
  position: integer("position").notNull().default(0),
  createdAt: tz("created_at").notNull().default(sql`now()`),
  updatedAt: tz("updated_at").notNull().default(sql`now()`),
});

export const PRODUCT_STATUSES = ["draft", "active", "archived"] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

export const products = pgTable("products", {
  id: uuid("id").primaryKey(),
  storeId: uuid("store_id").notNull(),
  type: text("type", { enum: ["physical", "digital", "service"] }).notNull().default("physical"),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  description: text("description").notNull().default(""),
  status: text("status", { enum: PRODUCT_STATUSES }).notNull().default("draft"),
  requiresShipping: boolean("requires_shipping").notNull().default(true),
  taxable: boolean("taxable").notNull().default(true),
  seoTitle: text("seo_title"),
  seoDescription: text("seo_description"),
  createdAt: tz("created_at").notNull().default(sql`now()`),
  updatedAt: tz("updated_at").notNull().default(sql`now()`),
});

export const productOptions = pgTable("product_options", {
  id: uuid("id").primaryKey(),
  storeId: uuid("store_id").notNull(),
  productId: uuid("product_id").notNull(),
  name: text("name").notNull(),
  position: integer("position").notNull(),
  values: text("values").array().notNull(),
});

export const productVariants = pgTable("product_variants", {
  id: uuid("id").primaryKey(),
  storeId: uuid("store_id").notNull(),
  productId: uuid("product_id").notNull(),
  option1: text("option1"),
  option2: text("option2"),
  option3: text("option3"),
  sku: text("sku"),
  barcode: text("barcode"),
  price: bigint("price", { mode: "number" }).notNull(),
  compareAtPrice: bigint("compare_at_price", { mode: "number" }),
  cost: bigint("cost", { mode: "number" }),
  weightGrams: integer("weight_grams"),
  position: integer("position").notNull().default(0),
  archivedAt: tz("archived_at"),
  createdAt: tz("created_at").notNull().default(sql`now()`),
  updatedAt: tz("updated_at").notNull().default(sql`now()`),
});

export const productImages = pgTable("product_images", {
  id: uuid("id").primaryKey(),
  storeId: uuid("store_id").notNull(),
  productId: uuid("product_id").notNull(),
  storageKey: text("storage_key").notNull(),
  width: integer("width").notNull(),
  height: integer("height").notNull(),
  alt: text("alt").notNull().default(""),
  position: integer("position").notNull().default(0),
  createdAt: tz("created_at").notNull().default(sql`now()`),
});

export const productCategories = pgTable("product_categories", {
  storeId: uuid("store_id").notNull(),
  productId: uuid("product_id").notNull(),
  categoryId: uuid("category_id").notNull(),
});

export const inventoryLevels = pgTable("inventory_levels", {
  storeId: uuid("store_id").notNull(),
  variantId: uuid("variant_id").primaryKey(),
  trackInventory: boolean("track_inventory").notNull().default(true),
  onHand: integer("on_hand").notNull().default(0),
  reserved: integer("reserved").notNull().default(0),
  lowStockThreshold: integer("low_stock_threshold"),
  updatedAt: tz("updated_at").notNull().default(sql`now()`),
});

export const INVENTORY_REASONS = ["initial", "manual_adjust", "order_committed", "order_released", "return_restock", "import"] as const;

export const inventoryMovements = pgTable("inventory_movements", {
  id: uuid("id").primaryKey(),
  storeId: uuid("store_id").notNull(),
  variantId: uuid("variant_id").notNull(),
  delta: integer("delta").notNull(),
  onHandAfter: integer("on_hand_after").notNull(),
  reason: text("reason", { enum: INVENTORY_REASONS }).notNull(),
  orderId: uuid("order_id"),
  actorUserId: uuid("actor_user_id"),
  note: text("note"),
  createdAt: tz("created_at").notNull().default(sql`now()`),
});

// ---------------------------------------------------------------------------
// 0003: orders
// ---------------------------------------------------------------------------

export interface PaymentSettings {
  cod: { enabled: boolean; fee: number };
  bankTransfer: { enabled: boolean; bankName?: string; accountName?: string; iban?: string };
  online: { enabled: boolean };
}

export const customers = pgTable("customers", {
  id: uuid("id").primaryKey(),
  storeId: uuid("store_id").notNull(),
  phone: text("phone").notNull(),
  email: citext("email"),
  name: text("name").notNull(),
  acceptsMarketing: boolean("accepts_marketing").notNull().default(false),
  marketingConsentAt: tz("marketing_consent_at"),
  note: text("note"),
  ordersCount: integer("orders_count").notNull().default(0),
  cancelledCount: integer("cancelled_count").notNull().default(0),
  totalSpent: bigint("total_spent", { mode: "number" }).notNull().default(0),
  firstOrderAt: tz("first_order_at"),
  lastOrderAt: tz("last_order_at"),
  anonymizedAt: tz("anonymized_at"),
  unsubscribedAt: tz("unsubscribed_at"),
  createdAt: tz("created_at").notNull().default(sql`now()`),
  updatedAt: tz("updated_at").notNull().default(sql`now()`),
});

export const SHIPPING_TYPES = ["flat", "free_over", "pickup"] as const;

export const shippingMethods = pgTable("shipping_methods", {
  id: uuid("id").primaryKey(),
  storeId: uuid("store_id").notNull(),
  name: text("name").notNull(),
  type: text("type", { enum: SHIPPING_TYPES }).notNull(),
  price: bigint("price", { mode: "number" }).notNull().default(0),
  freeThreshold: bigint("free_threshold", { mode: "number" }),
  cities: text("cities").array().notNull().default(sql`'{}'`),
  estimatedDays: text("estimated_days"),
  pickupAddress: text("pickup_address"),
  active: boolean("active").notNull().default(true),
  position: integer("position").notNull().default(0),
  createdAt: tz("created_at").notNull().default(sql`now()`),
  updatedAt: tz("updated_at").notNull().default(sql`now()`),
});

export const COUPON_TYPES = ["percent", "fixed", "free_shipping"] as const;
export type CouponType = (typeof COUPON_TYPES)[number];

export const coupons = pgTable("coupons", {
  id: uuid("id").primaryKey(),
  storeId: uuid("store_id").notNull(),
  code: citext("code").notNull(),
  type: text("type", { enum: COUPON_TYPES }).notNull(),
  value: bigint("value", { mode: "number" }).notNull().default(0),
  maxDiscount: bigint("max_discount", { mode: "number" }),
  minSubtotal: bigint("min_subtotal", { mode: "number" }),
  startsAt: tz("starts_at"),
  endsAt: tz("ends_at"),
  usageLimit: integer("usage_limit"),
  usageLimitPerCustomer: integer("usage_limit_per_customer"),
  usedCount: integer("used_count").notNull().default(0),
  productIds: uuid("product_ids").array().notNull().default(sql`'{}'`),
  categoryIds: uuid("category_ids").array().notNull().default(sql`'{}'`),
  active: boolean("active").notNull().default(true),
  createdAt: tz("created_at").notNull().default(sql`now()`),
  updatedAt: tz("updated_at").notNull().default(sql`now()`),
});

export const carts = pgTable("carts", {
  id: uuid("id").primaryKey(),
  storeId: uuid("store_id").notNull(),
  tokenHash: bytea("token_hash").notNull(),
  couponCode: citext("coupon_code"),
  contactName: text("contact_name"),
  contactPhone: text("contact_phone"),
  contactEmail: citext("contact_email"),
  checkoutStartedAt: tz("checkout_started_at"),
  convertedOrderId: uuid("converted_order_id"),
  remindedAt: tz("reminded_at"),
  createdAt: tz("created_at").notNull().default(sql`now()`),
  updatedAt: tz("updated_at").notNull().default(sql`now()`),
});

export const cartItems = pgTable("cart_items", {
  id: uuid("id").primaryKey(),
  storeId: uuid("store_id").notNull(),
  cartId: uuid("cart_id").notNull(),
  variantId: uuid("variant_id").notNull(),
  quantity: integer("quantity").notNull(),
  createdAt: tz("created_at").notNull().default(sql`now()`),
});

export const orderCounters = pgTable("order_counters", {
  storeId: uuid("store_id").primaryKey(),
  lastNumber: bigint("last_number", { mode: "number" }).notNull().default(1000),
});

export const PAYMENT_METHODS = ["cod", "bank_transfer", "online"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export const PAYMENT_STATUSES = ["pending", "awaiting_transfer", "paid", "partially_refunded", "refunded", "failed", "voided"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
export const FULFILLMENT_STATUSES = ["unfulfilled", "processing", "ready", "shipped", "delivered", "returned", "cancelled"] as const;
export type FulfillmentStatus = (typeof FULFILLMENT_STATUSES)[number];

export interface CustomerSnapshot {
  name: string;
  phone: string;
  email: string | null;
}
export interface ShippingAddress {
  city: string;
  district: string;
  street: string;
  details: string;
  postalCode: string;
}
export interface ShippingMethodSnapshot {
  id: string | null;
  name: string;
  type: (typeof SHIPPING_TYPES)[number];
  estimatedDays: string | null;
  pickupAddress: string | null;
}

export const orders = pgTable("orders", {
  id: uuid("id").primaryKey(),
  storeId: uuid("store_id").notNull(),
  number: bigint("number", { mode: "number" }).notNull(),
  accessKey: text("access_key").notNull(),
  customerId: uuid("customer_id").notNull(),
  source: text("source", { enum: ["storefront", "manual"] }).notNull().default("storefront"),
  currency: text("currency").notNull(),
  subtotal: bigint("subtotal", { mode: "number" }).notNull(),
  discountTotal: bigint("discount_total", { mode: "number" }).notNull().default(0),
  shippingTotal: bigint("shipping_total", { mode: "number" }).notNull().default(0),
  paymentFee: bigint("payment_fee", { mode: "number" }).notNull().default(0),
  taxTotal: bigint("tax_total", { mode: "number" }).notNull().default(0),
  total: bigint("total", { mode: "number" }).notNull(),
  refundedTotal: bigint("refunded_total", { mode: "number" }).notNull().default(0),
  pricesIncludeTax: boolean("prices_include_tax").notNull(),
  taxRateBps: integer("tax_rate_bps").notNull().default(0),
  paymentMethod: text("payment_method", { enum: PAYMENT_METHODS }).notNull(),
  paymentStatus: text("payment_status", { enum: PAYMENT_STATUSES }).notNull(),
  fulfillmentStatus: text("fulfillment_status", { enum: FULFILLMENT_STATUSES }).notNull().default("unfulfilled"),
  status: text("status", { enum: ["open", "completed", "cancelled"] }).notNull().default("open"),
  customerSnapshot: jsonb("customer_snapshot").$type<CustomerSnapshot>().notNull(),
  shippingAddress: jsonb("shipping_address").$type<ShippingAddress>().notNull(),
  shippingMethod: jsonb("shipping_method").$type<ShippingMethodSnapshot>().notNull(),
  couponCode: citext("coupon_code"),
  customerNote: text("customer_note"),
  cancelReason: text("cancel_reason"),
  cancelledAt: tz("cancelled_at"),
  completedAt: tz("completed_at"),
  idempotencyKey: text("idempotency_key").notNull(),
  createdAt: tz("created_at").notNull().default(sql`now()`),
  updatedAt: tz("updated_at").notNull().default(sql`now()`),
});

export const orderItems = pgTable("order_items", {
  id: uuid("id").primaryKey(),
  storeId: uuid("store_id").notNull(),
  orderId: uuid("order_id").notNull(),
  productId: uuid("product_id"),
  variantId: uuid("variant_id"),
  productName: text("product_name").notNull(),
  variantTitle: text("variant_title").notNull().default(""),
  sku: text("sku"),
  imageKey: text("image_key"),
  unitPrice: bigint("unit_price", { mode: "number" }).notNull(),
  quantity: integer("quantity").notNull(),
  discountAmount: bigint("discount_amount", { mode: "number" }).notNull().default(0),
  taxAmount: bigint("tax_amount", { mode: "number" }).notNull().default(0),
  lineTotal: bigint("line_total", { mode: "number" }).notNull(),
  stockState: text("stock_state", { enum: ["none", "reserved", "committed", "released"] }).notNull().default("none"),
});

export const orderEvents = pgTable("order_events", {
  id: uuid("id").primaryKey(),
  storeId: uuid("store_id").notNull(),
  orderId: uuid("order_id").notNull(),
  type: text("type").notNull(),
  message: text("message").notNull(),
  data: jsonb("data").notNull().default({}),
  actorType: text("actor_type", { enum: ["customer", "user", "system", "provider"] }).notNull(),
  actorId: uuid("actor_id"),
  createdAt: tz("created_at").notNull().default(sql`now()`),
});

export const orderNotes = pgTable("order_notes", {
  id: uuid("id").primaryKey(),
  storeId: uuid("store_id").notNull(),
  orderId: uuid("order_id").notNull(),
  authorUserId: uuid("author_user_id"),
  body: text("body").notNull(),
  createdAt: tz("created_at").notNull().default(sql`now()`),
});

export const payments = pgTable("payments", {
  id: uuid("id").primaryKey(),
  storeId: uuid("store_id").notNull(),
  orderId: uuid("order_id").notNull(),
  provider: text("provider").notNull(),
  providerPaymentId: text("provider_payment_id"),
  amount: bigint("amount", { mode: "number" }).notNull(),
  currency: text("currency").notNull(),
  status: text("status", { enum: ["pending", "paid", "failed", "refunded", "partially_refunded", "voided"] }).notNull(),
  failureReason: text("failure_reason"),
  createdAt: tz("created_at").notNull().default(sql`now()`),
  updatedAt: tz("updated_at").notNull().default(sql`now()`),
});

export const refunds = pgTable("refunds", {
  id: uuid("id").primaryKey(),
  storeId: uuid("store_id").notNull(),
  orderId: uuid("order_id").notNull(),
  amount: bigint("amount", { mode: "number" }).notNull(),
  reason: text("reason"),
  restock: boolean("restock").notNull().default(false),
  method: text("method", { enum: ["manual", "provider"] }).notNull(),
  createdBy: uuid("created_by"),
  createdAt: tz("created_at").notNull().default(sql`now()`),
});

export const shipments = pgTable("shipments", {
  id: uuid("id").primaryKey(),
  storeId: uuid("store_id").notNull(),
  orderId: uuid("order_id").notNull(),
  carrier: text("carrier"),
  trackingNumber: text("tracking_number"),
  trackingUrl: text("tracking_url"),
  shippedAt: tz("shipped_at").notNull().default(sql`now()`),
  deliveredAt: tz("delivered_at"),
  createdAt: tz("created_at").notNull().default(sql`now()`),
});

export const couponRedemptions = pgTable("coupon_redemptions", {
  id: uuid("id").primaryKey(),
  storeId: uuid("store_id").notNull(),
  couponId: uuid("coupon_id").notNull(),
  orderId: uuid("order_id").notNull(),
  customerId: uuid("customer_id").notNull(),
  amount: bigint("amount", { mode: "number" }).notNull(),
  createdAt: tz("created_at").notNull().default(sql`now()`),
});

export const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey(),
  storeId: uuid("store_id").notNull(),
  type: text("type").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull().default(""),
  link: text("link"),
  readAt: tz("read_at"),
  createdAt: tz("created_at").notNull().default(sql`now()`),
});

export const webhookEvents = pgTable("webhook_events", {
  id: uuid("id").primaryKey(),
  provider: text("provider").notNull(),
  eventId: text("event_id").notNull(),
  type: text("type").notNull(),
  payload: jsonb("payload").notNull(),
  receivedAt: tz("received_at").notNull().default(sql`now()`),
  processedAt: tz("processed_at"),
  error: text("error"),
});

// ---------------------------------------------------------------------------
// 0004: design & content
// ---------------------------------------------------------------------------

export interface TrackingSettings {
  ga4?: string;
  gtm?: string;
  metaPixel?: string;
  tiktokPixel?: string;
  snapPixel?: string;
}

export interface StoreFeatures {
  whatsappButton: boolean;
  reviews: boolean;
  stockHints: boolean;
  shareButtons: boolean;
  abandonedCartReminders?: boolean;
  googleFeed?: boolean;
}

export const pages = pgTable("pages", {
  id: uuid("id").primaryKey(),
  storeId: uuid("store_id").notNull(),
  slug: text("slug").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull().default(""),
  published: boolean("published").notNull().default(true),
  showInFooter: boolean("show_in_footer").notNull().default(true),
  position: integer("position").notNull().default(0),
  createdAt: tz("created_at").notNull().default(sql`now()`),
  updatedAt: tz("updated_at").notNull().default(sql`now()`),
});

export const reviews = pgTable("reviews", {
  id: uuid("id").primaryKey(),
  storeId: uuid("store_id").notNull(),
  productId: uuid("product_id").notNull(),
  orderId: uuid("order_id").notNull(),
  customerId: uuid("customer_id").notNull(),
  authorName: text("author_name").notNull(),
  rating: integer("rating").notNull(),
  body: text("body").notNull().default(""),
  status: text("status", { enum: ["pending", "approved", "rejected"] }).notNull().default("pending"),
  reply: text("reply"),
  repliedAt: tz("replied_at"),
  createdAt: tz("created_at").notNull().default(sql`now()`),
  updatedAt: tz("updated_at").notNull().default(sql`now()`),
});

// ---------------------------------------------------------------------------
// 0005: marketing
// ---------------------------------------------------------------------------

export const PAGE_TYPES = ["home", "product", "category", "cart", "checkout", "order", "page", "other"] as const;
export const TRAFFIC_SOURCES = ["direct", "google", "instagram", "tiktok", "snapchat", "whatsapp", "x", "facebook", "other"] as const;

export const pageViews = pgTable("page_views", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  storeId: uuid("store_id").notNull(),
  day: text("day").notNull(),
  visitor: bytea("visitor").notNull(),
  pageType: text("page_type", { enum: PAGE_TYPES }).notNull(),
  productId: uuid("product_id"),
  source: text("source", { enum: TRAFFIC_SOURCES }).notNull(),
  campaign: text("campaign"),
  device: text("device", { enum: ["mobile", "desktop"] }).notNull(),
  createdAt: tz("created_at").notNull().default(sql`now()`),
});

export const CAMPAIGN_SEGMENTS = ["subscribers", "repeat", "inactive", "new"] as const;

export const campaigns = pgTable("campaigns", {
  id: uuid("id").primaryKey(),
  storeId: uuid("store_id").notNull(),
  name: text("name").notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  buttonText: text("button_text"),
  buttonLink: text("button_link"),
  segment: text("segment", { enum: CAMPAIGN_SEGMENTS }).notNull().default("subscribers"),
  status: text("status", { enum: ["draft", "sending", "sent", "failed"] }).notNull().default("draft"),
  recipientsCount: integer("recipients_count").notNull().default(0),
  sentCount: integer("sent_count").notNull().default(0),
  sentAt: tz("sent_at"),
  createdBy: uuid("created_by"),
  createdAt: tz("created_at").notNull().default(sql`now()`),
  updatedAt: tz("updated_at").notNull().default(sql`now()`),
});

// ---------------------------------------------------------------------------
// 0006: platform
// ---------------------------------------------------------------------------

export const ADMIN_ROLES = ["owner", "admin", "support", "finance", "content"] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

export const platformAdmins = pgTable("platform_admins", {
  userId: uuid("user_id").primaryKey(),
  role: text("role", { enum: ADMIN_ROLES }).notNull(),
  createdBy: uuid("created_by"),
  createdAt: tz("created_at").notNull().default(sql`now()`),
});

export const platformSettings = pgTable("platform_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedBy: uuid("updated_by"),
  updatedAt: tz("updated_at").notNull().default(sql`now()`),
});

export interface PlanLimits {
  products?: number | null;
  staff?: number | null;
  ordersPerMonth?: number | null;
}
export interface PlanFeatures {
  campaigns?: boolean;
  advancedReports?: boolean;
  removeBranding?: boolean;
}

export const plans = pgTable("plans", {
  id: uuid("id").primaryKey(),
  key: text("key").notNull(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  priceMonthly: bigint("price_monthly", { mode: "number" }).notNull(),
  priceYearly: bigint("price_yearly", { mode: "number" }).notNull(),
  currency: text("currency").notNull().default("SAR"),
  trialDays: integer("trial_days").notNull().default(14),
  limits: jsonb("limits").$type<PlanLimits>().notNull().default({}),
  features: jsonb("features").$type<PlanFeatures>().notNull().default({}),
  isPublic: boolean("is_public").notNull().default(true),
  isDefault: boolean("is_default").notNull().default(false),
  position: integer("position").notNull().default(0),
  archivedAt: tz("archived_at"),
  createdAt: tz("created_at").notNull().default(sql`now()`),
  updatedAt: tz("updated_at").notNull().default(sql`now()`),
});

export const SUBSCRIPTION_STATUSES = ["trialing", "active", "past_due", "expired", "cancelled"] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").primaryKey(),
  storeId: uuid("store_id").notNull(),
  planId: uuid("plan_id").notNull(),
  status: text("status", { enum: SUBSCRIPTION_STATUSES }).notNull(),
  billingInterval: text("billing_interval", { enum: ["monthly", "yearly"] }).notNull().default("monthly"),
  trialEndsAt: tz("trial_ends_at"),
  currentPeriodEnd: tz("current_period_end"),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
  createdAt: tz("created_at").notNull().default(sql`now()`),
  updatedAt: tz("updated_at").notNull().default(sql`now()`),
});

export const platformInvoices = pgTable("platform_invoices", {
  id: uuid("id").primaryKey(),
  storeId: uuid("store_id").notNull(),
  number: bigint("number", { mode: "number" }).notNull().default(sql`nextval('platform_invoice_number')`),
  planId: uuid("plan_id").notNull(),
  planName: text("plan_name").notNull(),
  billingInterval: text("billing_interval", { enum: ["monthly", "yearly"] }).notNull(),
  subtotal: bigint("subtotal", { mode: "number" }).notNull(),
  tax: bigint("tax", { mode: "number" }).notNull().default(0),
  total: bigint("total", { mode: "number" }).notNull(),
  currency: text("currency").notNull().default("SAR"),
  status: text("status", { enum: ["issued", "paid", "void"] }).notNull().default("issued"),
  paymentMethod: text("payment_method", { enum: ["bank_transfer", "gateway", "waived"] }),
  paymentReference: text("payment_reference"),
  paidAt: tz("paid_at"),
  voidedReason: text("voided_reason"),
  issuedBy: uuid("issued_by"),
  createdAt: tz("created_at").notNull().default(sql`now()`),
});

export const WALLET_TYPES = ["sale", "fee", "refund", "payout", "payout_reversal", "adjustment"] as const;

export const walletTransactions = pgTable("wallet_transactions", {
  id: uuid("id").primaryKey(),
  storeId: uuid("store_id").notNull(),
  type: text("type", { enum: WALLET_TYPES }).notNull(),
  amount: bigint("amount", { mode: "number" }).notNull(),
  description: text("description").notNull(),
  orderId: uuid("order_id"),
  payoutId: uuid("payout_id"),
  availableAt: tz("available_at").notNull().default(sql`now()`),
  createdBy: uuid("created_by"),
  createdAt: tz("created_at").notNull().default(sql`now()`),
});

export const PAYOUT_STATUSES = ["pending", "approved", "paid", "rejected", "cancelled"] as const;

export const payoutRequests = pgTable("payout_requests", {
  id: uuid("id").primaryKey(),
  storeId: uuid("store_id").notNull(),
  amount: bigint("amount", { mode: "number" }).notNull(),
  bankName: text("bank_name").notNull(),
  accountName: text("account_name").notNull(),
  iban: text("iban").notNull(),
  status: text("status", { enum: PAYOUT_STATUSES }).notNull().default("pending"),
  requestedBy: uuid("requested_by"),
  adminNote: text("admin_note"),
  transferReference: text("transfer_reference"),
  processedBy: uuid("processed_by"),
  processedAt: tz("processed_at"),
  createdAt: tz("created_at").notNull().default(sql`now()`),
});

export const referralRewards = pgTable("referral_rewards", {
  id: uuid("id").primaryKey(),
  referrerId: uuid("referrer_id").notNull(),
  referredUserId: uuid("referred_user_id").notNull(),
  storeId: uuid("store_id"),
  reward: text("reward").notNull(),
  createdAt: tz("created_at").notNull().default(sql`now()`),
});

export const HELP_CATEGORIES = ["start", "products", "orders", "payments", "shipping", "marketing", "account"] as const;

export const helpArticles = pgTable("help_articles", {
  id: uuid("id").primaryKey(),
  slug: text("slug").notNull(),
  category: text("category", { enum: HELP_CATEGORIES }).notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  published: boolean("published").notNull().default(true),
  position: integer("position").notNull().default(0),
  updatedBy: uuid("updated_by"),
  createdAt: tz("created_at").notNull().default(sql`now()`),
  updatedAt: tz("updated_at").notNull().default(sql`now()`),
});

export const TICKET_CATEGORIES = ["store_down", "checkout", "payments", "orders", "billing", "technical", "question"] as const;
export const TICKET_STATUSES = ["open", "waiting_support", "waiting_merchant", "resolved", "closed"] as const;

export const supportTickets = pgTable("support_tickets", {
  id: uuid("id").primaryKey(),
  storeId: uuid("store_id").notNull(),
  number: bigint("number", { mode: "number" }).generatedAlwaysAsIdentity(),
  openedBy: uuid("opened_by"),
  subject: text("subject").notNull(),
  category: text("category", { enum: TICKET_CATEGORIES }).notNull(),
  priority: integer("priority").notNull(),
  status: text("status", { enum: TICKET_STATUSES }).notNull().default("open"),
  assigneeId: uuid("assignee_id"),
  rating: integer("rating"),
  createdAt: tz("created_at").notNull().default(sql`now()`),
  updatedAt: tz("updated_at").notNull().default(sql`now()`),
});

export const ticketMessages = pgTable("ticket_messages", {
  id: uuid("id").primaryKey(),
  storeId: uuid("store_id").notNull(),
  ticketId: uuid("ticket_id").notNull(),
  authorId: uuid("author_id"),
  authorType: text("author_type", { enum: ["merchant", "support"] }).notNull(),
  body: text("body").notNull(),
  internal: boolean("internal").notNull().default(false),
  createdAt: tz("created_at").notNull().default(sql`now()`),
});

export const announcements = pgTable("announcements", {
  id: uuid("id").primaryKey(),
  title: text("title").notNull(),
  body: text("body").notNull().default(""),
  level: text("level", { enum: ["info", "warning"] }).notNull().default("info"),
  startsAt: tz("starts_at").notNull().default(sql`now()`),
  endsAt: tz("ends_at"),
  createdBy: uuid("created_by"),
  createdAt: tz("created_at").notNull().default(sql`now()`),
});
