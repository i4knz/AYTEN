import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, Tabs } from "@/components/ui";
import { listTicketQueue } from "@/server/admin/support";
import { PRIORITY_LABELS, TICKET_CATEGORY_LABELS, TICKET_STATUS_LABELS } from "@/server/support/service";
import { loadAdmin } from "../access";
import { dateTimeFmt } from "../format";

export const metadata: Metadata = { title: "تذاكر الدعم" };

const PRIORITY_TONE = { 1: "danger", 2: "warning", 3: "info", 4: "neutral" } as const;

export default async function AdminTicketsPage({ searchParams }: PageProps<"/admin/tickets">) {
  const { session } = await loadAdmin("support.manage");
  const sp = await searchParams;
  const filter = typeof sp.status === "string" ? sp.status : "active";
  const rows = await listTicketQueue(session.user.id, filter);
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold">تذاكر الدعم</h1>
        <p className="text-sm text-ink-soft">مرتبة حسب الأولوية ثم الأقدم انتظاراً. الأولوية تُحدد تلقائياً من أثر المشكلة على مبيعات التاجر.</p>
      </div>
      <Tabs
        current={filter}
        items={[
          { key: "active", label: "بانتظار الدعم", href: "/admin/tickets?status=active" },
          { key: "waiting_merchant", label: "بانتظار التاجر", href: "/admin/tickets?status=waiting_merchant" },
          { key: "resolved", label: "محلولة", href: "/admin/tickets?status=resolved" },
          { key: "closed", label: "مغلقة", href: "/admin/tickets?status=closed" },
          { key: "all", label: "الكل", href: "/admin/tickets?status=all" },
        ]}
      />
      <Card className="p-0">
        {rows.length === 0 ? (
          <p className="p-6 text-center text-sm text-ink-soft">لا توجد تذاكر هنا. 🎉</p>
        ) : (
          <ul className="divide-y divide-line">
            {rows.map(({ ticket: t, storeName, assignee }) => (
              <li key={t.id}>
                <Link href={`/admin/tickets/${t.id}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-muted">
                  <span className="min-w-0">
                    <span className="block font-medium">
                      #{t.number} {t.subject}
                    </span>
                    <span className="block text-xs text-ink-soft">
                      {storeName} · {TICKET_CATEGORY_LABELS[t.category]} · آخر تحديث {dateTimeFmt.format(t.updatedAt)}
                      {assignee && ` · مسندة إلى ${assignee}`}
                    </span>
                  </span>
                  <span className="flex gap-2">
                    <Badge tone={PRIORITY_TONE[t.priority as 1]}>{PRIORITY_LABELS[t.priority as 1]}</Badge>
                    <Badge>{TICKET_STATUS_LABELS[t.status]}</Badge>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
