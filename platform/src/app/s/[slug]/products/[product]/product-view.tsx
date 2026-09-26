"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { formatMoney } from "@/server/lib/money";
import { addToCartAction } from "../../actions";

type Variant = { id: string; values: string[]; price: number; compareAtPrice: number | null; inStock: boolean; lowStock: number | null };

export function ProductView({
  slug,
  name,
  description,
  options,
  variants,
  images,
  whatsapp,
  productUrl,
  showStockHints = true,
  showShare = true,
  aspect = "square",
  rating = null,
}: {
  slug: string;
  name: string;
  description: string;
  options: { name: string; values: string[] }[];
  variants: Variant[];
  images: { id: string; url: string; alt: string; width: number; height: number }[];
  whatsapp: string | null;
  productUrl: string;
  showStockHints?: boolean;
  showShare?: boolean;
  aspect?: "square" | "portrait";
  rating?: { average: number; count: number } | null;
}) {
  const firstAvailable = variants.find((v) => v.inStock) ?? variants[0];
  const [selected, setSelected] = useState<string[]>(firstAvailable.values);
  const [imageIndex, setImageIndex] = useState(0);

  const variant = useMemo(() => variants.find((v) => v.values.every((val, i) => val === selected[i])), [variants, selected]);
  const isAvailable = (optionIndex: number, value: string) =>
    variants.some((v) => v.inStock && v.values[optionIndex] === value && v.values.every((val, i) => i === optionIndex || i > optionIndex || val === selected[i]));

  const choice = selected.length ? ` (${selected.join(" / ")})` : "";
  const digits = whatsapp?.replace(/\D/g, "");
  const waHref = digits ? `https://wa.me/${digits}?text=${encodeURIComponent(`مرحباً، أرغب في طلب: ${name}${choice}\n${productUrl}`)}` : null;
  const image = images[imageIndex];
  const [quantity, setQuantity] = useState(1);
  const [pending, start] = useTransition();
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string; cart?: boolean } | null>(null);
  const add = () =>
    variant &&
    start(async () => {
      const r = await addToCartAction(slug, variant.id, quantity);
      setFeedback({ ok: !!r.ok, text: r.message ?? "", cart: !!r.ok });
    });

  return (
    <div className="grid gap-8 md:grid-cols-2">
      <div className="flex flex-col gap-3">
        <div className={`overflow-hidden rounded-(--radius) bg-muted ${aspect === "portrait" ? "aspect-[3/4]" : "aspect-square"}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {image && <img src={image.url} alt={image.alt} width={image.width} height={image.height} className="size-full object-cover" />}
        </div>
        {images.length > 1 && (
          <div className="flex gap-2 overflow-x-auto">
            {images.map((img, i) => (
              <button
                key={img.id}
                type="button"
                onClick={() => setImageIndex(i)}
                aria-label={`عرض الصورة ${i + 1}`}
                aria-pressed={i === imageIndex}
                className="size-16 shrink-0 overflow-hidden rounded-lg border-2 border-transparent aria-pressed:border-(--store)"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.url} alt="" className="size-full object-cover" loading="lazy" />
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-5">
        <h1 className="text-2xl font-bold leading-snug">{name}</h1>
        {rating && (
          <a href="#reviews" className="-mt-3 flex items-center gap-1 text-sm text-ink-soft">
            <span className="text-amber-500" aria-hidden>★</span> {rating.average.toFixed(1)} ({rating.count} تقييم)
          </a>
        )}
        <p className="text-xl">
          {variant ? (
            <>
              <strong>{formatMoney(variant.price)}</strong>
              {variant.compareAtPrice && <s className="ms-3 text-base text-ink-faint">{formatMoney(variant.compareAtPrice)}</s>}
            </>
          ) : (
            <span className="text-base text-ink-soft">هذا الاختيار غير متوفر.</span>
          )}
        </p>

        {options.map((o, i) => (
          <fieldset key={o.name} className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-medium">
              {o.name}: <span className="text-ink-soft">{selected[i]}</span>
            </legend>
            <div className="flex flex-wrap gap-2">
              {o.values.map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={selected[i] === value}
                  onClick={() => setSelected((s) => s.map((v, j) => (j === i ? value : v)))}
                  className={`rounded-full border px-4 py-1.5 text-sm aria-pressed:border-(--store) aria-pressed:bg-(--store) aria-pressed:text-white ${
                    isAvailable(i, value) ? "border-line" : "border-dashed border-line text-ink-faint line-through"
                  }`}
                >
                  {value}
                </button>
              ))}
            </div>
          </fieldset>
        ))}

        {variant && (
          <p className={`text-sm ${variant.inStock ? "text-emerald-700" : "text-red-700"}`}>
            {!variant.inStock ? "نفدت الكمية" : showStockHints && variant.lowStock ? `متبقٍ ${variant.lowStock} فقط` : "متوفر"}
          </p>
        )}

        {variant?.inStock && (
          <div className="flex gap-2">
            <div className="flex items-center rounded-(--radius) border border-line">
              <button type="button" onClick={() => setQuantity((q) => Math.min(q + 1, 99))} className="px-3 py-2 text-lg" aria-label="زيادة الكمية">+</button>
              <span className="min-w-6 text-center" aria-live="polite" aria-label="الكمية">{quantity}</span>
              <button type="button" onClick={() => setQuantity((q) => Math.max(q - 1, 1))} className="px-3 py-2 text-lg" aria-label="تقليل الكمية">−</button>
            </div>
            <button type="button" onClick={add} disabled={pending} className="flex-1 rounded-(--radius-btn) bg-(--store) px-5 py-3 font-semibold text-(--on-store) disabled:opacity-60">
              {pending ? "جارٍ الإضافة…" : "أضف إلى السلة"}
            </button>
          </div>
        )}
        {feedback && (
          <p role="status" className={`text-sm ${feedback.ok ? "text-emerald-700" : "text-red-700"}`}>
            {feedback.text}{" "}
            {feedback.cart && <Link href="/cart" className="font-semibold underline">عرض السلة</Link>}
          </p>
        )}
        {waHref && variant?.inStock && (
          <a href={waHref} target="_blank" rel="noopener" className="rounded-(--radius) border border-line px-5 py-3 text-center text-sm">
            اسأل عن المنتج عبر واتساب
          </a>
        )}

        {showShare && (
          <div className="flex flex-wrap items-center gap-3 text-sm text-ink-soft">
            <span>مشاركة:</span>
            <a href={`https://wa.me/?text=${encodeURIComponent(`${name} ${productUrl}`)}`} target="_blank" rel="noopener noreferrer" className="hover:text-ink">واتساب</a>
            <a href={`https://x.com/intent/post?text=${encodeURIComponent(name)}&url=${encodeURIComponent(productUrl)}`} target="_blank" rel="noopener noreferrer" className="hover:text-ink">إكس</a>
            <button type="button" className="hover:text-ink" onClick={() => void navigator.clipboard?.writeText(productUrl).then(() => setFeedback({ ok: true, text: "تم نسخ الرابط." }))}>
              نسخ الرابط
            </button>
          </div>
        )}
        {description && <div className="whitespace-pre-line border-t border-line pt-5 text-sm leading-8 text-ink">{description}</div>}
      </div>
    </div>
  );
}
