import type { Metadata } from "next";
import { roleHas } from "@/server/stores/permissions";
import { getStoreSettings } from "@/server/stores/service";
import { loadStore } from "../../access";
import { TaxForm } from "./tax-form";

export const metadata: Metadata = { title: "الضريبة" };

export default async function TaxPage({ params }: PageProps<"/dashboard/[storeId]/settings/tax">) {
  const { storeId } = await params;
  const { access } = await loadStore(storeId);
  const s = await getStoreSettings(access);
  return (
    <TaxForm
      storeId={storeId}
      canEdit={roleHas(access.role, "settings.write")}
      initial={{ taxEnabled: s.taxEnabled, pricesIncludeTax: s.pricesIncludeTax, vatNumber: s.vatNumber ?? "", commercialRegistration: s.commercialRegistration ?? "", requireEmail: s.checkout.requireEmail }}
    />
  );
}
