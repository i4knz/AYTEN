import { eq } from "drizzle-orm";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { createCategory, deleteCategory, listCategories, updateCategory } from "@/server/catalog/categories";
import { deleteProductImage, makePrimaryImage, uploadProductImage, uploadStoreLogo } from "@/server/catalog/images";
import { adjustInventory, listInventory, listMovements } from "@/server/catalog/inventory";
import { getProduct, listProducts, saveProduct, setProductStatus } from "@/server/catalog/products";
import { getStorefrontProduct, listStorefrontCategories, listStorefrontProducts } from "@/server/catalog/storefront";
import { inventoryLevels, products } from "@/server/db/schema";
import { withTenant } from "@/server/db/tenant";
import { AppError } from "@/server/lib/errors";
import { uuidv7 } from "@/server/lib/ids";
import { publishStore, getSetupChecklist, requireStoreAccess } from "@/server/stores/service";
import { storeMembers } from "@/server/db/schema";
import { verifyEmail } from "@/server/auth/service";
import { makeProduct, shirtProduct, simpleProduct } from "../support/catalog";
import { lastTokenFromOutbox, memoryStorage } from "../support/db";
import { makeStore, makeUser } from "../support/factories";

async function setup() {
  const owner = await makeUser();
  const { storeId } = await makeStore(owner.userId);
  return { owner, storeId };
}

async function expectCode(p: Promise<unknown>, code: string) {
  await expect(p).rejects.toSatisfy((e: unknown) => e instanceof AppError && e.code === code);
}

const png = (w = 2000, h = 1000) =>
  sharp({ create: { width: w, height: h, channels: 3, background: "#c0ffee" } }).png().toBuffer();
const asFile = (buf: Buffer, name = "photo.png", type = "image/png") => new File([new Uint8Array(buf)], name, { type });

describe("products", () => {
  it("creates a simple product with one variant, initial stock and a movement", async () => {
    const { owner, storeId } = await setup();
    const { productId } = await makeProduct(owner.userId, storeId);
    const p = await getProduct(owner.userId, storeId, productId);
    expect(p.product).toMatchObject({ name: "عطر العود الملكي", slug: "عطر-العود-الملكي", status: "active" });
    expect(p.variants).toHaveLength(1);
    expect(p.variants[0].variant).toMatchObject({ price: 25000, option1: null });
    expect(p.variants[0].level).toMatchObject({ onHand: 5, reserved: 0, trackInventory: true });
    const moves = await listMovements(owner.userId, storeId, p.variants[0].variant.id);
    expect(moves.map((m) => [m.reason, m.delta, m.onHandAfter])).toEqual([["initial", 5, 5]]);
  });

  it("creates the option matrix and keeps variant ids stable across edits", async () => {
    const { owner, storeId } = await setup();
    const { productId } = await makeProduct(owner.userId, storeId, shirtProduct());
    const before = await getProduct(owner.userId, storeId, productId);
    expect(before.options.map((o) => o.name)).toEqual(["اللون", "المقاس"]);
    expect(before.variants).toHaveLength(4);
    const blackM = before.variants.find((v) => v.variant.option1 === "أسود" && v.variant.option2 === "M")!;

    // Drop "أبيض", add "أحمر"; change black/M stock to 3.
    const input = shirtProduct({
      options: [
        { name: "اللون", values: ["أسود", "أحمر"] },
        { name: "المقاس", values: ["M", "L"] },
      ],
      variants: [
        ["أسود", "M", 3],
        ["أسود", "L", 10],
        ["أحمر", "M", 7],
        ["أحمر", "L", 0],
      ].map(([c, s, q], i) => ({ optionValues: [c, s], price: "120", compareAtPrice: "", cost: "", sku: `NEW-${i}`, trackInventory: true, quantity: q })),
    });
    await saveProduct(owner.userId, storeId, productId, input);
    const after = await getProduct(owner.userId, storeId, productId);
    expect(after.variants).toHaveLength(4);
    const blackMAfter = after.variants.find((v) => v.variant.option1 === "أسود" && v.variant.option2 === "M")!;
    expect(blackMAfter.variant.id).toBe(blackM.variant.id);
    expect(blackMAfter.level?.onHand).toBe(3);
    const moves = await listMovements(owner.userId, storeId, blackM.variant.id);
    expect(moves.map((m) => [m.reason, m.delta])).toEqual([
      ["manual_adjust", -7],
      ["initial", 10],
    ]);
  });

  it("validates prices, option consistency and duplicate SKUs", async () => {
    const { owner, storeId } = await setup();
    const bad = (variants: object[], extra = {}) => makeProduct(owner.userId, storeId, simpleProduct({ variants, ...extra }) as never);
    const v = { optionValues: [], price: "10", compareAtPrice: "", cost: "", sku: "", trackInventory: true, quantity: 1 };
    await expectCode(bad([{ ...v, price: "" }]), "validation");
    await expectCode(bad([{ ...v, price: "abc" }]), "validation");
    await expectCode(bad([{ ...v, compareAtPrice: "5" }]), "validation");
    await expectCode(bad([{ ...v, quantity: -1 }]), "validation");
    await expectCode(bad([{ ...v, optionValues: ["أحمر"] }]), "validation");
    await expectCode(
      makeProduct(owner.userId, storeId, shirtProduct({ variants: shirtProduct().variants.map((x) => ({ ...x, sku: "SAME" })) }) as never),
      "validation",
    );
    // SKU unique across products in the same store, but free across stores.
    await makeProduct(owner.userId, storeId, simpleProduct({ variants: [{ ...v, sku: "ABC-1" }] }) as never);
    await expectCode(makeProduct(owner.userId, storeId, simpleProduct({ name: "آخر", variants: [{ ...v, sku: "ABC-1" }] }) as never), "validation");
    const other = await setup();
    await expect(makeProduct(other.owner.userId, other.storeId, simpleProduct({ variants: [{ ...v, sku: "ABC-1" }] }) as never)).resolves.toBeTruthy();
  });

  it("gives duplicate names unique slugs", async () => {
    const { owner, storeId } = await setup();
    const a = await makeProduct(owner.userId, storeId);
    const b = await makeProduct(owner.userId, storeId);
    const slugs = [(await getProduct(owner.userId, storeId, a.productId)).product.slug, (await getProduct(owner.userId, storeId, b.productId)).product.slug];
    expect(slugs).toEqual(["عطر-العود-الملكي", "عطر-العود-الملكي-2"]);
  });

  it("lists with price range, stock totals, search and status filter", async () => {
    const { owner, storeId } = await setup();
    await makeProduct(owner.userId, storeId, shirtProduct());
    const draft = await makeProduct(owner.userId, storeId, simpleProduct({ name: "مسودة", status: "draft" }));
    const list = await listProducts(owner.userId, storeId);
    expect(list.total).toBe(2);
    const shirt = list.rows.find((r) => r.name === "قميص قطني")!;
    expect(shirt).toMatchObject({ minPrice: 12000, maxPrice: 12000, variantCount: 4, available: 40 });
    expect((await listProducts(owner.userId, storeId, { q: "قميص" })).rows).toHaveLength(1);
    expect((await listProducts(owner.userId, storeId, { q: "%" })).rows).toHaveLength(0);
    expect((await listProducts(owner.userId, storeId, { status: "draft" })).rows.map((r) => r.id)).toEqual([draft.productId]);
    await setProductStatus(owner.userId, storeId, draft.productId, "archived");
    expect((await listProducts(owner.userId, storeId)).total).toBe(1);
  });

  it("enforces permissions: marketing cannot edit products, orders staff cannot create them", async () => {
    const { owner, storeId } = await setup();
    const { productId } = await makeProduct(owner.userId, storeId);
    for (const role of ["marketing", "orders", "support", "viewer"] as const) {
      const staff = await makeUser();
      await withTenant({ storeId }, (tx) => tx.insert(storeMembers).values({ id: uuidv7(), storeId, userId: staff.userId, role }));
      await expectCode(saveProduct(staff.userId, storeId, productId, simpleProduct()), "forbidden");
      await expect(getProduct(staff.userId, storeId, productId)).resolves.toBeTruthy();
    }
  });

  it("is invisible and immutable across stores", async () => {
    const a = await setup();
    const b = await setup();
    const { productId } = await makeProduct(a.owner.userId, a.storeId);
    await expectCode(getProduct(b.owner.userId, a.storeId, productId), "not_found");
    await expectCode(getProduct(b.owner.userId, b.storeId, productId), "not_found");
    await expectCode(saveProduct(b.owner.userId, b.storeId, productId, simpleProduct({ name: "hijack" })), "not_found");
    expect((await listProducts(b.owner.userId, b.storeId)).total).toBe(0);
    // Even with a forged tenant context, the product row of store A cannot be touched from store B.
    const touched = await withTenant({ storeId: b.storeId }, (tx) =>
      tx.update(products).set({ name: "x" }).where(eq(products.id, productId)).returning(),
    );
    expect(touched).toHaveLength(0);
  });
});

describe("categories", () => {
  it("supports two levels and links products", async () => {
    const { owner, storeId } = await setup();
    const { categoryId: women } = await createCategory(owner.userId, storeId, { name: "نسائي" });
    const { categoryId: dresses } = await createCategory(owner.userId, storeId, { name: "فساتين", parentId: women });
    await expectCode(createCategory(owner.userId, storeId, { name: "طويلة", parentId: dresses }), "validation");
    await expectCode(updateCategory(owner.userId, storeId, women, { name: "نسائي", parentId: women }), "validation");
    await expectCode(updateCategory(owner.userId, storeId, women, { name: "نسائي", parentId: (await createCategory(owner.userId, storeId, { name: "رجالي" })).categoryId }), "validation");

    await makeProduct(owner.userId, storeId, simpleProduct({ categoryIds: [dresses] }));
    const cats = await listCategories(owner.userId, storeId);
    expect(cats.find((c) => c.id === dresses)?.productCount).toBe(1);

    const storefront = await listStorefrontProducts(storeId, { categorySlug: "نسائي" });
    expect(storefront?.products).toHaveLength(1);
    expect((await listStorefrontCategories(storeId)).map((c) => c.name).sort()).toEqual(["فساتين", "نسائي"]);

    await deleteCategory(owner.userId, storeId, women);
    expect((await listCategories(owner.userId, storeId)).find((c) => c.id === dresses)?.parentId).toBeNull();
  });

  it("rejects categories from another store", async () => {
    const a = await setup();
    const b = await setup();
    const { categoryId } = await createCategory(b.owner.userId, b.storeId, { name: "خارجي" });
    await expectCode(makeProduct(a.owner.userId, a.storeId, simpleProduct({ categoryIds: [categoryId] })), "validation");
  });
});

describe("inventory", () => {
  it("adjusts stock with a ledger and refuses negative or below-reserved stock", async () => {
    const { owner, storeId } = await setup();
    const { productId } = await makeProduct(owner.userId, storeId);
    const variantId = (await getProduct(owner.userId, storeId, productId)).variants[0].variant.id;

    expect(await adjustInventory(owner.userId, storeId, variantId, { mode: "add", quantity: 3, note: "شحنة جديدة" })).toEqual({ onHand: 8 });
    expect(await adjustInventory(owner.userId, storeId, variantId, { mode: "add", quantity: -2 })).toEqual({ onHand: 6 });
    await expectCode(adjustInventory(owner.userId, storeId, variantId, { mode: "add", quantity: -10 }), "validation");

    await withTenant({ storeId }, (tx) => tx.update(inventoryLevels).set({ reserved: 4 }).where(eq(inventoryLevels.variantId, variantId)));
    await expectCode(adjustInventory(owner.userId, storeId, variantId, { mode: "set", quantity: 3 }), "validation");

    const moves = await listMovements(owner.userId, storeId, variantId);
    expect(moves.map((m) => m.delta)).toEqual([-2, 3, 5]);
    const low = await listInventory(owner.userId, storeId, { lowOnly: true });
    expect(low.map((r) => r.available)).toEqual([2]);
  });

  it("concurrent adjustments never lose an update", async () => {
    const { owner, storeId } = await setup();
    const { productId } = await makeProduct(owner.userId, storeId);
    const variantId = (await getProduct(owner.userId, storeId, productId)).variants[0].variant.id;
    await Promise.all(Array.from({ length: 10 }, () => adjustInventory(owner.userId, storeId, variantId, { mode: "add", quantity: 1 })));
    const [row] = await listInventory(owner.userId, storeId);
    expect(row.onHand).toBe(15);
  });

  it("the movement ledger is append-only for the app", async () => {
    const { owner, storeId } = await setup();
    await makeProduct(owner.userId, storeId);
    await expect(
      withTenant({ storeId }, (tx) => tx.execute(`update inventory_movements set delta = 999` as never)),
    ).rejects.toBeTruthy();
  });
});

describe("images", () => {
  it("re-encodes uploads to WebP, resizes, and orders them", async () => {
    const { owner, storeId } = await setup();
    const { productId } = await makeProduct(owner.userId, storeId);
    const first = await uploadProductImage(owner.userId, storeId, productId, asFile(await png()));
    const second = await uploadProductImage(owner.userId, storeId, productId, asFile(await png(400, 400)));
    const stored = memoryStorage.files.get(first.key)!;
    const meta = await sharp(stored).metadata();
    expect(meta).toMatchObject({ format: "webp", width: 1600, height: 800 });
    expect(first.key).toMatch(new RegExp(`^stores/${storeId}/products/[0-9a-f-]{36}\\.webp$`));

    await makePrimaryImage(owner.userId, storeId, second.imageId);
    const p = await getProduct(owner.userId, storeId, productId);
    expect(p.images.map((i) => i.id)).toEqual([second.imageId, first.imageId]);

    await deleteProductImage(owner.userId, storeId, first.imageId);
    expect(memoryStorage.files.has(first.key)).toBe(false);
  });

  it("rejects non-images, including files that lie about their type", async () => {
    const { owner, storeId } = await setup();
    const { productId } = await makeProduct(owner.userId, storeId);
    const fake = asFile(Buffer.from("<script>alert(1)</script>"), "x.png", "image/png");
    await expectCode(uploadProductImage(owner.userId, storeId, productId, fake), "validation");
    const svg = asFile(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script></svg>'), "x.svg", "image/svg+xml");
    await expectCode(uploadProductImage(owner.userId, storeId, productId, svg), "validation");
    expect(memoryStorage.files.size).toBe(0);
  });

  it("cannot attach images to another store's product", async () => {
    const a = await setup();
    const b = await setup();
    const { productId } = await makeProduct(a.owner.userId, a.storeId);
    await expectCode(uploadProductImage(b.owner.userId, b.storeId, productId, asFile(await png(10, 10))), "not_found");
    await expectCode(uploadProductImage(b.owner.userId, a.storeId, productId, asFile(await png(10, 10))), "not_found");
    expect(memoryStorage.files.size).toBe(0);
  });

  it("uploads and replaces a store logo", async () => {
    const { owner, storeId } = await setup();
    const { key } = await uploadStoreLogo(owner.userId, storeId, asFile(await png(1000, 1000)));
    expect((await sharp(memoryStorage.files.get(key)!).metadata()).width).toBe(512);
    const { key: key2 } = await uploadStoreLogo(owner.userId, storeId, asFile(await png(100, 100)));
    expect(memoryStorage.files.has(key)).toBe(false);
    expect(memoryStorage.files.has(key2)).toBe(true);
  });
});

describe("storefront catalog and publishing", () => {
  it("shows only active products with stock state and hides drafts", async () => {
    const { owner, storeId } = await setup();
    await makeProduct(owner.userId, storeId, shirtProduct());
    await makeProduct(owner.userId, storeId, simpleProduct({ name: "مسودة", status: "draft" }));
    await makeProduct(owner.userId, storeId, simpleProduct({ name: "نفد", variants: [{ ...simpleProduct().variants[0], quantity: 0 }] }));
    const list = await listStorefrontProducts(storeId);
    expect(list?.products.map((p) => [p.name, p.inStock]).sort()).toEqual([
      ["قميص قطني", true],
      ["نفد", false],
    ]);
    expect(await getStorefrontProduct(storeId, "مسودة")).toBeNull();
    const shirt = await getStorefrontProduct(storeId, "قميص-قطني");
    expect(shirt?.variants).toHaveLength(4);
    expect(shirt?.variants[0]).toMatchObject({ price: 12000, compareAtPrice: 15000, inStock: true, lowStock: null });
  });

  it("requires a verified email and an active product to publish", async () => {
    const { owner, storeId } = await setup();
    await expectCode(publishStore(owner.userId, storeId), "precondition");
    await verifyEmail(lastTokenFromOutbox("email_verify"));
    await expectCode(publishStore(owner.userId, storeId), "precondition");
    await makeProduct(owner.userId, storeId);
    await publishStore(owner.userId, storeId);
    const access = await requireStoreAccess(owner.userId, storeId);
    expect(access.store.status).toBe("published");
    const checklist = await getSetupChecklist(access);
    expect(checklist.find((c) => c.key === "publish")?.done).toBe(true);
  });
});
