import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { roleHas } from "@/server/stores/permissions";
import { loadStore } from "../../../access";
import { CouponForm } from "../coupon-form";
import { couponPickers } from "../data";

export const metadata: Metadata = { title: "كوبون جديد" };

export default async function NewCouponPage({ params }: PageProps<"/dashboard/[storeId]/marketing/coupons/new">) {
  const { storeId } = await params;
  const { session, access } = await loadStore(storeId);
  if (!roleHas(access.role, "marketing.write")) notFound();
  const pickers = await couponPickers(session.user.id, storeId);
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <div>
        <Link href={`/dashboard/${storeId}/marketing/coupons`} className="text-sm text-brand">→ الكوبونات</Link>
        <h1 className="mt-1 text-2xl font-bold">كوبون جديد</h1>
      </div>
      <CouponForm
        storeId={storeId}
        couponId={null}
        {...pickers}
        initial={{ code: "", type: "percent", value: "", maxDiscount: "", minSubtotal: "", startsAt: "", endsAt: "", usageLimit: "", usageLimitPerCustomer: "", productIds: [], categoryIds: [], active: true }}
      />
    </div>
  );
}
