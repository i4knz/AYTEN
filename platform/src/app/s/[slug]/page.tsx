import { listStorefrontProducts } from "@/server/catalog/storefront";
import { loadStorefront } from "./data";
import { ProductGrid } from "./product-grid";

export default async function StorefrontHome({ params }: PageProps<"/s/[slug]">) {
  const store = await loadStorefront((await params).slug);
  if (!store?.isOpen) return null; // The layout renders the closed-store page.
  const result = await listStorefrontProducts(store.id);
  return (
    <>
      <h1 className="sr-only">{store.name}</h1>
      <ProductGrid products={result?.products ?? []} />
    </>
  );
}
