import type { Metadata } from "next";
import Link from "next/link";
import { Badge, ButtonLink, Card } from "@/components/ui";
import { listHelpArticlesAdmin } from "@/server/admin/support";
import { HELP_CATEGORY_LABELS } from "@/server/support/service";
import { loadAdmin } from "../access";

export const metadata: Metadata = { title: "مركز المساعدة" };

export default async function AdminHelpPage() {
  const { session } = await loadAdmin("content.manage");
  const rows = await listHelpArticlesAdmin(session.user.id);
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">مقالات مركز المساعدة</h1>
        <ButtonLink href="/admin/help/new">مقالة جديدة</ButtonLink>
      </div>
      <Card className="p-0">
        <ul className="divide-y divide-line">
          {rows.map((a) => (
            <li key={a.id}>
              <Link href={`/admin/help/${a.id}`} className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-muted">
                <span>
                  <span className="block font-medium">{a.title}</span>
                  <span className="block text-xs text-ink-soft">{HELP_CATEGORY_LABELS[a.category]}</span>
                </span>
                {!a.published && <Badge>مسودة</Badge>}
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
