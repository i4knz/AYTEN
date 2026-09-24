import { ButtonLink, Card } from "@/components/ui";
import { getCurrentSession } from "@/server/web";

const STEPS = [
  { title: "أنشئ حسابك", body: "بالبريد الإلكتروني خلال دقيقة." },
  { title: "سمِّ متجرك واختر رابطه", body: "رابط خاص بك مثل yourstore.ayten…" },
  { title: "أضف منتجاتك وشارك الرابط", body: "مع عملائك على واتساب وإنستغرام." },
];

export default async function HomePage() {
  const session = await getCurrentSession();
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 py-10 sm:py-16">
      <header className="mb-14 flex items-center justify-between gap-4">
        <span className="text-lg font-bold text-brand">Ayten Commerce</span>
        <nav className="flex items-center gap-2">
          {session ? (
            <ButtonLink href="/dashboard">لوحة التحكم</ButtonLink>
          ) : (
            <>
              <ButtonLink href="/login" tone="ghost">
                تسجيل الدخول
              </ButtonLink>
              <ButtonLink href="/register">أنشئ متجرك</ButtonLink>
            </>
          )}
        </nav>
      </header>

      <section className="mb-14 max-w-2xl">
        <p className="mb-4 inline-flex rounded-full bg-brand-soft px-3 py-1 text-xs font-semibold text-brand-strong">
          نسخة تجريبية مبكرة — نبنيها مع أول التجار
        </p>
        <h1 className="mb-5 text-3xl font-bold leading-tight sm:text-5xl sm:leading-tight">
          متجرك الإلكتروني جاهز خلال دقائق، بدون مطوّر
        </h1>
        <p className="mb-8 text-lg leading-8 text-ink-soft">
          أنشئ متجراً مستقلاً برابط خاص، وأدِر منتجاتك وطلباتك وفريقك من لوحة واحدة باللغة العربية.
        </p>
        <ButtonLink href={session ? "/dashboard" : "/register"} className="px-6 py-3 text-base">
          {session ? "انتقل إلى متجرك" : "ابدأ مجاناً خلال الفترة التجريبية"}
        </ButtonLink>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        {STEPS.map((s, i) => (
          <Card key={s.title}>
            <span className="mb-3 flex size-8 items-center justify-center rounded-full bg-brand text-sm font-bold text-white">
              {i + 1}
            </span>
            <h2 className="mb-1 font-semibold">{s.title}</h2>
            <p className="text-sm leading-7 text-ink-soft">{s.body}</p>
          </Card>
        ))}
      </section>

      <footer className="mt-auto flex flex-wrap gap-4 pt-16 text-sm text-ink-soft">
        <a href="/terms" className="hover:text-ink">
          شروط الاستخدام
        </a>
        <a href="/privacy" className="hover:text-ink">
          سياسة الخصوصية
        </a>
      </footer>
    </main>
  );
}
