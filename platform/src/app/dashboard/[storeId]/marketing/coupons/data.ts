import "server-only";
import { listCategories } from "@/server/catalog/categories";
import { listProducts } from "@/server/catalog/products";

export async function couponPickers(userId: string, storeId: string) {
  const [products, categories] = await Promise.all([listProducts(userId, storeId, { status: "active" }), listCategories(userId, storeId)]);
  return { products: products.rows.map((p) => ({ id: p.id, name: p.name })), categories: categories.map((c) => ({ id: c.id, name: c.name })) };
}
