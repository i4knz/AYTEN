import { SettingsTabs } from "./tabs";

export default async function SettingsLayout({ children, params }: LayoutProps<"/dashboard/[storeId]/settings">) {
  const { storeId } = await params;
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <h1 className="text-2xl font-bold">إعدادات المتجر</h1>
      <SettingsTabs storeId={storeId} />
      {children}
    </div>
  );
}

