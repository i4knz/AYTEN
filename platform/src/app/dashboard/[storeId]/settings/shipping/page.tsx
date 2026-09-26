import type { Metadata } from "next";
import { Card } from "@/components/ui";
import { listShippingMethods } from "@/server/commerce/shipping";
import { toMajorString } from "@/server/lib/money";
import { roleHas } from "@/server/stores/permissions";
import { loadStore } from "../../access";
import { ShippingMethodForm } from "./method-form";

export const metadata: Metadata = { title: "الشحن" };

export default async function ShippingPage({ params }: PageProps<"/dashboard/[storeId]/settings/shipping">) {
  const { storeId } = await params;
  const { session, access } = await loadStore(storeId);
  const methods = await listShippingMethods(session.user.id, storeId);
  const canEdit = roleHas(access.role, "settings.write");
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-ink-soft">
        حدد طرق الشحن التي تظهر لعملائك. اترك «المدن» فارغة لتكون الطريقة متاحة في كل المدن. تُحسب التكلفة تلقائياً عند إتمام الطلب. تكامل شركات الشحن (إنشاء البوليصة والتتبع التلقائي) قيد البناء؛ أدخل رقم التتبع يدوياً عند الشحن.
      </p>
      {methods.map((m) => (
        <Card key={m.id}>
          <ShippingMethodForm
            storeId={storeId}
            methodId={m.id}
            canEdit={canEdit}
            initial={{ name: m.name, type: m.type, price: toMajorString(m.price), freeThreshold: toMajorString(m.freeThreshold), cities: m.cities.join("، "), estimatedDays: m.estimatedDays ?? "", pickupAddress: m.pickupAddress ?? "", active: m.active }}
          />
        </Card>
      ))}
      {canEdit && (
        <Card>
          <h2 className="mb-3 font-semibold">طريقة شحن جديدة</h2>
          <ShippingMethodForm
            storeId={storeId}
            methodId={null}
            canEdit
            initial={{ name: "", type: "flat", price: "", freeThreshold: "", cities: "", estimatedDays: "", pickupAddress: "", active: true }}
          />
        </Card>
      )}
    </div>
  );
}
