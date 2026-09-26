import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { logoutAction } from "@/app/(auth)/actions";
import { Badge } from "@/components/ui";
import { mediaUrl } from "@/server/catalog/images";
import { listOrders } from "@/server/commerce/orders";
import { listNotifications } from "@/server/notifications";
import { ROLE_LABELS, roleHas } from "@/server/stores/permissions";
import { getStoreSettings, listMyStores } from "@/server/stores/service";
import { storefrontUrl } from "@/server/urls";
import { loadStore } from "./access";
import { DashboardNav } from "./nav";
import { NotificationsMenu } from "./notifications-menu";

const STATUS_LABEL = { draft: "مسودة", published: "منشور", paused: "متوقف مؤقتاً", suspended: "موقوف" } as const;

export default async function StoreLayout({ children, params }: LayoutProps<"/dashboard/[storeId]">) {
  const { storeId } = await params;
  const { session, access } = await loadStore(storeId);
  const [stores, notifications, settings, orderCounts] = await Promise.all([
    listMyStores(session.user.id),
    listNotifications(session.user.id, storeId),
    getStoreSettings(access),
    roleHas(access.role, "orders.read") ? listOrders(session.user.id, storeId, { tab: "new" }).then((r) => r.counts) : Promise.resolve({ new: 0, processing: 0 }),
  ]);
  const store = access.store;
  const logo = mediaUrl(settings.logoUrl);
  const url = storefrontUrl(store.slug);

  return (
    <div className="flex min-h-full flex-1 flex-col md:flex-row">
      <aside className="border-b border-line bg-surface print:hidden md:sticky md:top-0 md:h-dvh md:w-64 md:shrink-0 md:overflow-y-auto md:border-b-0 md:border-e">
        <div className="flex items-center justify-between gap-2 p-4 md:block">
          <details className="group relative md:mb-2">
            <summary className="flex cursor-pointer list-none items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-muted">
              <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-brand text-sm font-bold text-white">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {logo ? <img src={logo} alt="" className="size-full bg-white object-contain" /> : store.name.slice(0, 1)}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">{store.name}</span>
                <span className="block text-xs text-ink-soft">{ROLE_LABELS[access.role]}</span>
              </span>
            </summary>
            <div className="absolute z-30 mt-2 w-60 rounded-xl border border-line bg-surface p-2 shadow-lg">
              <p className="px-2 py-1 text-xs text-ink-soft">متاجري</p>
              {stores.map((s) => (
                <Link
                  key={s.id}
                  href={`/dashboard/${s.id}`}
                  className="block truncate rounded-lg px-2 py-1.5 text-sm hover:bg-muted aria-[current=true]:bg-brand-soft"
                  aria-current={s.id === storeId}
                >
                  {s.name}
                </Link>
              ))}
              <Link href="/onboarding" className="mt-1 block rounded-lg px-2 py-1.5 text-sm text-brand hover:bg-muted">
                + متجر جديد
              </Link>
            </div>
          </details>
        </div>
        <DashboardNav storeId={storeId} newOrders={orderCounts.new} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex print:hidden flex-wrap items-center justify-between gap-3 border-b border-line bg-surface/95 px-4 py-3 backdrop-blur md:px-8">
          <div className="flex items-center gap-2">
            <Badge tone={store.status === "published" ? "success" : "warning"}>{STATUS_LABEL[store.status]}</Badge>
            <a href={url} target="_blank" rel="noopener" className="ltr flex items-center gap-1 text-sm text-brand hover:underline">
              {new URL(url).host}
              <ExternalLink className="size-3.5" aria-hidden />
            </a>
          </div>
          <div className="flex items-center gap-1">
            <NotificationsMenu
              storeId={storeId}
              unread={notifications.unread}
              items={notifications.items.map((n) => ({ id: n.id, title: n.title, body: n.body, link: n.link, read: !!n.readAt, createdAt: n.createdAt.toISOString() }))}
            />
            <details className="relative">
              <summary className="flex cursor-pointer list-none items-center gap-2 rounded-xl px-2 py-1.5 text-sm hover:bg-muted">
                <span className="flex size-8 items-center justify-center rounded-full bg-muted font-semibold">{session.user.name.slice(0, 1)}</span>
                <span className="hidden sm:inline">{session.user.name}</span>
              </summary>
              <div className="absolute end-0 z-30 mt-2 w-56 rounded-xl border border-line bg-surface p-2 shadow-lg">
                <p className="ltr truncate px-2 py-1 text-end text-xs text-ink-soft">{session.user.email}</p>
                <Link href="/account/security" className="block rounded-lg px-2 py-1.5 text-sm hover:bg-muted">
                  أمان الحساب
                </Link>
                <form action={logoutAction}>
                  <button type="submit" className="w-full rounded-lg px-2 py-1.5 text-start text-sm text-red-700 hover:bg-muted">
                    تسجيل الخروج
                  </button>
                </form>
              </div>
            </details>
          </div>
        </header>
        <main className="flex-1 px-4 py-6 md:px-8">{children}</main>
      </div>
    </div>
  );
}

