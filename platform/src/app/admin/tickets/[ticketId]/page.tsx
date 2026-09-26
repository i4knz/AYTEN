import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { Card, Select } from "@/components/ui";
import { getTicketAdmin } from "@/server/admin/support";
import { TICKET_STATUSES } from "@/server/db/schema";
import { AppError } from "@/server/lib/errors";
import { PRIORITY_LABELS, TICKET_CATEGORY_LABELS, TICKET_STATUS_LABELS } from "@/server/support/service";
import { loadAdmin } from "../../access";
import { replyTicketAdminAction, updateTicketAdminAction } from "../../actions";
import { dateTimeFmt } from "../../format";

export const metadata: Metadata = { title: "تذكرة" };

export default async function AdminTicketPage({ params }: PageProps<"/admin/tickets/[ticketId]">) {
  const { ticketId } = await params;
  const { session } = await loadAdmin("support.manage");
  const t = await getTicketAdmin(session.user.id, ticketId).catch((err) => {
    if (err instanceof AppError && err.code === "not_found") notFound();
    throw err;
  });
  return (
    <div className="mx-auto grid max-w-6xl gap-5 lg:grid-cols-[1fr_18rem]">
      <div className="flex flex-col gap-4">
        <Link href="/admin/tickets" className="text-sm text-brand">
          → التذاكر
        </Link>
        <div>
          <h1 className="text-xl font-bold">
            #{t.ticket.number} {t.ticket.subject}
          </h1>
          <p className="text-sm text-ink-soft">
            <Link href={`/admin/stores/${t.store.id}`} className="text-brand">
              {t.store.name}
            </Link>{" "}
            · {TICKET_CATEGORY_LABELS[t.ticket.category]}
            {t.ticket.rating && ` · تقييم التاجر ${t.ticket.rating}/5`}
          </p>
        </div>
        <ol className="flex flex-col gap-3">
          {t.messages.map(({ message: m, authorName }) => (
            <li
              key={m.id}
              className={`rounded-2xl p-4 text-sm leading-7 ${m.internal ? "border border-dashed border-amber-400 bg-amber-50" : m.authorType === "support" ? "bg-brand-soft" : "border border-line bg-surface"}`}
            >
              <p className="mb-1 text-xs font-semibold">
                {m.internal ? "ملاحظة داخلية — " : ""}
                {authorName ?? "—"} ({m.authorType === "support" ? "الدعم" : "التاجر"}) · {dateTimeFmt.format(m.createdAt)}
              </p>
              <p className="whitespace-pre-line">{m.body}</p>
            </li>
          ))}
        </ol>
        <Card>
          <ActionForm action={replyTicketAdminAction.bind(null, t.ticket.id)} submitLabel="إرسال">
            <label htmlFor="body" className="text-sm font-medium">
              الرد
            </label>
            <textarea id="body" name="body" rows={5} required className="w-full rounded-xl border border-line p-3 text-sm leading-7" />
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input type="checkbox" name="internal" className="size-4 accent-amber-500" /> ملاحظة داخلية (لا يراها التاجر)
              </label>
              <label className="flex items-center gap-2">
                الحالة بعد الرد
                <Select name="status" className="w-auto py-1.5" defaultValue="waiting_merchant">
                  <option value="waiting_merchant">بانتظار التاجر</option>
                  <option value="resolved">تم الحل</option>
                </Select>
              </label>
            </div>
          </ActionForm>
        </Card>
      </div>
      <aside className="flex flex-col gap-3 lg:pt-10">
        <Card>
          <ActionForm action={updateTicketAdminAction.bind(null, t.ticket.id)} submitLabel="تحديث" tone="secondary">
            <label className="flex flex-col gap-1 text-sm">
              الحالة
              <Select name="status" defaultValue={t.ticket.status}>
                {TICKET_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {TICKET_STATUS_LABELS[s]}
                  </option>
                ))}
              </Select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              الأولوية
              <Select name="priority" defaultValue={String(t.ticket.priority)}>
                {([1, 2, 3, 4] as const).map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_LABELS[p]}
                  </option>
                ))}
              </Select>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="assignToMe" className="size-4 accent-brand" defaultChecked={t.ticket.assigneeId === session.user.id} /> إسنادها لي
            </label>
          </ActionForm>
        </Card>
      </aside>
    </div>
  );
}
