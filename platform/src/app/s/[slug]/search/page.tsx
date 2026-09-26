import { Search } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { listStorefrontProducts } from "@/server/catalog/storefront";
import { ProductGridView } from "@/themes/sections";
import { loadStorefront, loadTheme } from "../data";

export const metadata: Metadata = { title: "البحث", robots: { index: false } };

export default async function StoreSearchPage({ params, searchParams }: PageProps<"/s/[slug]/search">) {
  const store = await loadStorefront((await params).slug);
  if (!store?.isOpen) notFound();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 80) : "";
  const [theme, result] = await Promise.all([loadTheme(store.id), q.trim() ? listStorefrontProducts(store.id, { q }) : Promise.resolve(null)]);
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">البحث في {store.name}</h1>
      <form role="search" className="flex max-w-xl gap-2">
        <label htmlFor="store-q" className="sr-only">
          ابحث عن منتج
        </label>
        <input
          id="store-q"
          name="q"
          type="search"
          defaultValue={q}
          placeholder="اسم المنتج أو رمزه"
          autoFocus
          className="min-w-0 flex-1 rounded-(--radius) border border-line bg-surface px-4 py-2.5 outline-none focus:border-(--store)"
        />
        <button type="submit" className="flex items-center gap-1.5 rounded-(--radius-btn) bg-(--store) px-5 font-semibold text-(--on-store)">
          <Search className="size-4" aria-hidden />
          بحث
        </button>
      </form>
      {result && (
        <>
          <p className="text-sm text-ink-soft" role="status">
            {result.products.length ? `${result.products.length} نتيجة لـ «${q}»` : `لا توجد نتائج لـ «${q}». جرّب كلمة أخرى.`}
          </p>
          {result.products.length > 0 && <ProductGridView products={result.products} theme={theme} />}
        </>
      )}
    </div>
  );
}
