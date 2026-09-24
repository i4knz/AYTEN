import { saveProduct } from "@/server/catalog/products";

export const simpleProduct = (overrides: Record<string, unknown> = {}) => ({
  name: "عطر العود الملكي",
  description: "عطر شرقي فاخر",
  status: "active",
  categoryIds: [],
  seoTitle: "",
  seoDescription: "",
  options: [],
  variants: [{ optionValues: [], price: "250", compareAtPrice: "", cost: "", sku: "", trackInventory: true, quantity: 5 }],
  ...overrides,
});

export const shirtProduct = (overrides: Record<string, unknown> = {}) => ({
  ...simpleProduct({ name: "قميص قطني" }),
  options: [
    { name: "اللون", values: ["أبيض", "أسود"] },
    { name: "المقاس", values: ["M", "L"] },
  ],
  variants: [
    ["أبيض", "M"],
    ["أبيض", "L"],
    ["أسود", "M"],
    ["أسود", "L"],
  ].map(([c, s], i) => ({
    optionValues: [c, s],
    price: "120",
    compareAtPrice: "150",
    cost: "",
    sku: `SH-${i}`,
    trackInventory: true,
    quantity: 10,
  })),
  ...overrides,
});

export async function makeProduct(userId: string, storeId: string, input: unknown = simpleProduct()) {
  return saveProduct(userId, storeId, null, input);
}
