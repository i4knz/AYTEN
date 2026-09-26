import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui";
import { getHelpArticle, HELP_CATEGORY_LABELS } from "@/server/support/service";
import { loadStore } from "../../../access";

export const metadata: Metadata = { title: "مقالة مساعدة" };

export default async function HelpArticlePage({ params }: PageProps<"/dashboard/[storeId]/help/articles/[slug]">) {
  const { storeId, slug } = await params;
  await loadStore(storeId);
  let decoded = slug;
  try {
    decoded = decodeURIComponent(slug);
  } catch {}
  const article = await getHelpArticle(decoded);
  if (!article) notFound();
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <Link href={`/dashboard/${storeId}/help`} className="text-sm text-brand">
        → مركز المساعدة
      </Link>
      <Card>
        <p className="text-xs text-brand">{HELP_CATEGORY_LABELS[article.category]}</p>
        <h1 className="mt-1 text-2xl font-bold">{article.title}</h1>
        <div className="mt-4 whitespace-pre-line leading-8">{article.body}</div>
      </Card>
      <Card className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm">لم تجد الحل؟</p>
        <Link href={`/dashboard/${storeId}/help/tickets/new`} className="text-sm font-semibold text-brand">
          افتح تذكرة دعم
        </Link>
      </Card>
    </div>
  );
}
