import { sql } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { logoutAction } from "@/app/(auth)/actions";
import { ADMIN_ROLE_LABELS } from "@/server/admin/access";
import { getAdminDb } from "@/server/admin/db";
import { loadAdmin } from "./access";
import { AdminNav } from "./nav";

export const metadata: Metadata = { title: { template: "%s · إدارة المنصة", default: "إدارة المنصة" }, robots: { index: false } };

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const { session, admin } = await loadAdmin();
  const [counts] = await getAdminDb()
    .select({
      invoices: sql<number>`(select count(*)::int from platform_invoices where status = 'issued')`,
      payouts: sql<number>`(select count(*)::int from payout_requests where status in ('pending', 'approved'))`,
      tickets: sql<number>`(select count(*)::int from support_tickets where status in ('open', 'waiting_support'))`,
    })
    .from(sql`(select 1) as one`);

  return (
    <div className="flex min-h-full flex-1 flex-col md:flex-row">
      <aside className="bg-slate-900 text-white print:hidden md:sticky md:top-0 md:h-dvh md:w-64 md:shrink-0 md:overflow-y-auto">
        <div className="flex items-center justify-between gap-2 p-4">
          <Link href="/admin" className="flex items-center gap-2">
            <span className="flex size-9 items-center justify-center rounded-lg bg-amber-400 font-bold text-slate-900">أ</span>
            <span>
              <span className="block text-sm font-bold">إدارة المنصة</span>
              <span className="block text-xs text-slate-400">{ADMIN_ROLE_LABELS[admin.role]}</span>
            </span>
          </Link>
        </div>
        <AdminNav permissions={admin.permissions} counts={{ "/admin/invoices": counts.invoices, "/admin/payouts": counts.payouts, "/admin/tickets": counts.tickets }} />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col bg-canvas">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-line bg-surface/95 px-4 py-3 backdrop-blur print:hidden md:px-8">
          <Link href="/dashboard" className="text-sm text-brand">
            ← لوحة متاجري
          </Link>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-ink-soft sm:inline">{session.user.email}</span>
            <form action={logoutAction}>
              <button type="submit" className="text-red-700">
                خروج
              </button>
            </form>
          </div>
        </header>
        <main className="flex-1 px-4 py-6 md:px-8">{children}</main>
      </div>
    </div>
  );
}
