import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Stat } from "@/components/ui";
import { getCoupon } from "@/server/commerce/coupons";
import { formatMoney, toMajorString } from "@/server/lib/money";
import { roleHas } from "@/server/stores/permissions";
import { loadStore } from "../../../access";
import { CouponForm } from "../coupon-form";
import { couponPickers } from "../data";

export const metadata: Metadata = { title: "تعديل الكوبون" };

// datetime-local wants "YYYY-MM-DDTHH:mm" in Riyadh time.
const toLocal = (d: Date | null) => (d ? new Date(d.getTime() + 3 * 3600_000).toISOString().slice(0, 16) : "");

export default async function EditCouponPage({ params }: PageProps<"/dashboard/[storeId]/marketing/coupons/[couponId]">) {
  const { storeId, couponId } = await params;
  const { session, access } = await loadStore(storeId);
  if (!roleHas(access.role, "marketing.write")) notFound();
  const [{ coupon: c, totalDiscount }, pickers] = await Promise.all([getCoupon(session.user.id, storeId, couponId), couponPickers(session.user.id, storeId)]);
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <div>
        <Link href={`/dashboard/${storeId}/marketing/coupons`} className="text-sm text-brand">→ الكوبونات</Link>
        <h1 className="ltr mt-1 text-end text-2xl font-bold sm:text-start">{c.code}</h1>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Stat label="مرات الاستخدام" value={c.usedCount} />
        <Stat label="إجمالي الخصومات الممنوحة" value={formatMoney(totalDiscount)} />
      </div>
      <CouponForm
        storeId={storeId}
        couponId={c.id}
        {...pickers}
        initial={{
          code: c.code,
          type: c.type,
          value: c.type === "percent" ? String(c.value) : c.type === "fixed" ? toMajorString(c.value) : "",
          maxDiscount: toMajorString(c.maxDiscount),
          minSubtotal: toMajorString(c.minSubtotal),
          startsAt: toLocal(c.startsAt),
          endsAt: toLocal(c.endsAt),
          usageLimit: c.usageLimit ? String(c.usageLimit) : "",
          usageLimitPerCustomer: c.usageLimitPerCustomer ? String(c.usageLimitPerCustomer) : "",
          productIds: c.productIds,
          categoryIds: c.categoryIds,
          active: c.active,
        }}
      />
    </div>
  );
}
