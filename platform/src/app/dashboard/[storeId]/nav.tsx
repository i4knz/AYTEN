"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Sections whose feature is not built yet are shown as "coming soon" and are
// not links, so nothing in the UI pretends to work.
const ITEMS: { label: string; path: string; ready: boolean }[] = [
  { label: "الرئيسية", path: "", ready: true },
  { label: "الطلبات", path: "/orders", ready: false },
  { label: "المنتجات", path: "/products", ready: true },
  { label: "المخزون", path: "/inventory", ready: true },
  { label: "العملاء", path: "/customers", ready: false },
  { label: "تصميم المتجر", path: "/design", ready: false },
  { label: "الفريق", path: "/team", ready: true },
  { label: "الإعدادات", path: "/settings", ready: true },
];

export function DashboardNav({ storeId }: { storeId: string }) {
  const pathname = usePathname();
  const base = `/dashboard/${storeId}`;
  return (
    <nav aria-label="أقسام لوحة التحكم" className="overflow-x-auto px-2 pb-2 md:px-3">
      <ul className="flex gap-1 md:flex-col">
        {ITEMS.map((item) => {
          const href = base + item.path;
          const active = item.path ? pathname.startsWith(href) : pathname === base;
          return (
            <li key={item.label} className="shrink-0">
              {item.ready ? (
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className="block rounded-xl px-3 py-2 text-sm font-medium text-ink-soft hover:bg-muted hover:text-ink aria-[current=page]:bg-brand-soft aria-[current=page]:text-brand-strong"
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  aria-disabled="true"
                  className="flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm text-ink-faint"
                >
                  {item.label}
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px]">قريباً</span>
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
