import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card } from "@/components/ui";
import { listPages, PAGE_TEMPLATES, type PageTemplate } from "@/server/design/pages";
import { roleHas } from "@/server/stores/permissions";
import { loadStore } from "../access";
import { TemplateButton } from "./template-button";

export const metadata: Metadata = { title: "الصفحات" };

export default async function PagesPage({ params }: PageProps<"/dashboard/[storeId]/pages">) {
  const { storeId } = await params;
  const { session, access } = await loadStore(storeId);
  const pages = await listPages(session.user.id, storeId);
  const canWrite = roleHas(access.role, "design.write");
  const existing = new Set(pages.map((p) => p.slug));
  const missing = (Object.keys(PAGE_TEMPLATES) as PageTemplate[]).filter((t) => !existing.has(t));
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">الصفحات</h1>
          <p className="text-sm text-ink-soft">صفحات تعريفية وسياسات تظهر في تذييل المتجر.</p>
        </div>
        {canWrite && (
          <Link href={`/dashboard/${storeId}/pages/new`} className="rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white">
            + صفحة جديدة
          </Link>
        )}
      </div>
      {canWrite && missing.length > 0 && (
        <Card className="flex flex-col gap-3">
          <h2 className="font-semibold">ابدأ من نموذج</h2>
          <p className="text-xs text-ink-soft">نماذج مبدئية تُنشأ كمسودة لتعدّلها بما يناسب نشاطك. ليست استشارة قانونية؛ ولا يجوز أن تنتقص سياستك من حقوق المستهلك النظامية.</p>
          <div className="flex flex-wrap gap-2">
            {missing.map((t) => (
              <TemplateButton key={t} storeId={storeId} template={t} label={PAGE_TEMPLATES[t].title} />
            ))}
          </div>
        </Card>
      )}
      <Card className="p-0">
        {pages.length === 0 ? (
          <p className="p-6 text-center text-sm text-ink-soft">لا توجد صفحات بعد.</p>
        ) : (
          <ul className="divide-y divide-line">
            {pages.map((p) => (
              <li key={p.id}>
                <Link href={`/dashboard/${storeId}/pages/${p.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/60">
                  <span className="font-medium">{p.title}</span>
                  <span className="flex gap-2">
                    {p.showInFooter && <Badge>في التذييل</Badge>}
                    <Badge tone={p.published ? "success" : "warning"}>{p.published ? "منشورة" : "مسودة"}</Badge>
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
