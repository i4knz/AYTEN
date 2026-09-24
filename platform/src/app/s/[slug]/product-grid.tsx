import Link from "next/link";
import type { StorefrontProductCard } from "@/server/catalog/storefront";
import { formatMoney } from "@/server/lib/money";

export function ProductGrid({ products }: { products: StorefrontProductCard[] }) {
  if (!products.length) return <p className="py-16 text-center text-ink-soft">لا توجد منتجات هنا بعد.</p>;
  return (
    <ul className="grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 lg:grid-cols-4">
      {products.map((p) => (
        <li key={p.id}>
          <Link href={`/products/${encodeURIComponent(p.slug)}`} className="group flex flex-col gap-2">
            <div className="relative aspect-square overflow-hidden rounded-2xl bg-muted">
              {p.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.imageUrl} alt={p.imageAlt} loading="lazy" className="size-full object-cover transition group-hover:scale-[1.02]" />
              )}
              {!p.inStock && <span className="absolute start-2 top-2 rounded-full bg-ink/80 px-2 py-0.5 text-xs text-white">نفدت الكمية</span>}
              {p.inStock && p.compareAtPrice && <span className="absolute start-2 top-2 rounded-full bg-(--store) px-2 py-0.5 text-xs text-white">تخفيض</span>}
            </div>
            <h2 className="line-clamp-2 text-sm font-medium">{p.name}</h2>
            <p className="text-sm">
              <strong>{formatMoney(p.minPrice)}</strong>
              {p.compareAtPrice && <s className="ms-2 text-xs text-ink-faint">{formatMoney(p.compareAtPrice)}</s>}
            </p>
          </Link>
        </li>
      ))}
    </ul>
  );
}
