import type { Metadata } from "next";
import { unsubscribe } from "@/server/marketing/campaigns";
import { loadStorefront } from "../data";

export const metadata: Metadata = { title: "إلغاء الاشتراك", robots: { index: false }, referrer: "no-referrer" };

export default async function UnsubscribePage({ params, searchParams }: PageProps<"/s/[slug]/unsubscribe">) {
  const { slug } = await params;
  const sp = await searchParams;
  const store = await loadStorefront(slug);
  const ok = store && typeof sp.c === "string" && typeof sp.t === "string" ? await unsubscribe(store.id, sp.c, sp.t) : false;
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <h1 className="mb-3 text-2xl font-bold">{ok ? "تم إلغاء اشتراكك" : "الرابط غير صالح"}</h1>
      <p className="text-ink-soft">{ok ? "لن تصلك رسائل العروض من هذا المتجر بعد الآن. ستستمر رسائل الطلبات فقط." : "تأكد من فتح الرابط من الرسالة مباشرة."}</p>
    </div>
  );
}
