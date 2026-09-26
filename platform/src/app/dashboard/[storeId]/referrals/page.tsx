import type { Metadata } from "next";
import { Card, Stat } from "@/components/ui";
import { CopyField } from "@/components/copy-field";
import { getPlatformSettings } from "@/server/platform/settings";
import { getReferralDashboard, maskName } from "@/server/referrals/service";
import { loadStore } from "../access";

export const metadata: Metadata = { title: "برنامج الإحالات" };

const dateFmt = new Intl.DateTimeFormat("ar-SA-u-nu-latn-ca-gregory", { dateStyle: "medium", timeZone: "Asia/Riyadh" });

export default async function ReferralsPage({ params }: PageProps<"/dashboard/[storeId]/referrals">) {
  const { storeId } = await params;
  const { session } = await loadStore(storeId);
  const [data, settings] = await Promise.all([getReferralDashboard(session.user.id), getPlatformSettings()]);
  const link = new URL(`/register?ref=${data.code}`, process.env.APP_URL ?? "http://localhost:3000").toString();
  const withStores = data.referred.filter((r) => r.stores > 0).length;
  const whatsapp = `https://wa.me/?text=${encodeURIComponent(`أنشئ متجرك الإلكتروني من هنا: ${link}`)}`;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold">برنامج الإحالات</h1>
        <p className="text-sm text-ink-soft">
          شارك رابطك مع تاجر آخر. عندما يسجّل ويدفع أول اشتراك له، يُضاف إلى اشتراكك {settings.referrals.rewardDays} يوماً مجاناً.
        </p>
      </div>
      <Card className="flex flex-col gap-3">
        <h2 className="font-semibold">رابط الإحالة الخاص بك</h2>
        <CopyField value={link} label="رابط الإحالة" />
        <div className="flex flex-wrap gap-2 text-sm">
          <a href={whatsapp} target="_blank" rel="noopener" className="rounded-lg bg-emerald-600 px-3 py-1.5 font-medium text-white">
            مشاركة عبر واتساب
          </a>
          <span className="self-center text-ink-soft">
            الرمز: <span className="font-mono font-semibold text-ink">{data.code}</span>
          </span>
        </div>
      </Card>
      <div className="grid grid-cols-3 gap-3">
        <Stat label="سجّلوا برابطك" value={data.referred.length} />
        <Stat label="أنشؤوا متاجر" value={withStores} />
        <Stat label="مكافآت حصلت عليها" value={data.rewards.length} />
      </div>
      <Card className="p-0">
        <h2 className="px-4 pt-4 font-semibold">من سجّل برابطك</h2>
        {data.referred.length === 0 ? (
          <p className="p-4 text-sm text-ink-soft">لم يسجّل أحد برابطك بعد.</p>
        ) : (
          <ul className="divide-y divide-line">
            {data.referred.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <span>{maskName(r.name)}</span>
                <span className="text-ink-soft">{dateFmt.format(r.createdAt)}</span>
                <span className={r.rewarded ? "text-emerald-700" : r.stores ? "text-ink" : "text-ink-soft"}>
                  {r.rewarded ? "✓ حصلت على المكافأة" : r.stores ? "أنشأ متجراً — بانتظار أول اشتراك مدفوع" : "سجّل حساباً"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <p className="text-xs text-ink-soft">نعرض الحرف الأول من الاسم فقط حفاظاً على خصوصية من سجّلوا. لا تُمنح المكافأة عن حسابك نفسه.</p>
    </div>
  );
}
