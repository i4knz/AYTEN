import { CalendarDays, ChartLine, Send, ShoppingCart, Tag, type LucideIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { loadStore } from "../access";

export const metadata: Metadata = { title: "التسويق" };

const TOOLS: { title: string; body: string; path: string; icon: LucideIcon; ready: boolean; color: string }[] = [
  { title: "الكوبونات", body: "إنشاء وإدارة أكواد الخصم لعملائك", path: "/marketing/coupons", icon: Tag, ready: true, color: "bg-rose-100 text-rose-700" },
  { title: "السلات المتروكة", body: "تتبع واسترجاع السلات التي لم تكتمل", path: "/marketing/abandoned", icon: ShoppingCart, ready: true, color: "bg-amber-100 text-amber-700" },
  { title: "حملات التسويق", body: "أرسل رسائل لعملائك المشتركين في العروض", path: "/marketing/campaigns", icon: Send, ready: true, color: "bg-sky-100 text-sky-700" },
  { title: "تحليلات الزيارات", body: "الزيارات ومصادرها والمنتجات الأكثر مشاهدة", path: "/marketing/analytics", icon: ChartLine, ready: true, color: "bg-violet-100 text-violet-700" },
  { title: "المناسبات القادمة", body: "مواسم البيع في السعودية لتجهيز عروضك مبكراً", path: "/marketing/occasions", icon: CalendarDays, ready: true, color: "bg-emerald-100 text-emerald-700" },
];

export default async function MarketingPage({ params }: PageProps<"/dashboard/[storeId]/marketing">) {
  const { storeId } = await params;
  await loadStore(storeId);
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold">التسويق</h1>
        <p className="text-sm text-ink-soft">أدوات لزيادة مبيعات متجرك</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {TOOLS.map((t) => {
          const Icon = t.icon;
          const inner = (
            <>
              <span className={`flex size-11 items-center justify-center rounded-xl ${t.color}`}>
                <Icon className="size-5" aria-hidden />
              </span>
              <span>
                <span className="flex items-center gap-2 font-semibold">
                  {t.title}
                  {!t.ready && <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-normal text-ink-soft">قريباً</span>}
                </span>
                <span className="block text-sm text-ink-soft">{t.body}</span>
              </span>
            </>
          );
          return t.ready ? (
            <Link key={t.title} href={`/dashboard/${storeId}${t.path}`} className="flex items-start gap-4 rounded-2xl border border-line bg-surface p-5 hover:border-brand">
              {inner}
            </Link>
          ) : (
            <div key={t.title} aria-disabled="true" className="flex items-start gap-4 rounded-2xl border border-line bg-surface p-5 opacity-70">
              {inner}
            </div>
          );
        })}
      </div>
    </div>
  );
}
