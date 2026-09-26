import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { Card, Field, Input, Select } from "@/components/ui";
import { getHelpArticleAdmin } from "@/server/admin/support";
import { HELP_CATEGORIES } from "@/server/db/schema";
import { AppError } from "@/server/lib/errors";
import { HELP_CATEGORY_LABELS } from "@/server/support/service";
import { loadAdmin } from "../../access";
import { saveHelpArticleAction } from "../../actions";

export const metadata: Metadata = { title: "مقالة مساعدة" };

export default async function AdminHelpArticlePage({ params }: PageProps<"/admin/help/[articleId]">) {
  const { articleId } = await params;
  const { session } = await loadAdmin("content.manage");
  const a =
    articleId === "new"
      ? null
      : await getHelpArticleAdmin(session.user.id, articleId).catch((err) => {
          if (err instanceof AppError && err.code === "not_found") notFound();
          throw err;
        });
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <Link href="/admin/help" className="text-sm text-brand">
        → المقالات
      </Link>
      <h1 className="text-2xl font-bold">{a ? a.title : "مقالة جديدة"}</h1>
      <Card>
        <ActionForm action={saveHelpArticleAction.bind(null, a?.id ?? null)} submitLabel="حفظ">
          <Field label="العنوان" name="title">
            <Input id="title" name="title" required maxLength={150} defaultValue={a?.title} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="الرابط" name="slug">
              <Input id="slug" name="slug" required dir="ltr" defaultValue={a?.slug} />
            </Field>
            <Field label="التصنيف" name="category">
              <Select id="category" name="category" defaultValue={a?.category ?? "start"}>
                {HELP_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {HELP_CATEGORY_LABELS[c]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="الترتيب" name="position">
              <Input id="position" name="position" type="number" min={0} defaultValue={a?.position ?? 0} />
            </Field>
          </div>
          <Field label="المحتوى" name="body" hint="نص عادي؛ الأسطر الجديدة تظهر كما هي.">
            <textarea id="body" name="body" rows={14} required defaultValue={a?.body} className="w-full rounded-xl border border-line p-3 text-sm leading-7" />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="published" defaultChecked={a ? a.published : true} className="size-4 accent-brand" /> منشورة للتجار
          </label>
        </ActionForm>
      </Card>
    </div>
  );
}
