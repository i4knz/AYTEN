import type { Metadata } from "next";
import Link from "next/link";
import { Card, Stat } from "@/components/ui";
import { formatMoney } from "@/server/lib/money";
import { listAbandonedCarts } from "@/server/marketing/abandoned";
import { storefrontUrl } from "@/server/urls";
import { loadStore } from "../../access";
import { RemindButtons } from "./remind";

export const metadata: Metadata = { title: "السلات المتروكة" };
const fmt = new Intl.DateTimeFormat("ar-SA-u-nu-latn", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" });

export default async function AbandonedPage({ params }: PageProps<"/dashboard/[storeId]/marketing/abandoned">) {
  const { storeId } = await params;
  const { session, access } = await loadStore(storeId);
  const { carts, recovered } = await listAbandonedCarts(session.user.id, storeId);
  const total = carts.reduce((a, c) => a + c.value, 0);
  const url = storefrontUrl(access.store.slug);
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <div>
        <Link href={`/dashboard/${storeId}/marketing`} className="text-sm text-brand">→ التسويق</Link>
        <h1 className="mt-1 text-2xl font-bold">السلات المتروكة</h1>
        <p className="text-xs text-ink-soft">عملاء وصلوا لصفحة إتمام الطلب وأدخلوا جوالهم ولم يكملوا خلال ساعة (آخر 30 يوماً). تواصل بلطف ومرة واحدة فقط.</p>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Stat label="سلات متروكة" value={carts.length} />
        <Stat label="قيمتها" value={formatMoney(total)} />
        <Stat label="استُرجعت بعد التذكير" value={recovered} />
      </div>
      {carts.length === 0 ? (
        <Card className="py-12 text-center text-sm text-ink-soft">لا توجد سلات متروكة حالياً.</Card>
      ) : (
        <div className="flex flex-col gap-3">
          {carts.map((c) => (
            <Card key={c.id} className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium">{c.name || "عميل"} <span className="ltr text-sm text-ink-soft">{c.phone}</span></p>
                <span className="font-semibold">{formatMoney(c.value)}</span>
              </div>
              <p className="text-sm text-ink-soft">{c.items.map((i) => `${i.name} × ${i.quantity}`).join("، ")}</p>
              <p className="text-xs text-ink-faint">آخر نشاط {fmt.format(c.updatedAt)}{c.remindedAt && ` · تم التذكير ${fmt.format(c.remindedAt)}`}</p>
              <RemindButtons
                storeId={storeId}
                cartId={c.id}
                hasEmail={!!c.email}
                reminded={!!c.remindedAt}
                whatsappUrl={`https://wa.me/${c.phone.replace(/\D/g, "")}?text=${encodeURIComponent(`مرحباً ${c.name ?? ""}، لاحظنا أنك لم تكمل طلبك من ${access.store.name} (${c.items.map((i) => i.name).join("، ")}). هل واجهتك مشكلة؟ يسعدنا مساعدتك: ${url}`)}`}
              />
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
