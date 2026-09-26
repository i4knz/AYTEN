"use client";

import {
  BadgePercent,
  Banknote,
  BookOpen,
  CreditCard,
  FileText,
  Gauge,
  Headset,
  Megaphone,
  ScrollText,
  Settings,
  ShieldCheck,
  Store,
  Users,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { AdminPermission } from "@/server/admin/access";

const ITEMS: { label: string; href: string; icon: LucideIcon; permission: AdminPermission }[] = [
  { label: "نظرة عامة", href: "/admin", icon: Gauge, permission: "stores.read" },
  { label: "المتاجر", href: "/admin/stores", icon: Store, permission: "stores.read" },
  { label: "التجار", href: "/admin/merchants", icon: Users, permission: "stores.read" },
  { label: "الفواتير والاشتراكات", href: "/admin/invoices", icon: FileText, permission: "billing.manage" },
  { label: "الباقات", href: "/admin/plans", icon: BadgePercent, permission: "billing.manage" },
  { label: "طلبات السحب", href: "/admin/payouts", icon: Banknote, permission: "payouts.manage" },
  { label: "بوابات الدفع والرسوم", href: "/admin/payments", icon: CreditCard, permission: "settings.manage" },
  { label: "تذاكر الدعم", href: "/admin/tickets", icon: Headset, permission: "support.manage" },
  { label: "مركز المساعدة", href: "/admin/help", icon: BookOpen, permission: "content.manage" },
  { label: "الإعلانات", href: "/admin/announcements", icon: Megaphone, permission: "content.manage" },
  { label: "إعدادات المنصة", href: "/admin/settings", icon: Settings, permission: "settings.manage" },
  { label: "سجل التدقيق", href: "/admin/audit", icon: ScrollText, permission: "audit.read" },
  { label: "المشرفون", href: "/admin/team", icon: ShieldCheck, permission: "admins.manage" },
];

export function AdminNav({ permissions, counts }: { permissions: readonly AdminPermission[]; counts: Partial<Record<string, number>> }) {
  const pathname = usePathname();
  const items = ITEMS.filter((i) => permissions.includes(i.permission));
  const active = items.filter((i) => (i.href === "/admin" ? pathname === "/admin" : pathname === i.href || pathname.startsWith(`${i.href}/`)))[0]?.href;
  return (
    <nav aria-label="أقسام إدارة المنصة" className="overflow-x-auto px-2 pb-4 md:px-3">
      <ul className="flex gap-1 md:flex-col">
        {items.map((item) => {
          const Icon = item.icon;
          const count = counts[item.href];
          return (
            <li key={item.href} className="shrink-0">
              <Link
                href={item.href}
                aria-current={active === item.href ? "page" : undefined}
                className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-slate-300 hover:bg-white/10 hover:text-white aria-[current=page]:bg-white aria-[current=page]:text-slate-900"
              >
                <Icon className="size-4.5 shrink-0" aria-hidden />
                <span className="flex-1 whitespace-nowrap">{item.label}</span>
                {!!count && <span className="rounded-full bg-amber-400 px-1.5 text-[11px] font-bold text-slate-900">{count}</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
