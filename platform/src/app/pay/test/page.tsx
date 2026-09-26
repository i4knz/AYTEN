import type { Metadata } from "next";
import { Alert, Card } from "@/components/ui";
import { formatMoney } from "@/server/lib/money";
import { resolveTestPayment } from "@/server/payments/test-flow";

export const metadata: Metadata = { title: "بوابة الدفع التجريبية", robots: { index: false }, referrer: "no-referrer" };

// Simulates a provider's hosted payment page. No card data is collected.
export default async function TestPaymentPage({ searchParams }: PageProps<"/pay/test">) {
  const sp = await searchParams;
  const ref = typeof sp.ref === "string" ? sp.ref : "";
  const sig = typeof sp.sig === "string" ? sp.sig : "";
  const data = await resolveTestPayment(ref, sig);
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-10">
      <Card className="flex w-full max-w-sm flex-col gap-4 text-center">
        <Alert tone="warning">بوابة دفع تجريبية لأغراض الاختبار فقط. لا تُدخل بيانات بطاقة حقيقية ولا يتم خصم أي مبلغ.</Alert>
        {!data ? (
          <Alert>رابط الدفع غير صالح.</Alert>
        ) : data.payment.status !== "pending" ? (
          <>
            <p>تمت معالجة هذه العملية مسبقاً.</p>
            <a href={data.returnUrl} className="text-brand underline">العودة للطلب</a>
          </>
        ) : (
          <>
            <p className="text-sm text-ink-soft">الدفع إلى {data.storeName}</p>
            <p className="text-3xl font-bold">{formatMoney(data.payment.amount, data.payment.currency)}</p>
            <form action="/pay/test/complete" method="post" className="flex flex-col gap-2">
              <input type="hidden" name="ref" value={ref} />
              <input type="hidden" name="sig" value={sig} />
              <button name="outcome" value="paid" className="rounded-xl bg-emerald-600 px-4 py-3 font-semibold text-white">محاكاة دفع ناجح</button>
              <button name="outcome" value="failed" className="rounded-xl border border-line px-4 py-3 text-sm">محاكاة رفض البطاقة</button>
            </form>
          </>
        )}
      </Card>
    </main>
  );
}
