import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui";
import { TICKET_CATEGORIES } from "@/server/db/schema";
import { PRIORITY_LABELS, TICKET_CATEGORY_LABELS, TICKET_PRIORITY } from "@/server/support/service";
import { loadStore } from "../../../access";
import { NewTicketForm } from "../../forms";

export const metadata: Metadata = { title: "تذكرة دعم جديدة" };

export default async function NewTicketPage({ params }: PageProps<"/dashboard/[storeId]/help/tickets/new">) {
  const { storeId } = await params;
  await loadStore(storeId);
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <Link href={`/dashboard/${storeId}/help`} className="text-sm text-brand">
        → مركز المساعدة
      </Link>
      <h1 className="text-2xl font-bold">تذكرة دعم جديدة</h1>
      <Card>
        <NewTicketForm
          storeId={storeId}
          categories={TICKET_CATEGORIES.map((c) => ({ value: c, label: TICKET_CATEGORY_LABELS[c], priority: PRIORITY_LABELS[TICKET_PRIORITY[c]] }))}
        />
      </Card>
    </div>
  );
}
