import type { Metadata } from "next";
import Link from "next/link";
import { Alert, Badge, Card } from "@/components/ui";
import { listCategories } from "@/server/catalog/categories";
import { mediaUrl } from "@/server/catalog/images";
import { getProduct } from "@/server/catalog/products";
import { MAX_IMAGES } from "@/server/catalog/schemas";
import { toMajorString } from "@/server/lib/money";
import { roleHas } from "@/server/stores/permissions";
import { storefrontUrl } from "@/server/urls";
import { loadStore } from "../../access";
import { ProductForm, type ProductFormValues } from "../product-form";
import { ProductImages } from "./images";
import { ProductStatusActions } from "./status-actions";

export const metadata: Metadata = { title: "تعديل المنتج" };

export default async function EditProductPage({ params, searchParams }: PageProps<"/dashboard/[storeId]/products/[productId]">) {
  const { storeId, productId } = await params;
  const { saved } = await searchParams;
  const { session, access } = await loadStore(storeId);
  const [data, categories] = await Promise.all([getProduct(session.user.id, storeId, productId), listCategories(session.user.id, storeId)]);
  const { product, options, variants, images, categoryIds } = data;
  const canWrite = roleHas(access.role, "products.write");
  const storeBase = storefrontUrl(access.store.slug);

  const initial: ProductFormValues = {
    name: product.name,
    slug: product.slug,
    description: product.description,
    status: product.status === "archived" ? "draft" : product.status,
    categoryIds,
    seoTitle: product.seoTitle ?? "",
    seoDescription: product.seoDescription ?? "",
    options: options.map((o) => ({ name: o.name, values: o.values })),
    variants: variants.map(({ variant, level }) => ({
      id: variant.id,
      optionValues: [variant.option1, variant.option2, variant.option3].filter((v): v is string => v !== null),
      price: toMajorString(variant.price),
      compareAtPrice: toMajorString(variant.compareAtPrice),
      cost: toMajorString(variant.cost),
      sku: variant.sku ?? "",
      trackInventory: level?.trackInventory ?? true,
      quantity: level ? String(level.onHand) : "",
    })),
  };

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href={`/dashboard/${storeId}/products`} className="text-sm text-brand">
            → المنتجات
          </Link>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold">
            {product.name}
            {product.status === "archived" && <Badge>مؤرشف</Badge>}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          {product.status === "active" && (
            <a href={`${storeBase}/products/${encodeURIComponent(product.slug)}`} target="_blank" rel="noopener" className="text-sm text-brand">
              عرض في المتجر ↗
            </a>
          )}
          {canWrite && <ProductStatusActions storeId={storeId} productId={productId} status={product.status} />}
        </div>
      </div>
      {saved === "1" && <Alert tone="success">تم حفظ المنتج.</Alert>}

      <Card>
        <h2 className="mb-1 font-semibold">الصور</h2>
        <p className="mb-4 text-xs text-ink-soft">
          حتى {MAX_IMAGES} صور، 8 ميجابايت للصورة. الصورة الأولى تظهر في قوائم المنتجات. نحوّل الصور تلقائياً إلى صيغة أخف ونزيل بيانات الموقع منها.
        </p>
        <ProductImages
          storeId={storeId}
          productId={productId}
          canWrite={canWrite}
          images={images.map((i) => ({ id: i.id, url: mediaUrl(i.storageKey)!, alt: i.alt }))}
        />
      </Card>

      {canWrite ? (
        <ProductForm
          storeId={storeId}
          productId={productId}
          initial={initial}
          categories={categories}
          canAdjustStock={roleHas(access.role, "inventory.write")}
          storefrontBase={storeBase}
        />
      ) : (
        <Alert tone="info">لديك صلاحية العرض فقط لهذا المنتج.</Alert>
      )}
    </div>
  );
}
