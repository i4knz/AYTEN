import Link from "next/link";
import { logoutAction } from "@/app/(auth)/actions";
import { Badge } from "@/components/ui";
import { listMyStores } from "@/server/stores/service";
import { ROLE_LABELS } from "@/server/stores/permissions";
import { storefrontUrl } from "@/server/urls";
import { loadStore } from "./access";
import { DashboardNav } from "./nav";

const STATUS_LABEL = { draft: "مسودة", published: "منشور", paused: "متوقف مؤقتاً", suspended: "موقوف" } as const;

export default async function StoreLayout({ children, params }: LayoutProps<"/dashboard/[storeId]">) {
  const { storeId } = await params;
  const { session, access } = await loadStore(storeId);
  const stores = await listMyStores(session.user.id);
  const store = access.store;

  return (
    <div className="flex min-h-full flex-1 flex-col md:flex-row">
      <aside className="border-b border-line bg-surface md:sticky md:top-0 md:h-dvh md:w-64 md:shrink-0 md:border-b-0 md:border-e">
        <div className="flex items-center justify-between gap-2 p-4 md:block">
          <details className="group relative md:mb-2">
            <summary className="flex cursor-pointer list-none items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-muted">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand text-sm font-bold text-white">
                {store.name.slice(0, 1)}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">{store.name}</span>
                <span className="block text-xs text-ink-soft">{ROLE_LABELS[access.role]}</span>
              </span>
            </summary>
            <div className="absolute z-20 mt-2 w-60 rounded-xl border border-line bg-surface p-2 shadow-lg">
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
        <DashboardNav storeId={storeId} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-surface px-4 py-3 md:px-8">
          <div className="flex items-center gap-2">
            <Badge tone={store.status === "published" ? "success" : "warning"}>{STATUS_LABEL[store.status]}</Badge>
            <a href={storefrontUrl(store.slug)} target="_blank" rel="noopener" className="ltr text-sm text-brand hover:underline">
              {new URL(storefrontUrl(store.slug)).host}
            </a>
          </div>
          <details className="relative">
            <summary className="flex cursor-pointer list-none items-center gap-2 rounded-xl px-2 py-1.5 text-sm hover:bg-muted">
              <span className="flex size-8 items-center justify-center rounded-full bg-muted font-semibold">
                {session.user.name.slice(0, 1)}
              </span>
              <span className="hidden sm:inline">{session.user.name}</span>
            </summary>
            <div className="absolute end-0 z-20 mt-2 w-56 rounded-xl border border-line bg-surface p-2 shadow-lg">
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
        </header>
        <main className="flex-1 px-4 py-6 md:px-8">{children}</main>
      </div>
    </div>
  );
}
