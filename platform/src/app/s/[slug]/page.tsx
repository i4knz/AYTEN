import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { getStorefront } from "@/server/stores/service";

const loadStorefront = cache(getStorefront);

export async function generateMetadata({ params }: PageProps<"/s/[slug]">): Promise<Metadata> {
  const store = await loadStorefront((await params).slug);
  if (!store) return {};
  // Unpublished stores must not be indexed.
  return { title: { absolute: store.name }, robots: store.status === "published" ? undefined : { index: false, follow: false } };
}

// Placeholder storefront until the catalog and theme (days 8–12) land. It
// states the real status of the store instead of showing sample products.
export default async function StorefrontHome({ params }: PageProps<"/s/[slug]">) {
  const store = await loadStorefront((await params).slug);
  if (!store) notFound();

  const unavailable = store.status === "suspended" || store.status === "paused";
  const whatsappDigits = store.whatsapp?.replace(/\D/g, "");

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-16 text-center" style={{ ["--store" as string]: store.brandColor }}>
      <div className="mb-6 flex size-16 items-center justify-center rounded-2xl text-2xl font-bold text-white" style={{ background: store.brandColor }}>
        {store.name.slice(0, 1)}
      </div>
      <h1 className="mb-3 text-3xl font-bold">{store.name}</h1>
      <p className="mb-8 max-w-md leading-8 text-ink-soft">
        {unavailable ? "هذا المتجر غير متاح حالياً." : "المتجر قيد الإعداد وسيفتح أبوابه قريباً."}
      </p>
      {!unavailable && whatsappDigits && (
        <a
          href={`https://wa.me/${whatsappDigits}`}
          target="_blank"
          rel="noopener"
          className="rounded-xl px-5 py-3 text-sm font-semibold text-white"
          style={{ background: store.brandColor }}
        >
          تواصل معنا عبر واتساب
        </a>
      )}
    </main>
  );
}
