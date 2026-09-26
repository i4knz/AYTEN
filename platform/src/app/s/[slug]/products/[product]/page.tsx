import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getStorefrontProduct } from "@/server/catalog/storefront";
import { storefrontUrl } from "@/server/urls";
import { getProductReviews } from "@/server/design/reviews";
import { decodeParam, loadStorefront, loadStoreSettings, loadTheme } from "../../data";
import { Star } from "lucide-react";
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
  const [settings, theme] = await Promise.all([loadStoreSettings(store.id), loadTheme(store.id)]);
  const reviews = settings.features.reviews ? await getProductReviews(store.id, product.id) : null;
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
    ...(reviews && reviews.count > 0 && {
      aggregateRating: { "@type": "AggregateRating", ratingValue: reviews.average!.toFixed(1), reviewCount: reviews.count },
    }),
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
        slug={store.slug}
        name={product.name}
        description={product.description}
        options={options}
        variants={variants}
        images={images}
        whatsapp={store.whatsapp}
        productUrl={url}
        showStockHints={settings.features.stockHints}
        showShare={settings.features.shareButtons}
        aspect={theme.productCard.aspect}
        rating={reviews && reviews.count ? { average: reviews.average!, count: reviews.count } : null}
      />
      {reviews && reviews.count > 0 && (
        <section id="reviews" className="mt-12 flex flex-col gap-4">
          <h2 className="text-xl font-bold">
            تقييمات العملاء ({reviews.count}) — {reviews.average!.toFixed(1)} من 5
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {reviews.rows.map((r, i) => (
              <li key={i} className="flex flex-col gap-2 rounded-(--radius) bg-muted p-4">
                <span className="flex gap-0.5 text-amber-500" aria-label={`${r.rating} من 5`}>
                  {Array.from({ length: 5 }, (_, j) => (
                    <Star key={j} className={`size-4 ${j < r.rating ? "fill-current" : "opacity-30"}`} aria-hidden />
                  ))}
                </span>
                {r.body && <p className="text-sm leading-7">{r.body}</p>}
                <p className="text-xs text-ink-soft">{r.authorName} · <span className="text-emerald-700">مشترٍ موثّق</span></p>
                {r.reply && <p className="rounded-lg bg-surface p-2 text-xs"><strong>رد المتجر:</strong> {r.reply}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
