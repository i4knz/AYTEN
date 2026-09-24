import type { Metadata } from "next";
import Link from "next/link";
import { Badge, ButtonLink, Card } from "@/components/ui";
import { mediaUrl } from "@/server/catalog/images";
import { listProducts } from "@/server/catalog/products";
import { formatMoney } from "@/server/lib/money";
import { roleHas } from "@/server/stores/permissions";
import { loadStore } from "../access";

export const metadata: Metadata = { title: "المنتجات" };

const STATUS = { active: { label: "منشور", tone: "success" }, draft: { label: "مسودة", tone: "warning" }, archived: { label: "مؤرشف", tone: "neutral" } } as const;
const FILTERS = [
  ["all", "الكل"],
  ["active", "منشور"],
  ["draft", "مسودة"],
  ["archived", "مؤرشف"],
] as const;

export default async function ProductsPage({ params, searchParams }: PageProps<"/dashboard/[storeId]/products">) {
  const { storeId } = await params;
  const sp = await searchParams;
  const { session, access } = await loadStore(storeId);
  const status = FILTERS.some(([k]) => k === sp.status) ? (sp.status as "all" | "active" | "draft" | "archived") : "all";
  const q = typeof sp.q === "string" ? sp.q.slice(0, 100) : "";
  const page = Number(sp.page) || 1;
  const list = await listProducts(session.user.id, storeId, { status, q, page });
  const canWrite = roleHas(access.role, "products.write");
  const base = `/dashboard/${storeId}/products`;
  const qs = (over: Record<string, string | number>) => {
    const u = new URLSearchParams({ ...(status !== "all" && { status }), ...(q && { q }), ...Object.fromEntries(Object.entries(over).map(([k, v]) => [k, String(v)])) });
    return u.toString() ? `?${u}` : "";
  };

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">المنتجات</h1>
        <div className="flex gap-2">
          <ButtonLink href={`${base}/categories`} tone="secondary">
            التصنيفات
          </ButtonLink>
          {canWrite && <ButtonLink href={`${base}/new`}>+ إضافة منتج</ButtonLink>}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav className="flex gap-1 overflow-x-auto" aria-label="تصفية حسب الحالة">
          {FILTERS.map(([key, label]) => (
            <Link
              key={key}
              href={`${base}${qs({ status: key, page: 1 }).replace(/status=all&?/, "")}`}
              aria-current={status === key ? "page" : undefined}
              className="shrink-0 rounded-full px-3 py-1.5 text-sm text-ink-soft hover:bg-muted aria-[current=page]:bg-ink aria-[current=page]:text-white"
            >
              {label}
            </Link>
          ))}
        </nav>
        <form className="w-full sm:w-64" role="search">
          {status !== "all" && <input type="hidden" name="status" value={status} />}
          <input
            name="q"
            defaultValue={q}
            placeholder="ابحث باسم المنتج"
            aria-label="ابحث باسم المنتج"
            className="w-full rounded-xl border border-line bg-surface px-3.5 py-2 text-sm outline-none focus:border-brand"
          />
        </form>
      </div>

      {list.rows.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 py-12 text-center">
          <p className="font-semibold">{q || status !== "all" ? "لا توجد منتجات مطابقة." : "لم تضف أي منتج بعد."}</p>
          {canWrite && !q && status === "all" && (
            <>
              <p className="text-sm text-ink-soft">أضف أول منتج خلال دقيقة: الاسم والسعر والكمية تكفي للبداية.</p>
              <ButtonLink href={`${base}/new`}>إضافة أول منتج</ButtonLink>
            </>
          )}
        </Card>
      ) : (
        <Card className="p-0">
          <ul className="divide-y divide-line">
            {list.rows.map((p) => {
              const img = mediaUrl(p.imageKey);
              const price =
                p.minPrice == null ? "—" : p.minPrice === p.maxPrice ? formatMoney(p.minPrice) : `${formatMoney(p.minPrice)} – ${formatMoney(p.maxPrice!)}`;
              const stock = p.untracked ? "غير محدود" : p.available == null ? "—" : p.available <= 0 ? "نفدت الكمية" : `${p.available} متوفر`;
              return (
                <li key={p.id}>
                  <Link href={`${base}/${p.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/60">
                    <div className="size-12 shrink-0 overflow-hidden rounded-lg bg-muted">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {img && <img src={img} alt="" className="size-full object-cover" loading="lazy" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{p.name}</p>
                      <p className="text-xs text-ink-soft">
                        {price} · {p.variantCount > 1 ? `${p.variantCount} نسخ · ` : ""}
                        <span className={p.available !== null && p.available <= 0 && !p.untracked ? "text-red-700" : ""}>{stock}</span>
                      </p>
                    </div>
                    <Badge tone={STATUS[p.status].tone}>{STATUS[p.status].label}</Badge>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {list.pageCount > 1 && (
        <nav className="flex items-center justify-center gap-3 text-sm" aria-label="الصفحات">
          {list.page > 1 && <Link href={`${base}${qs({ page: list.page - 1 })}`} className="text-brand">السابق</Link>}
          <span className="text-ink-soft">
            صفحة {list.page} من {list.pageCount}
          </span>
          {list.page < list.pageCount && <Link href={`${base}${qs({ page: list.page + 1 })}`} className="text-brand">التالي</Link>}
        </nav>
      )}
    </div>
  );
}
