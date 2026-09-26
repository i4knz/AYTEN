import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { listStorefrontProducts } from "@/server/catalog/storefront";
import { ProductGridView } from "@/themes/sections";
import { decodeParam, loadStorefront, loadTheme } from "../../data";

async function load(params: PageProps<"/s/[slug]/categories/[category]">["params"]) {
  const { slug, category } = await params;
  const store = await loadStorefront(slug);
  if (!store?.isOpen) return null;
  const result = await listStorefrontProducts(store.id, { categorySlug: decodeParam(category) });
  return result && { store, ...result };
}

export async function generateMetadata({ params }: PageProps<"/s/[slug]/categories/[category]">): Promise<Metadata> {
  const data = await load(params);
  return data ? { title: data.categoryName } : {};
}

export default async function CategoryPage({ params }: PageProps<"/s/[slug]/categories/[category]">) {
  const data = await load(params);
  if (!data) notFound();
  const theme = await loadTheme(data.store.id);
  return (
    <>
      <h1 className="mb-5 text-2xl font-bold">{data.categoryName}</h1>
      <ProductGridView products={data.products} theme={theme} />
    </>
  );
}
