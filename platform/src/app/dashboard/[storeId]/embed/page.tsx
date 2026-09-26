import type { Metadata } from "next";
import { Card } from "@/components/ui";
import { listProducts } from "@/server/catalog/products";
import { getStoreTracking } from "@/server/design/settings";
import { roleHas } from "@/server/stores/permissions";
import { storefrontUrl } from "@/server/urls";
import { loadStore } from "../access";
import { EmbedSnippet, TrackingForm } from "./forms";

export const metadata: Metadata = { title: "التضمين" };

export default async function EmbedPage({ params }: PageProps<"/dashboard/[storeId]/embed">) {
  const { storeId } = await params;
  const { session, access } = await loadStore(storeId);
  const [{ tracking }, products] = await Promise.all([getStoreTracking(storeId), listProducts(session.user.id, storeId, { status: "active" })]);
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold">التضمين</h1>
        <p className="text-sm text-ink-soft">اربط أدوات القياس والإعلانات، وضع أزرار شراء منتجاتك في مواقع أخرى.</p>
      </div>
      <Card>
        <h2 className="mb-1 font-semibold">أدوات القياس والإعلانات</h2>
        <p className="mb-4 text-xs leading-6 text-ink-soft">
          أدخل المعرّف فقط. نضيف الكود الرسمي تلقائياً، ولا يُحمَّل إلا بعد موافقة الزائر على ملفات تعريف الارتباط التسويقية. نرسل حدث الشراء (Purchase) عند اكتمال الطلب.
        </p>
        <TrackingForm storeId={storeId} initial={{ ...tracking }} canEdit={roleHas(access.role, "marketing.write")} />
      </Card>
      <Card>
        <h2 className="mb-1 font-semibold">زر شراء لموقعك أو مدونتك</h2>
        <p className="mb-4 text-xs text-ink-soft">انسخ الكود والصقه في أي صفحة HTML ليظهر زر يفتح المنتج في متجرك.</p>
        <EmbedSnippet storeUrl={storefrontUrl(access.store.slug)} products={products.rows.map((p) => ({ name: p.name, slug: p.slug }))} />
      </Card>
    </div>
  );
}
