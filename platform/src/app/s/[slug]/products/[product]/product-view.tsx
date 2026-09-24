"use client";

import { useMemo, useState } from "react";
import { formatMoney } from "@/server/lib/money";

type Variant = { id: string; values: string[]; price: number; compareAtPrice: number | null; inStock: boolean; lowStock: number | null };

export function ProductView({
  name,
  description,
  options,
  variants,
  images,
  whatsapp,
  productUrl,
}: {
  name: string;
  description: string;
  options: { name: string; values: string[] }[];
  variants: Variant[];
  images: { id: string; url: string; alt: string; width: number; height: number }[];
  whatsapp: string | null;
  productUrl: string;
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

  return (
    <div className="grid gap-8 md:grid-cols-2">
      <div className="flex flex-col gap-3">
        <div className="aspect-square overflow-hidden rounded-2xl bg-muted">
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
            {!variant.inStock ? "نفدت الكمية" : variant.lowStock ? `متبقٍ ${variant.lowStock} فقط` : "متوفر"}
          </p>
        )}

        {waHref && variant?.inStock && (
          <a href={waHref} target="_blank" rel="noopener" className="rounded-xl bg-(--store) px-5 py-3 text-center font-semibold text-white">
            اطلب عبر واتساب
          </a>
        )}

        {description && <div className="whitespace-pre-line border-t border-line pt-5 text-sm leading-8 text-ink">{description}</div>}
      </div>
    </div>
  );
}
