import { BookOpen, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Badge, ButtonLink, Card, Input } from "@/components/ui";
import { HELP_CATEGORIES } from "@/server/db/schema";
import { getPlatformSettings } from "@/server/platform/settings";
import { HELP_CATEGORY_LABELS, listHelpArticles, listTickets, TICKET_STATUS_LABELS } from "@/server/support/service";
import { loadStore } from "../access";

export const metadata: Metadata = { title: "مركز المساعدة" };

const STATUS_TONE = { open: "info", waiting_support: "info", waiting_merchant: "warning", resolved: "success", closed: "neutral" } as const;

export default async function HelpPage({ params, searchParams }: PageProps<"/dashboard/[storeId]/help">) {
  const { storeId } = await params;
  const sp = await searchParams;
  const { session } = await loadStore(storeId);
  const q = typeof sp.q === "string" ? sp.q : "";
  const category = typeof sp.category === "string" ? sp.category : "";
  const [articles, tickets, settings] = await Promise.all([listHelpArticles({ q, category }), listTickets(session.user.id, storeId), getPlatformSettings()]);
  const base = `/dashboard/${storeId}/help`;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5">
      <div className="rounded-3xl bg-gradient-to-l from-brand to-brand-strong p-6 text-white md:p-8">
        <h1 className="text-2xl font-bold">كيف نقدر نساعدك؟</h1>
        <form className="mt-4 flex max-w-xl gap-2" role="search">
          <label htmlFor="help-q" className="sr-only">
            ابحث في المقالات
          </label>
          <Input id="help-q" name="q" defaultValue={q} placeholder="مثال: الشحن، السحب، الكوبونات" className="border-0 text-ink" />
          <button type="submit" className="flex items-center gap-1 rounded-xl bg-white/15 px-4 text-sm font-semibold hover:bg-white/25">
            <Search className="size-4" aria-hidden />
            بحث
          </button>
        </form>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
        <div className="flex flex-col gap-4">
          <nav className="flex flex-wrap gap-2" aria-label="التصنيفات">
            <Link href={base} aria-current={!category ? "page" : undefined} className="rounded-full border border-line px-3 py-1 text-sm aria-[current=page]:bg-ink aria-[current=page]:text-white">
              الكل
            </Link>
            {HELP_CATEGORIES.map((c) => (
              <Link key={c} href={`${base}?category=${c}`} aria-current={category === c ? "page" : undefined} className="rounded-full border border-line px-3 py-1 text-sm aria-[current=page]:bg-ink aria-[current=page]:text-white">
                {HELP_CATEGORY_LABELS[c]}
              </Link>
            ))}
          </nav>
          {articles.length === 0 ? (
            <Card className="text-center text-sm text-ink-soft">لا توجد مقالات مطابقة. افتح تذكرة وسنساعدك مباشرة.</Card>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {articles.map((a) => (
                <li key={a.id}>
                  <Link href={`${base}/articles/${encodeURIComponent(a.slug)}`} className="flex h-full flex-col gap-1 rounded-2xl border border-line bg-surface p-4 hover:border-brand">
                    <span className="flex items-center gap-2 text-xs text-brand">
                      <BookOpen className="size-3.5" aria-hidden />
                      {HELP_CATEGORY_LABELS[a.category]}
                    </span>
                    <span className="font-semibold">{a.title}</span>
                    <span className="line-clamp-2 text-sm text-ink-soft">{a.excerpt.replace(/\s+/g, " ")}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <aside className="flex flex-col gap-4">
          <Card className="flex flex-col gap-3">
            <h2 className="font-semibold">تذاكر الدعم</h2>
            <ButtonLink href={`${base}/tickets/new`}>فتح تذكرة جديدة</ButtonLink>
            {tickets.length > 0 && (
              <ul className="flex flex-col divide-y divide-line text-sm">
                {tickets.map((t) => (
                  <li key={t.id}>
                    <Link href={`${base}/tickets/${t.id}`} className="flex items-center justify-between gap-2 py-2">
                      <span className="min-w-0 truncate">
                        #{t.number} {t.subject}
                      </span>
                      <Badge tone={STATUS_TONE[t.status]}>{TICKET_STATUS_LABELS[t.status]}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          {(settings.support.email || settings.support.whatsapp) && (
            <Card className="text-sm">
              <h2 className="mb-2 font-semibold">تواصل مباشر</h2>
              {settings.support.whatsapp && (
                <a href={`https://wa.me/${settings.support.whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noopener" className="block text-brand">
                  واتساب الدعم
                </a>
              )}
              {settings.support.email && (
                <a href={`mailto:${settings.support.email}`} className="ltr block text-end text-brand">
                  {settings.support.email}
                </a>
              )}
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}
