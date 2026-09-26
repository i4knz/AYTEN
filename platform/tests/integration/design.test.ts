import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { verifyEmail } from "@/server/auth/service";
import { getProduct } from "@/server/catalog/products";
import { addToCart } from "@/server/commerce/cart";
import { placeOrder } from "@/server/commerce/checkout";
import { markOrderDelivered, shipOrder } from "@/server/commerce/orders";
import { saveShippingMethod } from "@/server/commerce/shipping";
import { createPageFromTemplate, getPublicPage, listFooterPages, savePage } from "@/server/design/pages";
import { getProductReviews, listReviews, moderateReview, submitReview } from "@/server/design/reviews";
import { getStoreTracking, saveTracking, setFeature } from "@/server/design/settings";
import { getPublishedTheme, getStorefrontData, getThemeState, publishTheme, saveThemeDraft, uploadThemeImage } from "@/server/design/theme";
import { AppError } from "@/server/lib/errors";
import { publishStore, requireStoreAccess } from "@/server/stores/service";
import { defaultSection, PRESETS } from "@/themes/config";
import { makeProduct, simpleProduct } from "../support/catalog";
import { lastTokenFromOutbox } from "../support/db";
import { makeStore, makeUser } from "../support/factories";

async function expectCode(p: Promise<unknown>, code: string) {
  await expect(p).rejects.toSatisfy((e: unknown) => e instanceof AppError && e.code === code);
}

async function setup() {
  const owner = await makeUser();
  await verifyEmail(lastTokenFromOutbox("email_verify"));
  const { storeId } = await makeStore(owner.userId);
  return { owner, storeId };
}

describe("theme", () => {
  it("drafts don't affect the live store until published", async () => {
    const { owner, storeId } = await setup();
    const access = await requireStoreAccess(owner.userId, storeId);
    const luxe = PRESETS.find((p) => p.key === "luxe")!.build();
    await saveThemeDraft(owner.userId, storeId, luxe);
    expect((await getThemeState(access)).draft.preset).toBe("luxe");
    expect((await getPublishedTheme(storeId)).preset).toBe("classic");
    await publishTheme(owner.userId, storeId, luxe);
    expect((await getPublishedTheme(storeId)).preset).toBe("luxe");
    expect((await getThemeState(access)).hasDraft).toBe(false);
  });

  it("only accepts images uploaded to the same store, and rejects non-images", async () => {
    const a = await setup();
    const b = await setup();
    const png = await sharp({ create: { width: 800, height: 400, channels: 3, background: "#abcdef" } }).png().toBuffer();
    const { key } = await uploadThemeImage(a.owner.userId, a.storeId, new File([new Uint8Array(png)], "h.png", { type: "image/png" }));
    const hero = defaultSection("hero");
    const theme = { ...PRESETS[0].build(), sections: [{ ...hero, settings: { ...hero.settings, image: key } }] };
    await expect(saveThemeDraft(a.owner.userId, a.storeId, theme)).resolves.toBeUndefined();
    await expectCode(saveThemeDraft(b.owner.userId, b.storeId, theme), "validation");
    await expectCode(uploadThemeImage(a.owner.userId, a.storeId, new File(["<svg/>"], "x.svg")), "validation");
  });

  it("requires the design permission", async () => {
    const { storeId } = await setup();
    const other = await makeUser();
    await expectCode(publishTheme(other.userId, storeId, PRESETS[0].build()), "not_found");
  });
});

describe("pages", () => {
  it("templates start as drafts; only published pages are public and listed in the footer", async () => {
    const { owner, storeId } = await setup();
    const { pageId } = await createPageFromTemplate(owner.userId, storeId, "returns");
    expect(await getPublicPage(storeId, "returns")).toBeNull();
    await savePage(owner.userId, storeId, pageId, { title: "الاسترجاع", slug: "returns", body: "## خلال 7 أيام", published: true, showInFooter: true });
    expect((await getPublicPage(storeId, "returns"))?.title).toBe("الاسترجاع");
    expect((await listFooterPages(storeId)).map((p) => p.slug)).toEqual(["returns"]);
    await expectCode(savePage(owner.userId, storeId, null, { title: "مكرر", slug: "returns" }), "validation");
    const other = await setup();
    expect(await getPublicPage(other.storeId, "returns")).toBeNull();
  });
});

describe("reviews", () => {
  async function deliveredOrder() {
    const s = await setup();
    const { productId } = await makeProduct(s.owner.userId, s.storeId, simpleProduct({ variants: [{ ...simpleProduct().variants[0], quantity: 10 }] }));
    const variantId = (await getProduct(s.owner.userId, s.storeId, productId)).variants[0].variant.id;
    const { methodId } = await saveShippingMethod(s.owner.userId, s.storeId, null, { name: "توصيل", type: "flat", price: "10" });
    await publishStore(s.owner.userId, s.storeId);
    const { token } = await addToCart(s.storeId, null, variantId);
    const order = await placeOrder(s.storeId, token, {
      name: "ريم العتيبي",
      phone: "0551234567",
      city: "الرياض",
      shippingMethodId: methodId,
      paymentMethod: "cod",
      idempotencyKey: `rev-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    });
    return { ...s, productId, order };
  }

  it("only verified buyers of delivered orders can review, once per product; published after approval", async () => {
    const { owner, storeId, productId, order } = await deliveredOrder();
    await expectCode(submitReview(storeId, order.number, order.accessKey, { productId, rating: 5 }), "not_eligible");
    await shipOrder(owner.userId, storeId, order.orderId, {});
    await markOrderDelivered(owner.userId, storeId, order.orderId);
    await expectCode(submitReview(storeId, order.number, "x".repeat(24), { productId, rating: 5 }), "not_found");
    await submitReview(storeId, order.number, order.accessKey, { productId, rating: 5, body: "رائع" });
    await expectCode(submitReview(storeId, order.number, order.accessKey, { productId, rating: 4 }), "duplicate");

    expect((await getProductReviews(storeId, productId)).count).toBe(0);
    const { rows, counts } = await listReviews(owner.userId, storeId);
    expect(counts.pending).toBe(1);
    expect(rows[0].review.authorName).toBe("ريم");
    await moderateReview(owner.userId, storeId, rows[0].review.id, { status: "approved", reply: "شكراً لك" });
    expect(await getProductReviews(storeId, productId)).toMatchObject({ count: 1, average: 5, rows: [{ reply: "شكراً لك" }] });
    expect((await getStorefrontData(storeId, { name: "x", whatsapp: null })).reviews).toHaveLength(1);
  });
});

describe("tracking and features", () => {
  it("accepts only well-formed IDs", async () => {
    const { owner, storeId } = await setup();
    await expectCode(saveTracking(owner.userId, storeId, { ga4: "<script>alert(1)</script>" }), "validation");
    await expectCode(saveTracking(owner.userId, storeId, { metaPixel: "abc" }), "validation");
    await saveTracking(owner.userId, storeId, { ga4: "G-ABC123XYZ", metaPixel: "123456789012345", tiktokPixel: "" });
    expect((await getStoreTracking(storeId)).tracking).toEqual({ ga4: "G-ABC123XYZ", metaPixel: "123456789012345" });
  });

  it("toggles features", async () => {
    const { owner, storeId } = await setup();
    await setFeature(owner.userId, storeId, "reviews", false);
    expect((await getStoreTracking(storeId)).features).toMatchObject({ reviews: false, whatsappButton: true });
    await expectCode(setFeature(owner.userId, storeId, "hack" as never, true), "validation");
  });
});
