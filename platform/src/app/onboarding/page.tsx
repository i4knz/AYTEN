import type { Metadata } from "next";
import Link from "next/link";
import { listMyStores } from "@/server/stores/service";
import { BUSINESS_TYPE_LABELS } from "@/server/stores/schemas";
import { requireSession } from "@/server/web";
import { CreateStoreForm } from "./create-store-form";

export const metadata: Metadata = { title: "إنشاء متجر" };

export default async function OnboardingPage() {
  const session = await requireSession("/onboarding");
  const stores = await listMyStores(session.user.id);
  const rootDomain = process.env.STOREFRONT_ROOT_DOMAIN ?? "localhost:3000";
  return (
    <main className="flex flex-1 flex-col items-center px-4 py-10">
      <div className="w-full max-w-lg">
        <p className="mb-2 text-sm text-ink-soft">مرحباً {session.user.name} 👋</p>
        <h1 className="mb-1 text-2xl font-bold">لنُنشئ متجرك</h1>
        <p className="mb-6 text-sm leading-7 text-ink-soft">
          نحتاج ثلاث معلومات فقط الآن. الشعار والتواصل والمنتجات تضيفها لاحقاً من لوحة التحكم.
        </p>
        <CreateStoreForm rootDomain={rootDomain} businessTypes={Object.entries(BUSINESS_TYPE_LABELS)} />
        {stores.length > 0 && (
          <p className="mt-6 text-center text-sm">
            <Link href="/dashboard" className="text-brand">
              العودة إلى متاجري
            </Link>
          </p>
        )}
      </div>
    </main>
  );
}
