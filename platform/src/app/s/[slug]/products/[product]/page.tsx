import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getStorefrontProduct } from "@/server/catalog/storefront";
import { storefrontUrl } from "@/server/urls";
import { decodeParam, loadStorefront } from "../../data";
import { ProductView } from "./product-view";

async function load(params: PageProps<"/s/[slug]/products/[product]">["params"]) {
  const { slug, product } = await params;
  const store = await loadStorefront(slug);
  if (!store?.isOpen) return null;
  const data = await getStorefrontProduct(store.id, decodeParam(product));
  return data && { store, ...data };
}

export async function generateMetadata({ params }: PageProps<"/s/[slug]/products/[product]">): Promise<Metadata> {
  const data = await load(params);
  if (!data) return {};
  const description = data.product.seoDescription || data.product.description.slice(0, 160);
  return {
    title: data.product.seoTitle || data.product.name,
    description,
    alternates: { canonical: `${storefrontUrl(data.store.slug)}/products/${encodeURIComponent(data.product.slug)}` },
    openGraph: { title: data.product.name, description, images: data.images.slice(0, 1).map((i) => ({ url: i.url, width: i.width, height: i.height })) },
  };
}

export default async function ProductPage({ params }: PageProps<"/s/[slug]/products/[product]">) {
  const data = await load(params);
  if (!data) notFound();
  const { store, product, options, variants, images, categories } = data;
  const url = `${storefrontUrl(store.slug)}/products/${encodeURIComponent(product.slug)}`;

  // schema.org Product for rich results. JSON is escaped so "<" cannot close the script tag.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.description.slice(0, 5000),
    image: images.map((i) => i.url),
    url,
    offers: variants.map((v) => ({
      "@type": "Offer",
      price: (v.price / 100).toFixed(2),
      priceCurrency: "SAR",
      availability: v.inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      url,
    })),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      {categories.length > 0 && (
        <nav aria-label="مسار التنقل" className="mb-4 text-sm text-ink-soft">
          <Link href="/">الرئيسية</Link> ›{" "}
          <Link href={`/categories/${encodeURIComponent(categories[0].slug)}`}>{categories[0].name}</Link>
        </nav>
      )}
      <ProductView
        name={product.name}
        description={product.description}
        options={options}
        variants={variants}
        images={images}
        whatsapp={store.whatsapp}
        productUrl={url}
      />
    </>
  );
}
