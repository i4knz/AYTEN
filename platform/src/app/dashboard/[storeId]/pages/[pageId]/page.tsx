import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPage } from "@/server/design/pages";
import { roleHas } from "@/server/stores/permissions";
import { storefrontUrl } from "@/server/urls";
import { loadStore } from "../../access";
import { PageForm } from "../page-form";

export const metadata: Metadata = { title: "تعديل صفحة" };

export default async function EditPage({ params }: PageProps<"/dashboard/[storeId]/pages/[pageId]">) {
  const { storeId, pageId } = await params;
  const { session, access } = await loadStore(storeId);
  if (!roleHas(access.role, "design.write")) notFound();
  const page = pageId === "new" ? null : await getPage(session.user.id, storeId, pageId);
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <div>
        <Link href={`/dashboard/${storeId}/pages`} className="text-sm text-brand">→ الصفحات</Link>
        <h1 className="mt-1 text-2xl font-bold">{page ? page.title : "صفحة جديدة"}</h1>
      </div>
      <PageForm
        storeId={storeId}
        pageId={page?.id ?? null}
        storeUrl={storefrontUrl(access.store.slug)}
        initial={page ? { title: page.title, slug: page.slug, body: page.body, published: page.published, showInFooter: page.showInFooter } : { title: "", slug: "", body: "", published: true, showInFooter: true }}
      />
    </div>
  );
}
