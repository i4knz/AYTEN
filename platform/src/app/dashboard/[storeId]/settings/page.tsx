import type { Metadata } from "next";
import { Alert, Card } from "@/components/ui";
import { roleHas } from "@/server/stores/permissions";
import { getStoreSettings } from "@/server/stores/service";
import { loadStore } from "../access";
import { LogoForm } from "./logo-form";
import { StoreProfileForm } from "./profile-form";
import { mediaUrl } from "@/server/catalog/images";

export const metadata: Metadata = { title: "إعدادات المتجر" };

export default async function SettingsPage({ params }: PageProps<"/dashboard/[storeId]/settings">) {
  const { storeId } = await params;
  const { access } = await loadStore(storeId);
  const settings = await getStoreSettings(access);
  const canEdit = roleHas(access.role, "settings.write");

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <h1 className="text-2xl font-bold">إعدادات المتجر</h1>
      {!canEdit && <Alert tone="info">يمكنك عرض الإعدادات فقط. التعديل متاح لمالك المتجر ومديره.</Alert>}
      <Card>
        <h2 className="mb-1 text-lg font-semibold">الشعار</h2>
        <p className="mb-4 text-xs text-ink-soft">صورة مربعة بخلفية واضحة. يُصغَّر تلقائياً إلى 512 بكسل.</p>
        <LogoForm storeId={storeId} canEdit={canEdit} logoUrl={mediaUrl(settings.logoUrl)} storeName={access.store.name} />
      </Card>
      <Card>
        <h2 className="mb-4 text-lg font-semibold">معلومات المتجر والتواصل</h2>
        <StoreProfileForm
          storeId={storeId}
          canEdit={canEdit}
          initial={{
            name: access.store.name,
            contactEmail: settings.contactEmail ?? "",
            contactPhone: settings.contactPhone ?? "",
            whatsapp: settings.whatsapp ?? "",
            brandColor: settings.brandColor,
          }}
        />
      </Card>
    </div>
  );
}
