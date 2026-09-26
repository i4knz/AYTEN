// Storefront sections. Pure presentational components shared by the live
// storefront (server-rendered) and the theme editor's preview (client).

import { Clock, Gift, Headphones, RotateCcw, ShieldCheck, Star, Truck } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { formatMoney } from "@/server/lib/money";
import type { Section, ThemeConfig } from "./config";

export interface ProductCardData {
  id: string;
  name: string;
  slug: string;
  minPrice: number;
  compareAtPrice: number | null;
  imageUrl: string | null;
  imageAlt: string;
  inStock: boolean;
  categorySlugs: string[];
}

export interface StorefrontData {
  store: { name: string; whatsapp: string | null };
  products: ProductCardData[];
  categories: { name: string; slug: string; imageUrl: string | null }[];
  reviews: { authorName: string; rating: number; body: string; productName: string }[];
  mediaBase: string;
}

const ICONS = { truck: Truck, shield: ShieldCheck, return: RotateCcw, support: Headphones, gift: Gift, clock: Clock };

function SmartLink({ href, className, children, preview }: { href: string; className?: string; children: ReactNode; preview?: boolean }) {
  if (preview || !href) return <span className={className}>{children}</span>;
  if (href.startsWith("https://")) {
    return (
      <a href={href} className={className} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}

export function ProductCard({ p, theme, preview }: { p: ProductCardData; theme: ThemeConfig; preview?: boolean }) {
  const card = theme.productCard.style === "card";
  return (
    <SmartLink href={`/products/${encodeURIComponent(p.slug)}`} preview={preview} className={`group flex flex-col gap-2 ${card ? "rounded-(--radius) bg-muted p-2" : ""}`}>
      <div className={`relative overflow-hidden rounded-(--radius) bg-muted ${theme.productCard.aspect === "portrait" ? "aspect-[3/4]" : "aspect-square"}`}>
        {p.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.imageUrl} alt={p.imageAlt} loading="lazy" className="size-full object-cover transition duration-300 group-hover:scale-[1.03]" />
        )}
        {!p.inStock && <span className="absolute start-2 top-2 rounded-full bg-black/75 px-2 py-0.5 text-xs text-white">نفدت الكمية</span>}
        {p.inStock && p.compareAtPrice && (
          <span className="absolute start-2 top-2 rounded-full bg-(--store) px-2 py-0.5 text-xs text-(--on-store)">
            خصم {Math.round((1 - p.minPrice / p.compareAtPrice) * 100)}%
          </span>
        )}
      </div>
      <div className={card ? "px-1 pb-1" : ""}>
        <h3 className="line-clamp-2 text-sm font-medium">{p.name}</h3>
        <p className="mt-1 text-sm">
          <strong>{formatMoney(p.minPrice)}</strong>
          {p.compareAtPrice && <s className="ms-2 text-xs text-ink-faint">{formatMoney(p.compareAtPrice)}</s>}
        </p>
      </div>
    </SmartLink>
  );
}

export function ProductGridView({ products, theme, columns = 4, preview }: { products: ProductCardData[]; theme: ThemeConfig; columns?: number; preview?: boolean }) {
  if (!products.length) return <p className="py-10 text-center text-sm text-ink-soft">لا توجد منتجات هنا بعد.</p>;
  const cols = { 2: "sm:grid-cols-2", 3: "sm:grid-cols-3", 4: "sm:grid-cols-3 lg:grid-cols-4", 5: "sm:grid-cols-3 lg:grid-cols-5" }[columns] ?? "sm:grid-cols-3 lg:grid-cols-4";
  return (
    <ul className={`grid grid-cols-2 gap-x-3 gap-y-6 ${cols}`}>
      {products.map((p) => (
        <li key={p.id}>
          <ProductCard p={p} theme={theme} preview={preview} />
        </li>
      ))}
    </ul>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return children ? <h2 className="mb-5 text-xl font-bold sm:text-2xl">{children}</h2> : null;
}

export function RenderSection({ section, data, theme, preview }: { section: Section; data: StorefrontData; theme: ThemeConfig; preview?: boolean }) {
  const img = (key: string | null) => (key ? data.mediaBase + key : null);
  switch (section.type) {
    case "announcement": {
      const s = section.settings;
      if (!s.text) return null;
      return (
        <div className="-mx-4 -mt-6 mb-6 bg-(--store) px-4 py-2 text-center text-sm text-(--on-store)">
          {s.link ? <SmartLink href={s.link} preview={preview} className="underline-offset-4 hover:underline">{s.text}</SmartLink> : s.text}
        </div>
      );
    }
    case "hero": {
      const s = section.settings;
      const bg = img(s.image);
      const height = { sm: "min-h-56", md: "min-h-80", lg: "min-h-[28rem]" }[s.height];
      return (
        <section className={`relative flex ${height} items-center overflow-hidden rounded-(--radius) ${bg ? "" : "bg-muted"}`}>
          {bg && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={bg} alt="" className="absolute inset-0 size-full object-cover" />
          )}
          {bg && <div className="absolute inset-0 bg-black" style={{ opacity: s.overlay / 100 }} />}
          <div className={`relative flex w-full flex-col gap-3 p-6 sm:p-10 ${s.align === "center" ? "items-center text-center" : ""} ${bg ? "text-white" : ""}`}>
            {s.title && <h2 className="max-w-xl text-3xl font-bold leading-tight sm:text-4xl">{s.title}</h2>}
            {s.subtitle && <p className="max-w-xl text-base opacity-90">{s.subtitle}</p>}
            {s.buttonText && (
              <SmartLink href={s.buttonLink || "#products"} preview={preview} className="mt-2 w-fit rounded-(--radius-btn) bg-(--store) px-6 py-3 font-semibold text-(--on-store)">
                {s.buttonText}
              </SmartLink>
            )}
          </div>
        </section>
      );
    }
    case "categories": {
      const s = section.settings;
      if (!data.categories.length) return null;
      return (
        <section>
          <SectionTitle>{s.title}</SectionTitle>
          <ul className="flex gap-4 overflow-x-auto pb-2">
            {data.categories.map((c) => (
              <li key={c.slug} className="shrink-0">
                <SmartLink href={`/categories/${encodeURIComponent(c.slug)}`} preview={preview} className="flex w-24 flex-col items-center gap-2 text-center text-sm sm:w-28">
                  <span className={`flex size-20 items-center justify-center overflow-hidden bg-muted text-xl font-bold text-(--store) sm:size-24 ${s.style === "circles" ? "rounded-full" : "rounded-(--radius)"}`}>
                    {c.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.imageUrl} alt="" className="size-full object-cover" />
                    ) : (
                      c.name.slice(0, 1)
                    )}
                  </span>
                  <span className="line-clamp-2">{c.name}</span>
                </SmartLink>
              </li>
            ))}
          </ul>
        </section>
      );
    }
    case "products": {
      const s = section.settings;
      let items = data.products;
      if (s.source === "sale") items = items.filter((p) => p.compareAtPrice);
      if (s.source === "category" && s.categorySlug) items = items.filter((p) => p.categorySlugs.includes(s.categorySlug));
      items = items.slice(0, s.limit);
      if (!items.length && !preview) return null;
      return (
        <section id="products">
          <SectionTitle>{s.title}</SectionTitle>
          <ProductGridView products={items} theme={theme} columns={s.columns} preview={preview} />
        </section>
      );
    }
    case "image_text": {
      const s = section.settings;
      const src = img(s.image);
      return (
        <section className={`grid items-center gap-6 ${src || preview ? "sm:grid-cols-2" : "mx-auto max-w-3xl"}`}>
          {(src || preview) && (
            <div className={`aspect-[4/3] overflow-hidden rounded-(--radius) ${src ? "bg-muted" : "flex items-center justify-center border border-dashed border-line text-xs text-ink-soft"} ${s.imageSide === "end" ? "sm:order-2" : ""}`}>
              {src ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={src} alt="" className="size-full object-cover" />
              ) : (
                "أضف صورة لهذا القسم"
              )}
            </div>
          )}
          <div className="flex flex-col gap-3">
            {s.title && <h2 className="text-2xl font-bold">{s.title}</h2>}
            {s.body && <p className="whitespace-pre-line leading-8 text-ink-soft">{s.body}</p>}
            {s.buttonText && (
              <SmartLink href={s.buttonLink} preview={preview} className="w-fit rounded-(--radius-btn) border border-(--store) px-5 py-2.5 text-sm font-semibold text-(--store)">
                {s.buttonText}
              </SmartLink>
            )}
          </div>
        </section>
      );
    }
    case "features": {
      const items = section.settings.items.filter((i) => i.title);
      if (!items.length) return null;
      return (
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {items.map((f, i) => {
            const Icon = ICONS[f.icon];
            return (
              <div key={i} className="flex flex-col items-center gap-2 rounded-(--radius) bg-muted p-4 text-center">
                <Icon className="size-6 text-(--store)" aria-hidden />
                <p className="text-sm font-semibold">{f.title}</p>
                {f.body && <p className="text-xs text-ink-soft">{f.body}</p>}
              </div>
            );
          })}
        </section>
      );
    }
    case "reviews": {
      const s = section.settings;
      const items = data.reviews.slice(0, s.limit);
      if (!items.length) {
        return preview ? <p className="rounded-(--radius) border border-dashed border-line p-6 text-center text-sm text-ink-soft">ستظهر هنا تقييمات عملائك الموثقة بعد اعتمادها.</p> : null;
      }
      return (
        <section>
          <SectionTitle>{s.title}</SectionTitle>
          <ul className="grid gap-3 sm:grid-cols-3">
            {items.map((r, i) => (
              <li key={i} className="flex flex-col gap-2 rounded-(--radius) bg-muted p-4">
                <span className="flex gap-0.5 text-amber-500" aria-label={`${r.rating} من 5`}>
                  {Array.from({ length: 5 }, (_, j) => (
                    <Star key={j} className={`size-4 ${j < r.rating ? "fill-current" : "opacity-30"}`} aria-hidden />
                  ))}
                </span>
                {r.body && <p className="text-sm leading-7">{r.body}</p>}
                <p className="text-xs text-ink-soft">
                  {r.authorName} · {r.productName} · <span className="text-emerald-700">مشترٍ موثّق</span>
                </p>
              </li>
            ))}
          </ul>
        </section>
      );
    }
    case "faq": {
      const s = section.settings;
      const items = s.items.filter((i) => i.q);
      if (!items.length) return null;
      return (
        <section className="mx-auto w-full max-w-3xl">
          <SectionTitle>{s.title}</SectionTitle>
          <div className="flex flex-col gap-2">
            {items.map((f, i) => (
              <details key={i} className="rounded-(--radius) bg-muted px-4 py-3">
                <summary className="cursor-pointer font-medium">{f.q}</summary>
                <p className="mt-2 whitespace-pre-line text-sm leading-7 text-ink-soft">{f.a}</p>
              </details>
            ))}
          </div>
        </section>
      );
    }
    case "rich_text": {
      const s = section.settings;
      if (!s.title && !s.body) return null;
      return (
        <section className={`mx-auto flex max-w-3xl flex-col gap-3 ${s.align === "center" ? "text-center" : ""}`}>
          {s.title && <h2 className="text-2xl font-bold">{s.title}</h2>}
          {s.body && <p className="whitespace-pre-line leading-8 text-ink-soft">{s.body}</p>}
        </section>
      );
    }
    case "whatsapp_cta": {
      const s = section.settings;
      const digits = data.store.whatsapp?.replace(/\D/g, "");
      if (!digits && !preview) return null;
      return (
        <section className="flex flex-col items-center gap-3 rounded-(--radius) bg-muted p-8 text-center">
          {s.title && <h2 className="text-2xl font-bold">{s.title}</h2>}
          {s.body && <p className="text-ink-soft">{s.body}</p>}
          <SmartLink href={digits ? `https://wa.me/${digits}` : ""} preview={preview} className="rounded-(--radius-btn) bg-[#25D366] px-6 py-3 font-semibold text-white">
            {s.buttonText || "واتساب"}
          </SmartLink>
          {!digits && preview && <p className="text-xs text-amber-700">أضف رقم واتساب في الإعدادات ليظهر هذا القسم.</p>}
        </section>
      );
    }
  }
}

export function RenderSections({ theme, data, preview }: { theme: ThemeConfig; data: StorefrontData; preview?: boolean }) {
  return (
    <div className="flex flex-col gap-10">
      {theme.sections
        .filter((s) => s.visible)
        .map((s) => (
          <RenderSection key={s.id} section={s} data={data} theme={theme} preview={preview} />
        ))}
    </div>
  );
}
