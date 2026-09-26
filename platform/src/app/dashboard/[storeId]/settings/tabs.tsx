"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  ["", "عام"],
  ["/shipping", "الشحن"],
  ["/payments", "الدفع"],
  ["/tax", "الضريبة والبيانات النظامية"],
] as const;

export function SettingsTabs({ storeId }: { storeId: string }) {
  const pathname = usePathname();
  const base = `/dashboard/${storeId}/settings`;
  return (
    <nav className="flex gap-1 overflow-x-auto border-b border-line" aria-label="أقسام الإعدادات">
      {TABS.map(([path, label]) => (
        <Link
          key={path}
          href={base + path}
          aria-current={pathname === base + path ? "page" : undefined}
          className="shrink-0 border-b-2 border-transparent px-3 py-2 text-sm text-ink-soft aria-[current=page]:border-brand aria-[current=page]:font-semibold aria-[current=page]:text-ink"
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
