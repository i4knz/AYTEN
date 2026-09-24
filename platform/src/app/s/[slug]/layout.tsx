import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { loadCategories, loadStorefront, whatsappLink } from "./data";

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

export default async function StorefrontLayout({ children, params }: LayoutProps<"/s/[slug]">) {
  const store = await loadStorefront((await params).slug);
  if (!store) notFound();
  const style = { ["--store" as string]: store.brandColor };

  if (!store.isOpen) {
    const unavailable = store.status === "suspended" || store.status === "paused";
    const wa = whatsappLink(store.whatsapp, "");
    return (
      <main className="flex flex-1 flex-col items-center justify-center px-4 py-16 text-center" style={style}>
        <div className="mb-6 flex size-16 items-center justify-center overflow-hidden rounded-2xl bg-(--store) text-2xl font-bold text-white">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {store.logo ? <img src={store.logo} alt="" className="size-full bg-white object-contain" /> : store.name.slice(0, 1)}
        </div>
        <h1 className="mb-3 text-3xl font-bold">{store.name}</h1>
        <p className="mb-8 max-w-md leading-8 text-ink-soft">
          {unavailable ? "هذا المتجر غير متاح حالياً." : "المتجر قيد الإعداد وسيفتح أبوابه قريباً."}
        </p>
        {!unavailable && wa && (
          <a href={wa} target="_blank" rel="noopener" className="rounded-xl bg-(--store) px-5 py-3 text-sm font-semibold text-white">
            تواصل معنا عبر واتساب
          </a>
        )}
      </main>
    );
  }

  const categories = (await loadCategories(store.id)).filter((c) => !c.parentId);
  const wa = whatsappLink(store.whatsapp, `مرحباً ${store.name}`);

  return (
    <div className="flex min-h-full flex-1 flex-col bg-surface" style={style}>
      <header className="sticky top-0 z-10 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/" className="flex min-w-0 items-center gap-2">
            {store.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={store.logo} alt={store.name} className="h-10 w-auto max-w-32 object-contain" />
            ) : (
              <span className="flex size-10 items-center justify-center rounded-xl bg-(--store) font-bold text-white">{store.name.slice(0, 1)}</span>
            )}
            <span className="truncate text-lg font-bold">{store.name}</span>
          </Link>
          {wa && (
            <a href={wa} target="_blank" rel="noopener" className="shrink-0 rounded-full border border-line px-3 py-1.5 text-sm">
              واتساب
            </a>
          )}
        </div>
        {categories.length > 0 && (
          <nav aria-label="التصنيفات" className="mx-auto max-w-6xl overflow-x-auto px-4 pb-2">
            <ul className="flex gap-2">
              <li>
                <Link href="/" className="block shrink-0 rounded-full bg-muted px-3 py-1 text-sm">
                  الكل
                </Link>
              </li>
              {categories.map((c) => (
                <li key={c.id}>
                  <Link href={`/categories/${encodeURIComponent(c.slug)}`} className="block shrink-0 whitespace-nowrap rounded-full bg-muted px-3 py-1 text-sm">
                    {c.name}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
      <footer className="border-t border-line py-6 text-center text-xs text-ink-soft">
        © {new Date().getFullYear()} {store.name}
      </footer>
    </div>
  );
}
