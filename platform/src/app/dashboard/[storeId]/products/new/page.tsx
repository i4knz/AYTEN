import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { listCategories } from "@/server/catalog/categories";
import { roleHas } from "@/server/stores/permissions";
import { storefrontUrl } from "@/server/urls";
import { loadStore } from "../../access";
import { emptyProduct, ProductForm } from "../product-form";

export const metadata: Metadata = { title: "منتج جديد" };

export default async function NewProductPage({ params }: PageProps<"/dashboard/[storeId]/products/new">) {
  const { storeId } = await params;
  const { session, access } = await loadStore(storeId);
  if (!roleHas(access.role, "products.write")) notFound();
  const categories = await listCategories(session.user.id, storeId);
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <div>
        <Link href={`/dashboard/${storeId}/products`} className="text-sm text-brand">
          → المنتجات
        </Link>
        <h1 className="mt-1 text-2xl font-bold">منتج جديد</h1>
      </div>
      <ProductForm
        storeId={storeId}
        productId={null}
        initial={emptyProduct}
        categories={categories}
        canAdjustStock={roleHas(access.role, "inventory.write")}
        storefrontBase={storefrontUrl(access.store.slug)}
      />
    </div>
  );
}
