import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card } from "@/components/ui";
import { DEFAULT_LOW_STOCK, listInventory } from "@/server/catalog/inventory";
import { roleHas } from "@/server/stores/permissions";
import { loadStore } from "../access";
import { AdjustStock } from "./adjust";

export const metadata: Metadata = { title: "المخزون" };

export default async function InventoryPage({ params, searchParams }: PageProps<"/dashboard/[storeId]/inventory">) {
  const { storeId } = await params;
  const lowOnly = (await searchParams).low === "1";
  const { session, access } = await loadStore(storeId);
  const rows = await listInventory(session.user.id, storeId, { lowOnly });
  const canAdjust = roleHas(access.role, "inventory.write");
  const base = `/dashboard/${storeId}/inventory`;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">المخزون</h1>
        <nav className="flex gap-1">
          <Link href={base} aria-current={!lowOnly ? "page" : undefined} className="rounded-full px-3 py-1.5 text-sm text-ink-soft aria-[current=page]:bg-ink aria-[current=page]:text-white">
            الكل
          </Link>
          <Link href={`${base}?low=1`} aria-current={lowOnly ? "page" : undefined} className="rounded-full px-3 py-1.5 text-sm text-ink-soft aria-[current=page]:bg-ink aria-[current=page]:text-white">
            منخفض المخزون (≤ {DEFAULT_LOW_STOCK})
          </Link>
        </nav>
      </div>
      <p className="text-sm text-ink-soft">
        «المتاح» = الكمية في المخزن ناقص المحجوز لطلبات لم تُشحن بعد. كل تعديل يُسجَّل في سجل الحركات مع اسم من قام به.
      </p>
      <Card className="p-0">
        {rows.length === 0 ? (
          <p className="p-6 text-center text-sm text-ink-soft">{lowOnly ? "لا توجد منتجات منخفضة المخزون." : "لا توجد منتجات بعد."}</p>
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((r) => (
              <li key={r.variantId} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <Link href={`/dashboard/${storeId}/products/${r.productId}`} className="font-medium hover:text-brand">
                    {r.productName}
                  </Link>
                  <p className="text-xs text-ink-soft">
                    {r.title || "النسخة الافتراضية"}
                    {r.sku && <span className="ltr"> · {r.sku}</span>}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {!r.trackInventory ? (
                    <Badge>غير متتبع</Badge>
                  ) : (
                    <span className="text-sm">
                      <strong className={r.available <= 0 ? "text-red-700" : r.available <= DEFAULT_LOW_STOCK ? "text-amber-700" : ""}>{r.available}</strong>{" "}
                      متاح
                      {r.reserved > 0 && <span className="text-xs text-ink-soft"> ({r.reserved} محجوز)</span>}
                    </span>
                  )}
                  {canAdjust && <AdjustStock storeId={storeId} variantId={r.variantId} label={`${r.productName} ${r.title}`} />}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
