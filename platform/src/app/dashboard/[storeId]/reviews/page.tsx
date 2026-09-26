import type { Metadata } from "next";
import { Card, Stat, Tabs } from "@/components/ui";
import { listReviews } from "@/server/design/reviews";
import { roleHas } from "@/server/stores/permissions";
import { loadStore } from "../access";
import { ReviewActions } from "./review-actions";

export const metadata: Metadata = { title: "التقييمات" };
const STATUSES = { pending: "بانتظار المراجعة", approved: "منشورة", rejected: "مرفوضة", all: "الكل" } as const;
const fmt = new Intl.DateTimeFormat("ar-SA-u-nu-latn", { dateStyle: "medium", timeZone: "Asia/Riyadh" });

export default async function ReviewsPage({ params, searchParams }: PageProps<"/dashboard/[storeId]/reviews">) {
  const { storeId } = await params;
  const sp = await searchParams;
  const { session, access } = await loadStore(storeId);
  const status = (Object.keys(STATUSES).includes(String(sp.status)) ? sp.status : "pending") as keyof typeof STATUSES;
  const { rows, counts } = await listReviews(session.user.id, storeId, status);
  const canWrite = roleHas(access.role, "products.write");
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold">التقييمات</h1>
        <p className="text-sm text-ink-soft">كل التقييمات من عملاء استلموا طلباتهم فعلاً. لا تظهر في المتجر إلا بعد موافقتك.</p>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Stat label="بانتظار المراجعة" value={counts.pending} />
        <Stat label="منشورة" value={counts.approved} />
        <Stat label="متوسط التقييم" value={counts.average === null ? "—" : `${counts.average.toFixed(1)} / 5`} />
      </div>
      <Tabs current={status} items={Object.entries(STATUSES).map(([k, l]) => ({ key: k, label: l, href: `/dashboard/${storeId}/reviews?status=${k}`, count: k === "pending" ? counts.pending : undefined }))} />
      {rows.length === 0 ? (
        <Card className="py-12 text-center text-sm text-ink-soft">لا توجد تقييمات هنا.</Card>
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map(({ review: r, productName }) => (
            <Card key={r.id} className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium">{productName}</p>
                <span className="text-amber-500" aria-label={`${r.rating} من 5`}>{"★".repeat(r.rating)}<span className="text-ink-faint">{"★".repeat(5 - r.rating)}</span></span>
              </div>
              {r.body && <p className="text-sm leading-7">{r.body}</p>}
              <p className="text-xs text-ink-soft">{r.authorName} · {fmt.format(r.createdAt)}</p>
              {canWrite && <ReviewActions storeId={storeId} reviewId={r.id} status={r.status} reply={r.reply ?? ""} />}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
