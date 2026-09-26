import { CalendarDays } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui";
import { upcomingOccasions } from "@/server/marketing/occasions";
import { loadStore } from "../../access";

export const metadata: Metadata = { title: "المناسبات القادمة" };
const fmt = new Intl.DateTimeFormat("ar-SA-u-nu-latn", { dateStyle: "full", timeZone: "Asia/Riyadh" });
const hijri = new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura-nu-latn", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Riyadh" });

function when(days: number) {
  if (days === 0) return "اليوم";
  if (days === 1) return "غداً";
  if (days <= 10) return `بعد ${days} أيام`;
  return `بعد ${days} يوماً`;
}

export default async function OccasionsPage({ params }: PageProps<"/dashboard/[storeId]/marketing/occasions">) {
  const { storeId } = await params;
  await loadStore(storeId);
  const list = upcomingOccasions(new Date(), 180);
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <div>
        <Link href={`/dashboard/${storeId}/marketing`} className="text-sm text-brand">→ التسويق</Link>
        <h1 className="mt-1 text-2xl font-bold">المناسبات القادمة</h1>
        <p className="text-xs text-ink-soft">التواريخ الهجرية مبنية على تقويم أم القرى — بعض المناسبات كالأعياد قد تختلف بيوم حسب إعلان الرؤية.</p>
      </div>
      <ul className="flex flex-col gap-3">
        {list.map((o) => (
          <li key={o.key}>
            <Card className="flex items-start gap-4">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                <CalendarDays className="size-5" aria-hidden />
              </span>
              <div className="flex flex-1 flex-col gap-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-semibold">{o.title}</h2>
                  <span className={`text-sm ${o.daysLeft <= 7 ? "font-semibold text-emerald-700" : "text-ink-soft"}`}>{when(o.daysLeft)}</span>
                </div>
                <p className="text-sm text-ink-soft">{o.tip}</p>
                <p className="text-xs text-ink-faint">
                  {fmt.format(o.date)} · {hijri.format(o.date)}
                  {o.approximate && " · تاريخ تقريبي"}
                </p>
                {o.couponCode && (
                  <Link href={`/dashboard/${storeId}/marketing/coupons/new?code=${o.couponCode}${new Date(o.date).getFullYear() % 100}`} className="self-start text-sm text-brand">
                    أنشئ كوبوناً للمناسبة
                  </Link>
                )}
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
