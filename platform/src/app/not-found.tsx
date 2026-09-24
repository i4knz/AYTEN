import { ButtonLink } from "@/components/ui";

export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      <p className="text-5xl font-bold text-brand">404</p>
      <h1 className="text-xl font-semibold">الصفحة غير موجودة</h1>
      <p className="text-sm text-ink-soft">ربما تغيّر الرابط أو ليست لديك صلاحية الوصول إليه.</p>
      <ButtonLink href="/" tone="secondary">
        العودة للرئيسية
      </ButtonLink>
    </main>
  );
}
