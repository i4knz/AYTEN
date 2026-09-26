import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Tx } from "../db/client";
import {
  cartItems,
  carts,
  inventoryLevels,
  productCategories,
  productImages,
  products,
  productVariants,
  storeSettings,
} from "../db/schema";
import { withTenant } from "../db/tenant";
import { AppError } from "../lib/errors";
import { isUuid, uuidv7 } from "../lib/ids";
import { generateToken, hashToken } from "../lib/tokens";
import { getStorage } from "../storage";
import { COUPON_MESSAGES, loadCouponForCheckout } from "./coupons";
import { priceOrder, type PricingCoupon, type PricingLine, type PricingResult } from "./pricing";

export const MAX_LINE_QUANTITY = 99;
export const MAX_CART_LINES = 50;

export interface CartLineView {
  variantId: string;
  productId: string;
  productName: string;
  productSlug: string;
  variantTitle: string;
  sku: string | null;
  imageKey: string | null;
  imageUrl: string | null;
  unitPrice: number;
  compareAtPrice: number | null;
  quantity: number;
  /** null = untracked (unlimited). */
  available: number | null;
  categoryIds: string[];
  taxable: boolean;
  /** Why the line cannot be bought as is. */
  problem: "unavailable" | "out_of_stock" | "insufficient_stock" | null;
}

export interface CartView {
  cartId: string | null;
  /** Inputs to re-run the pricing engine client-side for a live preview (the server recomputes at checkout). */
  pricingInput: { lines: PricingLine[]; coupon: PricingCoupon | null; tax: { enabled: boolean; rateBps: number; pricesIncludeTax: boolean } };
  lines: CartLineView[];
  itemCount: number;
  couponCode: string | null;
  couponMessage: string | null;
  pricing: PricingResult;
  canCheckout: boolean;
}

async function findCart(tx: Tx, token: string | null | undefined, opts: { lock?: boolean } = {}) {
  if (!token || token.length > 100) return null;
  let q = tx.select().from(carts).where(and(eq(carts.tokenHash, hashToken(token)), isNull(carts.convertedOrderId))).limit(1).$dynamic();
  if (opts.lock) q = q.for("update");
  const [cart] = await q;
  return cart ?? null;
}

/** Loads cart lines with live catalog data (price, stock, status). */
export async function loadCartLines(tx: Tx, cartId: string): Promise<CartLineView[]> {
  const items = await tx
    .select({
      variantId: cartItems.variantId,
      quantity: cartItems.quantity,
      productId: products.id,
      productName: products.name,
      productSlug: products.slug,
      productStatus: products.status,
      taxable: products.taxable,
      option1: productVariants.option1,
      option2: productVariants.option2,
      option3: productVariants.option3,
      sku: productVariants.sku,
      price: productVariants.price,
      compareAtPrice: productVariants.compareAtPrice,
      archivedAt: productVariants.archivedAt,
      trackInventory: inventoryLevels.trackInventory,
      onHand: inventoryLevels.onHand,
      reserved: inventoryLevels.reserved,
    })
    .from(cartItems)
    .innerJoin(productVariants, eq(productVariants.id, cartItems.variantId))
    .innerJoin(products, eq(products.id, productVariants.productId))
    .leftJoin(inventoryLevels, eq(inventoryLevels.variantId, productVariants.id))
    .where(eq(cartItems.cartId, cartId))
    .orderBy(cartItems.createdAt);
  if (!items.length) return [];

  const productIds = [...new Set(items.map((i) => i.productId))];
  const [cats, images] = await Promise.all([
    tx.select().from(productCategories).where(inArray(productCategories.productId, productIds)),
    tx
      .selectDistinctOn([productImages.productId], { productId: productImages.productId, key: productImages.storageKey })
      .from(productImages)
      .where(inArray(productImages.productId, productIds))
      .orderBy(productImages.productId, productImages.position, productImages.createdAt),
  ]);

  return items.map((i) => {
    const available = i.trackInventory === false ? null : Math.max(0, (i.onHand ?? 0) - (i.reserved ?? 0));
    const unavailable = i.productStatus !== "active" || i.archivedAt !== null;
    const imageKey = images.find((im) => im.productId === i.productId)?.key ?? null;
    return {
      variantId: i.variantId,
      productId: i.productId,
      productName: i.productName,
      productSlug: i.productSlug,
      variantTitle: [i.option1, i.option2, i.option3].filter(Boolean).join(" / "),
      sku: i.sku,
      imageKey,
      imageUrl: imageKey ? getStorage().url(imageKey) : null,
      unitPrice: i.price,
      compareAtPrice: i.compareAtPrice,
      quantity: i.quantity,
      available,
      categoryIds: cats.filter((c) => c.productId === i.productId).map((c) => c.categoryId),
      taxable: i.taxable,
      problem: unavailable ? "unavailable" : available === 0 ? "out_of_stock" : available !== null && available < i.quantity ? "insufficient_stock" : null,
    };
  });
}

export const toPricingLines = (lines: CartLineView[]): PricingLine[] =>
  lines
    .filter((l) => !l.problem)
    .map((l) => ({ key: l.variantId, productId: l.productId, categoryIds: l.categoryIds, unitPrice: l.unitPrice, quantity: l.quantity, taxable: l.taxable }));

export async function getTaxSettings(tx: Tx, storeId: string) {
  const [s] = await tx
    .select({ enabled: storeSettings.taxEnabled, rateBps: storeSettings.taxRateBps, pricesIncludeTax: storeSettings.pricesIncludeTax })
    .from(storeSettings)
    .where(eq(storeSettings.storeId, storeId))
    .limit(1);
  return s ?? { enabled: false, rateBps: 0, pricesIncludeTax: true };
}

export async function getCart(storeId: string, token: string | null | undefined): Promise<CartView> {
  return withTenant({ storeId }, async (tx) => {
    const cart = await findCart(tx, token);
    const tax = await getTaxSettings(tx, storeId);
    if (!cart) {
      return {
        cartId: null,
        pricingInput: { lines: [], coupon: null, tax },
        lines: [],
        itemCount: 0,
        couponCode: null,
        couponMessage: null,
        pricing: priceOrder({ lines: [], tax }),
        canCheckout: false,
      };
    }
    const lines = await loadCartLines(tx, cart.id);
    let couponMessage: string | null = null;
    let coupon = null;
    if (cart.couponCode) {
      const loaded = await loadCouponForCheckout(tx, cart.couponCode);
      if (loaded.coupon) coupon = loaded.coupon;
      else couponMessage = COUPON_MESSAGES[loaded.rejection];
    }
    const pricingLines = toPricingLines(lines);
    const pricing = priceOrder({ lines: pricingLines, coupon, tax });
    if (pricing.coupon && !pricing.coupon.applied && pricing.coupon.reason) {
      couponMessage = COUPON_MESSAGES[pricing.coupon.reason as keyof typeof COUPON_MESSAGES];
    }
    return {
      cartId: cart.id,
      pricingInput: { lines: pricingLines, coupon: pricing.coupon?.applied ? coupon : null, tax },
      lines,
      itemCount: lines.reduce((a, l) => a + l.quantity, 0),
      couponCode: cart.couponCode,
      couponMessage,
      pricing,
      canCheckout: lines.length > 0 && lines.every((l) => !l.problem),
    };
  });
}

/** Adds a variant to the cart, creating the cart when needed. Returns a new token if one was created. */
export async function addToCart(storeId: string, token: string | null | undefined, variantId: string, quantity = 1) {
  if (!isUuid(variantId)) throw new AppError("validation", "المنتج غير متوفر.");
  const qty = Math.floor(quantity);
  if (!(qty >= 1 && qty <= MAX_LINE_QUANTITY)) throw new AppError("validation", "كمية غير صالحة.");

  return withTenant({ storeId }, async (tx) => {
    const [variant] = await tx
      .select({
        id: productVariants.id,
        archivedAt: productVariants.archivedAt,
        status: products.status,
        trackInventory: inventoryLevels.trackInventory,
        available: sql<number>`${inventoryLevels.onHand} - ${inventoryLevels.reserved}`,
      })
      .from(productVariants)
      .innerJoin(products, eq(products.id, productVariants.productId))
      .leftJoin(inventoryLevels, eq(inventoryLevels.variantId, productVariants.id))
      .where(eq(productVariants.id, variantId))
      .limit(1);
    if (!variant || variant.archivedAt || variant.status !== "active") throw new AppError("unavailable", "هذا المنتج غير متوفر حالياً.");

    let cart = await findCart(tx, token, { lock: true });
    let newToken: string | null = null;
    if (!cart) {
      newToken = generateToken();
      [cart] = await tx.insert(carts).values({ id: uuidv7(), storeId, tokenHash: hashToken(newToken) }).returning();
    }
    const [existing] = await tx
      .select()
      .from(cartItems)
      .where(and(eq(cartItems.cartId, cart.id), eq(cartItems.variantId, variantId)))
      .limit(1);
    const target = Math.min(MAX_LINE_QUANTITY, (existing?.quantity ?? 0) + qty);
    if (variant.trackInventory !== false && Number(variant.available) < target) {
      const left = Math.max(0, Number(variant.available));
      throw new AppError("out_of_stock", left === 0 ? "نفدت الكمية من هذا المنتج." : `المتوفر ${left} فقط.`);
    }
    if (existing) {
      await tx.update(cartItems).set({ quantity: target }).where(eq(cartItems.id, existing.id));
    } else {
      const [{ lines }] = await tx.select({ lines: sql<number>`count(*)::int` }).from(cartItems).where(eq(cartItems.cartId, cart.id));
      if (lines >= MAX_CART_LINES) throw new AppError("validation", "السلة ممتلئة.");
      await tx.insert(cartItems).values({ id: uuidv7(), storeId, cartId: cart.id, variantId, quantity: target });
    }
    await tx.update(carts).set({ updatedAt: sql`now()` }).where(eq(carts.id, cart.id));
    return { token: newToken };
  });
}

export async function updateCartQuantity(storeId: string, token: string | null | undefined, variantId: string, quantity: number) {
  if (!isUuid(variantId)) return;
  const qty = Math.max(0, Math.min(MAX_LINE_QUANTITY, Math.floor(quantity)));
  await withTenant({ storeId }, async (tx) => {
    const cart = await findCart(tx, token, { lock: true });
    if (!cart) return;
    if (qty === 0) {
      await tx.delete(cartItems).where(and(eq(cartItems.cartId, cart.id), eq(cartItems.variantId, variantId)));
    } else {
      await tx.update(cartItems).set({ quantity: qty }).where(and(eq(cartItems.cartId, cart.id), eq(cartItems.variantId, variantId)));
    }
  });
}

export async function setCartCoupon(storeId: string, token: string | null | undefined, code: string | null) {
  return withTenant({ storeId }, async (tx) => {
    const cart = await findCart(tx, token, { lock: true });
    if (!cart) throw new AppError("validation", "سلتك فارغة.");
    if (code === null) {
      await tx.update(carts).set({ couponCode: null }).where(eq(carts.id, cart.id));
      return;
    }
    const normalized = code.trim().toUpperCase();
    if (!/^[A-Z0-9_-]{3,30}$/.test(normalized)) throw new AppError("validation", COUPON_MESSAGES.not_found);
    const loaded = await loadCouponForCheckout(tx, normalized);
    if (!loaded.coupon) throw new AppError("validation", COUPON_MESSAGES[loaded.rejection]);
    await tx.update(carts).set({ couponCode: normalized }).where(eq(carts.id, cart.id));
  });
}

/** Records contact details once the shopper reaches checkout; used for abandoned-cart follow-up. */
export async function recordCheckoutContact(storeId: string, token: string | null | undefined, contact: { name?: string; phone?: string; email?: string }) {
  await withTenant({ storeId }, async (tx) => {
    const cart = await findCart(tx, token);
    if (!cart) return;
    await tx
      .update(carts)
      .set({
        contactName: contact.name?.slice(0, 100) || cart.contactName,
        contactPhone: contact.phone?.slice(0, 20) || cart.contactPhone,
        contactEmail: contact.email?.slice(0, 254) || cart.contactEmail,
        checkoutStartedAt: cart.checkoutStartedAt ?? sql`now()`,
      })
      .where(eq(carts.id, cart.id));
  });
}

export { findCart };
