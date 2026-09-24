import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui";
import { listCategories } from "@/server/catalog/categories";
import { roleHas } from "@/server/stores/permissions";
import { loadStore } from "../../access";
import { CategoryCreateForm, CategoryRow } from "./forms";

export const metadata: Metadata = { title: "التصنيفات" };

export default async function CategoriesPage({ params }: PageProps<"/dashboard/[storeId]/products/categories">) {
  const { storeId } = await params;
  const { session, access } = await loadStore(storeId);
  const categories = await listCategories(session.user.id, storeId);
  const canWrite = roleHas(access.role, "products.write");
  const topLevel = categories.filter((c) => !c.parentId);
  const ordered = topLevel.flatMap((parent) => [parent, ...categories.filter((c) => c.parentId === parent.id)]);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <div>
        <Link href={`/dashboard/${storeId}/products`} className="text-sm text-brand">
          → المنتجات
        </Link>
        <h1 className="mt-1 text-2xl font-bold">التصنيفات</h1>
        <p className="text-sm text-ink-soft">مستويان: تصنيف رئيسي (مثل «نسائي») وتصنيفات فرعية تحته (مثل «فساتين»).</p>
      </div>
      {canWrite && (
        <Card>
          <h2 className="mb-3 font-semibold">تصنيف جديد</h2>
          <CategoryCreateForm storeId={storeId} parents={topLevel.map((c) => ({ id: c.id, name: c.name }))} />
        </Card>
      )}
      <Card className="p-0">
        {ordered.length === 0 ? (
          <p className="p-6 text-center text-sm text-ink-soft">لا توجد تصنيفات بعد.</p>
        ) : (
          <ul className="divide-y divide-line">
            {ordered.map((c) => (
              <CategoryRow
                key={c.id}
                storeId={storeId}
                category={c}
                canWrite={canWrite}
                parents={topLevel.filter((p) => p.id !== c.id).map((p) => ({ id: p.id, name: p.name }))}
                hasChildren={categories.some((x) => x.parentId === c.id)}
              />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
