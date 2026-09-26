import "@fontsource/cairo/400.css";
import "@fontsource/cairo/700.css";
import "@fontsource/tajawal/400.css";
import "@fontsource/tajawal/700.css";
import "@fontsource/almarai/400.css";
import "@fontsource/almarai/700.css";
import { MessageCircle, Search, ShoppingBag } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";
import { getCart } from "@/server/commerce/cart";
import { themeCssVars, WIDTHS } from "@/themes/config";
import { readCartToken } from "./cart-cookie";
import { loadCategories, loadFooterPages, loadStorefront, loadStoreSettings, loadTheme, whatsappLink } from "./data";
import { PageViewBeacon } from "./beacon";
import { StoreTracking } from "./tracking";

export async function generateMetadata({ params }: LayoutProps<"/s/[slug]">): Promise<Metadata> {
  const store = await loadStorefront((await params).slug);
  if (!store) return {};
  return {
    title: { default: store.name, template: `%s | ${store.name}` },
    // Unpublished stores must not be indexed.
    robots: store.isOpen ? undefined : { index: false, follow: false },
    icons: store.logo ? { icon: store.logo } : undefined,
  };
}

const SOCIAL = {
  instagram: (h: string) => `https://instagram.com/${h}`,
  tiktok: (h: string) => `https://www.tiktok.com/@${h}`,
  snapchat: (h: string) => `https://www.snapchat.com/add/${h}`,
  x: (h: string) => `https://x.com/${h}`,
} as const;
const SOCIAL_LABELS = { instagram: "إنستغرام", tiktok: "تيك توك", snapchat: "سناب شات", x: "إكس" } as const;

export default async function StorefrontLayout({ children, params }: LayoutProps<"/s/[slug]">) {
  const store = await loadStorefront((await params).slug);
  if (!store) notFound();
  const theme = await loadTheme(store.id);
  const style = { ...themeCssVars(theme), fontFamily: "var(--font-store)" } as CSSProperties;

  if (!store.isOpen) {
    const unavailable = store.status === "suspended" || store.status === "paused";
    const wa = whatsappLink(store.whatsapp, "");
    return (
      <main className="flex flex-1 flex-col items-center justify-center bg-surface px-4 py-16 text-center text-ink" style={style}>
        <div className="mb-6 flex size-16 items-center justify-center overflow-hidden rounded-2xl bg-(--store) text-2xl font-bold text-(--on-store)">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {store.logo ? <img src={store.logo} alt="" className="size-full bg-white object-contain" /> : store.name.slice(0, 1)}
        </div>
        <h1 className="mb-3 text-3xl font-bold">{store.name}</h1>
        <p className="mb-8 max-w-md leading-8 text-ink-soft">{unavailable ? "هذا المتجر غير متاح حالياً." : "المتجر قيد الإعداد وسيفتح أبوابه قريباً."}</p>
        {!unavailable && wa && (
          <a href={wa} target="_blank" rel="noopener" className="rounded-xl bg-(--store) px-5 py-3 text-sm font-semibold text-(--on-store)">
            تواصل معنا عبر واتساب
          </a>
        )}
      </main>
    );
  }

  const [categories, settings, footerPages, cart] = await Promise.all([
    loadCategories(store.id),
    loadStoreSettings(store.id),
    loadFooterPages(store.id),
    readCartToken().then((t) => getCart(store.id, t)),
  ]);
  const topCategories = categories.filter((c) => !c.parentId);
  const wa = whatsappLink(store.whatsapp, `مرحباً ${store.name}`);
  const centered = theme.header.align === "center";
  const width = WIDTHS[theme.layout.width];
  const brandHeader = theme.header.style === "brand";
  const chip = brandHeader ? "bg-(--on-store)/10 text-(--on-store)" : "bg-muted";
  const socials = (Object.keys(SOCIAL) as (keyof typeof SOCIAL)[]).filter((k) => theme.footer[k]);

  return (
    <div className="store-headings flex min-h-full flex-1 flex-col bg-surface text-ink" style={style}>
      <header className={`sticky top-0 z-30 border-b backdrop-blur ${brandHeader ? "border-transparent bg-(--store) text-(--on-store)" : "border-line bg-surface/95"}`}>
        <div className={`mx-auto flex ${width} items-center gap-3 px-4 py-3 ${centered ? "justify-between sm:grid sm:grid-cols-3" : "justify-between"}`}>
          {centered && (
            <span className="hidden sm:block">
              {theme.header.showSearch && (
                <Link href="/search" className="inline-flex items-center gap-1.5 text-sm opacity-80 hover:opacity-100">
                  <Search className="size-4" aria-hidden />
                  بحث
                </Link>
              )}
            </span>
          )}
          <Link href="/" className={`flex min-w-0 items-center gap-2 ${centered ? "sm:justify-self-center" : ""}`}>
            {store.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={store.logo} alt={store.name} className="h-10 w-auto max-w-32 object-contain" />
            ) : (
              <span className={`flex size-10 items-center justify-center rounded-(--radius) font-bold ${brandHeader ? "bg-(--on-store) text-(--store)" : "bg-(--store) text-(--on-store)"}`}>{store.name.slice(0, 1)}</span>
            )}
            <span className="truncate text-lg font-bold">{store.name}</span>
          </Link>
          <div className={`flex shrink-0 items-center gap-2 ${centered ? "sm:justify-self-end" : ""}`}>
            {theme.header.showSearch && (
              <Link href="/search" aria-label="البحث في المتجر" className={`flex size-9 items-center justify-center rounded-full ${centered ? "sm:hidden" : ""} ${brandHeader ? "hover:bg-(--on-store)/10" : "hover:bg-muted"}`}>
                <Search className="size-4.5" aria-hidden />
              </Link>
            )}
            <Link href="/cart" className={`relative flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm ${brandHeader ? "border-(--on-store)/30" : "border-line"}`} aria-label={`السلة (${cart.itemCount})`}>
              <ShoppingBag className="size-4" aria-hidden />
              <span className="hidden sm:inline">السلة</span>
              {cart.itemCount > 0 && (
                <span className={`absolute -end-2 -top-2 flex size-5 items-center justify-center rounded-full text-[11px] ${brandHeader ? "bg-(--on-store) text-(--store)" : "bg-(--store) text-(--on-store)"}`}>{cart.itemCount}</span>
              )}
            </Link>
          </div>
        </div>
        {theme.header.showCategories && topCategories.length > 0 && (
          <nav aria-label="التصنيفات" className={`mx-auto ${width} overflow-x-auto px-4 pb-2`}>
            <ul className={`flex gap-2 ${centered ? "sm:justify-center" : ""}`}>
              <li>
                <Link href="/" className={`block shrink-0 rounded-full px-3 py-1 text-sm ${chip}`}>الكل</Link>
              </li>
              {topCategories.map((c) => (
                <li key={c.id}>
                  <Link href={`/categories/${encodeURIComponent(c.slug)}`} className={`block shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-sm ${chip}`}>
                    {c.name}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </header>

      <main className={`mx-auto w-full ${width} flex-1 px-4 py-6`}>{children}</main>

      <footer className="border-t border-line bg-muted">
        <div className={`mx-auto grid ${width} gap-6 px-4 py-8 text-sm sm:grid-cols-3`}>
          <div className="flex flex-col gap-2">
            <p className="font-bold">{store.name}</p>
            {theme.footer.about && <p className="leading-7 text-ink-soft">{theme.footer.about}</p>}
          </div>
          <nav className="flex flex-col gap-2" aria-label="روابط المتجر">
            {footerPages.map((p) => (
              <Link key={p.slug} href={`/pages/${encodeURIComponent(p.slug)}`} className="text-ink-soft hover:text-ink">
                {p.title}
              </Link>
            ))}
            <Link href="/track" className="text-ink-soft hover:text-ink">تتبع طلبك</Link>
          </nav>
          {socials.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="font-semibold">تابعنا</p>
              <div className="flex flex-wrap gap-3">
                {socials.map((k) => (
                  <a key={k} href={SOCIAL[k](encodeURIComponent(theme.footer[k].replace(/^@/, "")))} target="_blank" rel="noopener noreferrer" className="text-ink-soft hover:text-ink">
                    {SOCIAL_LABELS[k]}
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
        <p className="pb-6 text-center text-xs text-ink-soft">© {new Date().getFullYear()} {store.name}</p>
      </footer>

      {settings.features.whatsappButton && wa && (
        <a href={wa} target="_blank" rel="noopener" aria-label="تواصل عبر واتساب" className="fixed bottom-4 end-4 z-40 flex size-13 items-center justify-center rounded-full bg-[#25D366] text-white shadow-lg">
          <MessageCircle className="size-6" aria-hidden />
        </a>
      )}
      <StoreTracking tracking={settings.tracking} />
      <PageViewBeacon />
    </div>
  );
}
