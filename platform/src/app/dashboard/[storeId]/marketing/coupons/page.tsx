import type { Metadata } from "next";
import Link from "next/link";
import { Badge, ButtonLink, Card } from "@/components/ui";
import { listCoupons } from "@/server/commerce/coupons";
import { formatMoney } from "@/server/lib/money";
import { roleHas } from "@/server/stores/permissions";
import { loadStore } from "../../access";
import { CouponToggle } from "./toggle";

export const metadata: Metadata = { title: "الكوبونات" };
const STATES = { inactive: ["موقوف", "neutral"], expired: ["منتهي", "neutral"], exhausted: ["استُنفد", "neutral"], scheduled: ["مجدول", "info"], active: ["فعّال", "success"] } as const;
const fmt = new Intl.DateTimeFormat("ar-SA-u-nu-latn", { dateStyle: "medium", timeZone: "Asia/Riyadh" });

export default async function CouponsPage({ params }: PageProps<"/dashboard/[storeId]/marketing/coupons">) {
  const { storeId } = await params;
  const { session, access } = await loadStore(storeId);
  const coupons = await listCoupons(session.user.id, storeId);
  const canWrite = roleHas(access.role, "marketing.write");
  const base = `/dashboard/${storeId}/marketing/coupons`;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href={`/dashboard/${storeId}/marketing`} className="text-sm text-brand">→ التسويق</Link>
          <h1 className="mt-1 text-2xl font-bold">الكوبونات</h1>
        </div>
        {canWrite && <ButtonLink href={`${base}/new`}>+ كوبون جديد</ButtonLink>}
      </div>
      {coupons.length === 0 ? (
        <Card className="py-14 text-center text-sm text-ink-soft">لا توجد كوبونات بعد.</Card>
      ) : (
        <Card className="p-0">
          <ul className="divide-y divide-line">
            {coupons.map((c) => {
              const state = STATES[c.state];
              return (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <Link href={canWrite ? `${base}/${c.id}` : "#"} className="min-w-0">
                    <p className="ltr text-end font-mono font-semibold sm:text-start">{c.code}</p>
                    <p className="text-xs text-ink-soft">
                      {c.type === "percent" ? `خصم ${c.value}%` : c.type === "fixed" ? `خصم ${formatMoney(c.value)}` : "شحن مجاني"}
                      {c.minSubtotal ? ` · للطلبات فوق ${formatMoney(c.minSubtotal)}` : ""}
                      {c.endsAt ? ` · حتى ${fmt.format(c.endsAt)}` : ""}
                    </p>
                  </Link>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-ink-soft">
                      استُخدم {c.usedCount}
                      {c.usageLimit ? ` / ${c.usageLimit}` : ""}
                    </span>
                    <Badge tone={state[1]}>{state[0]}</Badge>
                    {canWrite && <CouponToggle storeId={storeId} couponId={c.id} active={c.active} />}
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
