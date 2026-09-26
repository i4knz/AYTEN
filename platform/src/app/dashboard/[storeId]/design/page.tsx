import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getStorefrontData, getThemeState } from "@/server/design/theme";
import { roleHas } from "@/server/stores/permissions";
import { getStoreSettings } from "@/server/stores/service";
import { storefrontUrl } from "@/server/urls";
import { loadStore } from "../access";
import { ThemeEditor } from "./editor";

export const metadata: Metadata = { title: "تصميم المتجر" };

export default async function DesignPage({ params }: PageProps<"/dashboard/[storeId]/design">) {
  const { storeId } = await params;
  const { access } = await loadStore(storeId);
  if (!roleHas(access.role, "design.write")) notFound();
  const [state, settings] = await Promise.all([getThemeState(access), getStoreSettings(access)]);
  const data = await getStorefrontData(storeId, { name: access.store.name, whatsapp: settings.whatsapp });
  const categories = data.categories.map((c) => ({ name: c.name, slug: c.slug }));
  return (
    <ThemeEditor
      storeId={storeId}
      storeName={access.store.name}
      storeUrl={storefrontUrl(access.store.slug)}
      initial={state.draft}
      hasDraft={state.hasDraft}
      data={data}
      categories={categories}
    />
  );
}
