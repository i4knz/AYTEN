import { BarChart3, FileSpreadsheet, MessageCircle, Search, ShoppingCart, Truck, CreditCard, type LucideIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card } from "@/components/ui";
import { CopyField } from "@/components/copy-field";
import { getStoreTracking } from "@/server/design/settings";
import { roleHas } from "@/server/stores/permissions";
import { storefrontUrl } from "@/server/urls";
import { loadStore } from "../access";
import { FeatureToggle } from "../features/toggle";

export const metadata: Metadata = { title: "متجر التطبيقات" };

type LinkedApp = { title: string; body: string; icon: LucideIcon; href: string; active: boolean };
type SoonApp = { title: string; body: string; icon: LucideIcon };

export default async function AppsPage({ params }: PageProps<"/dashboard/[storeId]/apps">) {
  const { storeId } = await params;
  const { access } = await loadStore(storeId);
  const { features, tracking } = await getStoreTracking(storeId);
  const base = `/dashboard/${storeId}`;
  const storeUrl = storefrontUrl(access.store.slug);
  const canEdit = roleHas(access.role, "settings.write");

  const linked: LinkedApp[] = [
    { title: "أدوات القياس والإعلانات", body: "Google Analytics و Tag Manager و Meta و TikTok و Snapchat — تعمل بعد موافقة العميل على ملفات التتبع.", icon: BarChart3, href: `${base}/embed`, active: Object.keys(tracking).length > 0 },
    { title: "زر واتساب العائم", body: "محادثة مباشرة مع العميل من أي صفحة في المتجر.", icon: MessageCircle, href: `${base}/features`, active: features.whatsappButton },
    { title: "تذكير السلات المتروكة", body: "رسالة بريد لمن بدأ الدفع ولم يكمل، مع رابط يعيده لسلته.", icon: ShoppingCart, href: `${base}/marketing/abandoned`, active: true },
    { title: "تصدير الطلبات والعملاء", body: "ملفات CSV تفتح في Excel لمحاسبك أو لأي نظام آخر.", icon: FileSpreadsheet, href: `${base}/orders`, active: true },
  ];
  const soon: SoonApp[] = [
    { title: "بوابات الدفع الإلكتروني", body: "البطاقات و Apple Pay و مدى عبر مزود دفع مرخّص. تتطلب تعاقد المنصة مع المزود.", icon: CreditCard },
    { title: "شركات الشحن", body: "إصدار البوليصة وتتبع الشحنة آلياً. حالياً تضيف رقم التتبع يدوياً.", icon: Truck },
  ];

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">متجر التطبيقات</h1>
        <p className="text-sm text-ink-soft">اربط متجرك بالخدمات التي تساعدك على البيع. التطبيقات المتاحة تعمل فعلياً؛ القادمة موضّحة كقادمة.</p>
      </div>

      <Card className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-700">
              <Search className="size-5" aria-hidden />
            </span>
            <div>
              <h2 className="font-semibold">
                Google Merchant Center <Badge tone="success">متاح</Badge>
              </h2>
              <p className="text-sm text-ink-soft">اعرض منتجاتك في تبويب «التسوق» في Google وإعلانات المنتجات. يُحدَّث الملف تلقائياً من منتجاتك المنشورة.</p>
            </div>
          </div>
          <FeatureToggle storeId={storeId} featureKey="googleFeed" enabled={!!features.googleFeed} disabled={!canEdit} label="تفعيل ملف منتجات Google" />
        </div>
        {features.googleFeed && (
          <div className="flex flex-col gap-2 rounded-xl bg-muted/50 p-4 text-sm">
            <p className="font-medium">رابط ملف المنتجات</p>
            <CopyField value={`${storeUrl}/feeds/google.xml`} label="رابط ملف المنتجات" />
            <ol className="list-inside list-decimal leading-7 text-ink-soft">
              <li>في Merchant Center اختر «المنتجات ← إضافة منتجات ← ملف مجدول».</li>
              <li>الصق الرابط أعلاه واختر التحديث اليومي.</li>
              <li>المنتجات بدون صورة لا تُضاف للملف لأن Google يشترط الصورة.</li>
            </ol>
          </div>
        )}
      </Card>

      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">مفعّلة في منصتك</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {linked.map((a) => {
            const Icon = a.icon;
            return (
              <Link key={a.title} href={a.href} className="flex gap-3 rounded-2xl border border-line bg-surface p-4 hover:border-brand">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand-strong">
                  <Icon className="size-5" aria-hidden />
                </span>
                <span>
                  <span className="flex items-center gap-2 font-semibold">
                    {a.title}
                    {a.active && <Badge tone="success">مفعّل</Badge>}
                  </span>
                  <span className="text-sm text-ink-soft">{a.body}</span>
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">قادمة</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {soon.map((a) => {
            const Icon = a.icon;
            return (
              <div key={a.title} className="flex gap-3 rounded-2xl border border-dashed border-line p-4 text-ink-soft">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted">
                  <Icon className="size-5" aria-hidden />
                </span>
                <span>
                  <span className="flex items-center gap-2 font-semibold text-ink">
                    {a.title} <Badge>قريباً</Badge>
                  </span>
                  <span className="text-sm">{a.body}</span>
                </span>
              </div>
            );
          })}
        </div>
      </section>
      <p className="text-xs text-ink-soft">
        خريطة الموقع لمحركات البحث متاحة تلقائياً على <span className="ltr inline-block">{storeUrl}/sitemap.xml</span>
      </p>
    </div>
  );
}
