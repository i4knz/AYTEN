"use client";

import {
  ArrowLeftRight,
  Boxes,
  ChartColumn,
  Code,
  CreditCard,
  FileText,
  Gift,
  House,
  Layers,
  LifeBuoy,
  Megaphone,
  Package,
  Palette,
  Puzzle,
  Settings,
  ShoppingBag,
  Star,
  Store,
  UserCog,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = { label: string; path: string; icon: LucideIcon; ready: boolean; badge?: number };

// Sections whose feature is not built yet are shown as "coming soon" and are
// not links, so nothing in the UI pretends to work.
function storeItems(counts: { newOrders: number }): Item[] {
  return [
    { label: "الرئيسية", path: "", icon: House, ready: true },
    { label: "الطلبات", path: "/orders", icon: ShoppingBag, ready: true, badge: counts.newOrders },
    { label: "المنتجات", path: "/products", icon: Package, ready: true },
    { label: "الأقسام", path: "/products/categories", icon: Layers, ready: true },
    { label: "المخزون", path: "/inventory", icon: Boxes, ready: true },
    { label: "العملاء", path: "/customers", icon: Users, ready: true },
    { label: "التسويق", path: "/marketing", icon: Megaphone, ready: true },
    { label: "الصفحات", path: "/pages", icon: FileText, ready: true },
    { label: "التقييمات", path: "/reviews", icon: Star, ready: true },
    { label: "التقارير", path: "/reports", icon: ChartColumn, ready: true },
    { label: "العمليات", path: "/wallet", icon: ArrowLeftRight, ready: false },
    { label: "طلبات السحب", path: "/wallet/withdrawals", icon: Wallet, ready: false },
    { label: "الموظفين", path: "/team", icon: UserCog, ready: true },
    { label: "تصميم المتجر", path: "/design", icon: Palette, ready: true },
    { label: "التضمين", path: "/embed", icon: Code, ready: true },
    { label: "المزايا", path: "/features", icon: Puzzle, ready: true },
    { label: "الاشتراك", path: "/billing", icon: CreditCard, ready: false },
    { label: "إعدادات المتجر", path: "/settings", icon: Settings, ready: true },
  ];
}

const PLATFORM_ITEMS: { label: string; href: string; icon: LucideIcon; ready: boolean }[] = [
  { label: "متجر التطبيقات", href: "/apps", icon: Store, ready: false },
  { label: "برنامج الإحالات", href: "/referrals", icon: Gift, ready: false },
  { label: "مركز المساعدة", href: "/help", icon: LifeBuoy, ready: false },
];

const linkCls =
  "flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-ink-soft hover:bg-muted hover:text-ink aria-[current=page]:bg-brand-soft aria-[current=page]:text-brand-strong";

export function DashboardNav({ storeId, newOrders = 0 }: { storeId: string; newOrders?: number }) {
  const pathname = usePathname();
  const base = `/dashboard/${storeId}`;
  const items = storeItems({ newOrders });
  // The most specific matching path wins (e.g. /products/categories over /products).
  const activePath = items
    .filter((i) => (i.path ? pathname === base + i.path || pathname.startsWith(`${base + i.path}/`) : pathname === base))
    .sort((a, b) => b.path.length - a.path.length)[0]?.path;

  return (
    <nav aria-label="أقسام لوحة التحكم" className="flex flex-col gap-4 overflow-x-auto px-2 pb-4 md:px-3">
      <ul className="flex gap-1 md:flex-col">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <li key={item.label} className="shrink-0">
              {item.ready ? (
                <Link href={base + item.path} aria-current={activePath === item.path ? "page" : undefined} className={linkCls}>
                  <Icon className="size-4.5 shrink-0" aria-hidden />
                  <span className="flex-1 whitespace-nowrap">{item.label}</span>
                  {!!item.badge && <span className="rounded-full bg-brand px-1.5 text-[11px] text-white">{item.badge}</span>}
                </Link>
              ) : (
                <span aria-disabled="true" className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-ink-faint">
                  <Icon className="size-4.5 shrink-0" aria-hidden />
                  <span className="flex-1 whitespace-nowrap">{item.label}</span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px]">قريباً</span>
                </span>
              )}
            </li>
          );
        })}
      </ul>
      <div className="hidden md:block">
        <p className="mb-1 px-3 text-xs font-semibold text-brand">المنصة</p>
        <ul className="flex flex-col gap-1">
          {PLATFORM_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.label}>
                {item.ready ? (
                  <Link href={item.href} className={linkCls}>
                    <Icon className="size-4.5" aria-hidden />
                    {item.label}
                  </Link>
                ) : (
                  <span aria-disabled="true" className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-ink-faint">
                    <Icon className="size-4.5" aria-hidden />
                    <span className="flex-1">{item.label}</span>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px]">قريباً</span>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
