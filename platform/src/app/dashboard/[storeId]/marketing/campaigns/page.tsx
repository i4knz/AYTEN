import type { Metadata } from "next";
import Link from "next/link";
import { Badge, ButtonLink, Card } from "@/components/ui";
import { countAudience, listCampaigns, SEGMENT_LABELS } from "@/server/marketing/campaigns";
import { loadStore } from "../../access";

export const metadata: Metadata = { title: "حملات التسويق" };
const fmt = new Intl.DateTimeFormat("ar-SA-u-nu-latn", { dateStyle: "medium", timeZone: "Asia/Riyadh" });
const STATUS = { draft: ["مسودة", "warning"], sending: ["جارٍ الإرسال", "info"], sent: ["أُرسلت", "success"], failed: ["فشلت", "danger"] } as const;

export default async function CampaignsPage({ params }: PageProps<"/dashboard/[storeId]/marketing/campaigns">) {
  const { storeId } = await params;
  const { session } = await loadStore(storeId);
  const [list, audience] = await Promise.all([listCampaigns(session.user.id, storeId), countAudience(session.user.id, storeId)]);
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href={`/dashboard/${storeId}/marketing`} className="text-sm text-brand">→ التسويق</Link>
          <h1 className="mt-1 text-2xl font-bold">حملات التسويق</h1>
          <p className="text-xs text-ink-soft">رسائل بريد إلكتروني لعملائك الذين وافقوا على استلام العروض ({audience.subscribers} مشترك). كل رسالة تحتوي رابط إلغاء اشتراك.</p>
        </div>
        <ButtonLink href={`/dashboard/${storeId}/marketing/campaigns/new`}>+ حملة جديدة</ButtonLink>
      </div>
      {list.length === 0 ? (
        <Card className="py-12 text-center text-sm text-ink-soft">لا توجد حملات بعد.</Card>
      ) : (
        <Card className="p-0">
          <ul className="divide-y divide-line">
            {list.map((c) => (
              <li key={c.id}>
                <Link href={`/dashboard/${storeId}/marketing/campaigns/${c.id}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-muted/60">
                  <span>
                    <span className="block font-medium">{c.name}</span>
                    <span className="block text-xs text-ink-soft">{SEGMENT_LABELS[c.segment]}{c.sentAt && ` · ${fmt.format(c.sentAt)} · ${c.sentCount} مستلم`}</span>
                  </span>
                  <Badge tone={STATUS[c.status][1]}>{STATUS[c.status][0]}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <p className="text-xs text-ink-soft">حملات واتساب تتطلب ربط واجهة WhatsApp Business الرسمية وموافقة قوالب الرسائل من Meta، وستتوفر كتطبيق لاحقاً.</p>
    </div>
  );
}
