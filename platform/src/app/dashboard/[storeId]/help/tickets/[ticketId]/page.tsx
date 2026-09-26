import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { AppError } from "@/server/lib/errors";
import { getTicket, PRIORITY_LABELS, TICKET_CATEGORY_LABELS, TICKET_STATUS_LABELS } from "@/server/support/service";
import { loadStore } from "../../../access";
import { closeTicketAction } from "../../actions";
import { ReplyForm } from "../../forms";

export const metadata: Metadata = { title: "تذكرة دعم" };

const dateFmt = new Intl.DateTimeFormat("ar-SA-u-nu-latn-ca-gregory", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" });

export default async function TicketPage({ params }: PageProps<"/dashboard/[storeId]/help/tickets/[ticketId]">) {
  const { storeId, ticketId } = await params;
  const { session } = await loadStore(storeId);
  const { ticket, messages } = await getTicket(session.user.id, storeId, ticketId).catch((err) => {
    if (err instanceof AppError && err.code === "not_found") notFound();
    throw err;
  });
  const closed = ticket.status === "closed";

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <Link href={`/dashboard/${storeId}/help`} className="text-sm text-brand">
        → مركز المساعدة
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold">
          #{ticket.number} {ticket.subject}
        </h1>
        <Badge tone={closed ? "neutral" : ticket.status === "waiting_merchant" ? "warning" : "info"}>{TICKET_STATUS_LABELS[ticket.status]}</Badge>
      </div>
      <p className="text-sm text-ink-soft">
        {TICKET_CATEGORY_LABELS[ticket.category]} · أولوية {PRIORITY_LABELS[ticket.priority as 1 | 2 | 3 | 4]}
      </p>
      <ol className="flex flex-col gap-3">
        {messages.map((m) => (
          <li key={m.id} className={`max-w-[85%] rounded-2xl p-4 text-sm leading-7 ${m.authorType === "support" ? "self-end bg-brand-soft" : "self-start border border-line bg-surface"}`}>
            <p className="mb-1 text-xs font-semibold">{m.authorType === "support" ? "فريق الدعم" : "أنت"}</p>
            <p className="whitespace-pre-line">{m.body}</p>
            <p className="mt-1 text-[11px] text-ink-soft">{dateFmt.format(m.createdAt)}</p>
          </li>
        ))}
      </ol>
      {closed ? (
        <Card className="text-sm">
          التذكرة مغلقة{ticket.rating ? ` — تقييمك ${"★".repeat(ticket.rating)}` : ""}. إذا عادت المشكلة افتح تذكرة جديدة.
        </Card>
      ) : (
        <>
          <Card>
            <ReplyForm storeId={storeId} ticketId={ticket.id} />
          </Card>
          <Card>
            <form action={closeTicketAction.bind(null, storeId, ticket.id)} className="flex flex-wrap items-end gap-3">
              <fieldset className="flex flex-col gap-1">
                <legend className="mb-1 text-sm font-medium">تم حل المشكلة؟ قيّم الدعم وأغلق التذكرة</legend>
                <div className="flex gap-1" role="radiogroup">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <label key={n} className="cursor-pointer rounded-lg border border-line px-2.5 py-1 text-sm has-[:checked]:border-brand has-[:checked]:bg-brand-soft">
                      <input type="radio" name="rating" value={n} className="sr-only" />
                      {n}★
                    </label>
                  ))}
                </div>
              </fieldset>
              <SubmitButton tone="secondary" pendingText="جارٍ الإغلاق…">
                إغلاق التذكرة
              </SubmitButton>
            </form>
          </Card>
        </>
      )}
    </div>
  );
}
