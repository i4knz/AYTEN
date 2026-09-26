import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, Stat } from "@/components/ui";
import { getCustomer } from "@/server/commerce/customers";
import { FULFILLMENT_LABELS, listOrders, PAYMENT_STATUS_LABELS } from "@/server/commerce/orders";
import { formatMoney } from "@/server/lib/money";
import { roleHas } from "@/server/stores/permissions";
import { loadStore } from "../../access";
import { CustomerTools } from "./tools";

export const metadata: Metadata = { title: "ملف العميل" };
const fmt = new Intl.DateTimeFormat("ar-SA-u-nu-latn", { dateStyle: "medium", timeZone: "Asia/Riyadh" });

export default async function CustomerPage({ params }: PageProps<"/dashboard/[storeId]/customers/[customerId]">) {
  const { storeId, customerId } = await params;
  const { session, access } = await loadStore(storeId);
  const customer = await getCustomer(session.user.id, storeId, customerId);
  const orders = roleHas(access.role, "orders.read") ? await listOrders(session.user.id, storeId, { customerId }) : null;
  const aov = customer.ordersCount ? Math.round(customer.totalSpent / customer.ordersCount) : 0;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <div>
        <Link href={`/dashboard/${storeId}/customers`} className="text-sm text-brand">→ العملاء</Link>
        <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold">
          {customer.name}
          {customer.acceptsMarketing && <Badge tone="success">يقبل العروض</Badge>}
          {customer.anonymizedAt && <Badge>بيانات محذوفة</Badge>}
        </h1>
        <p className="ltr text-end text-sm text-ink-soft sm:text-start">{customer.phone} {customer.email && `· ${customer.email}`}</p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="عدد الطلبات" value={customer.ordersCount} />
        <Stat label="إجمالي المشتريات" value={formatMoney(customer.totalSpent)} />
        <Stat label="متوسط الطلب" value={formatMoney(aov)} />
        <Stat label="طلبات ملغاة" value={customer.cancelledCount} />
      </div>
      {orders && (
        <Card className="p-0">
          <h2 className="px-4 pt-4 font-semibold">الطلبات</h2>
          <ul className="divide-y divide-line">
            {orders.rows.map((o) => (
              <li key={o.id}>
                <Link href={`/dashboard/${storeId}/orders/${o.id}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-muted/60">
                  <span className="font-medium">#{o.number}</span>
                  <span className="text-sm">{formatMoney(o.total, o.currency)}</span>
                  <span className="text-xs text-ink-soft">{PAYMENT_STATUS_LABELS[o.paymentStatus]} · {FULFILLMENT_LABELS[o.fulfillmentStatus]}</span>
                  <span className="text-xs text-ink-soft">{fmt.format(o.createdAt)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <CustomerTools storeId={storeId} customerId={customer.id} note={customer.note ?? ""} canWrite={roleHas(access.role, "orders.write")} canErase={roleHas(access.role, "settings.write") && !customer.anonymizedAt} />
    </div>
  );
}
