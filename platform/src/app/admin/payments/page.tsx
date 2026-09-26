import type { Metadata } from "next";
import { ActionForm } from "@/components/action-form";
import { Alert, Badge, Card, Field, Input } from "@/components/ui";
import { getPaymentActivity } from "@/server/admin/finance";
import { getSettingsAdmin } from "@/server/admin/platform";
import { formatMoney, toMajorString } from "@/server/lib/money";
import { loadAdmin } from "../access";
import { saveSettingAction } from "../actions";
import { dateTimeFmt, num } from "../format";

export const metadata: Metadata = { title: "بوابات الدفع والرسوم" };

// Candidate providers for the Saudi market. Listed for planning only; none is
// integrated, and commercial terms must be confirmed with each provider.
const PROVIDERS = ["Moyasar", "Tap Payments", "HyperPay", "PayTabs", "Tabby / Tamara (الشراء الآن والدفع لاحقاً)"];

export default async function AdminPaymentsPage() {
  const { session } = await loadAdmin("settings.manage");
  const [settings, activity] = await Promise.all([getSettingsAdmin(session.user.id), getPaymentActivity(session.user.id)]);
  const gateway = process.env.PAYMENT_GATEWAY || "";
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5">
      <h1 className="text-2xl font-bold">بوابات الدفع والرسوم</h1>

      <Card className="flex flex-col gap-3">
        <h2 className="font-semibold">البوابة المفعّلة على الخادم</h2>
        <p className="text-sm">
          PAYMENT_GATEWAY = <code className="rounded bg-muted px-1.5 py-0.5">{gateway || "(فارغ)"}</code>{" "}
          {gateway === "test" ? <Badge tone="warning">بوابة اختبار — لا أموال حقيقية</Badge> : gateway ? <Badge tone="info">{gateway}</Badge> : <Badge>الدفع الإلكتروني معطّل</Badge>}
        </p>
        <Alert tone="warning">
          لا توجد بوابة دفع حقيقية مربوطة بعد. تحصيل الأموال نيابة عن التجار ثم تحويلها لهم (نموذج المحفظة) قد يتطلب ترخيصاً من البنك المركزي السعودي أو العمل عبر مزود دفع مرخّص
          بنموذج الحسابات الفرعية [يحتاج تحقق قانوني]. البديل الأبسط: أن يربط كل تاجر حسابه الخاص لدى المزود.
        </Alert>
        <div>
          <p className="mb-1 text-sm font-medium">مزودون مرشّحون للسوق السعودي (للتقييم والتفاوض):</p>
          <ul className="flex flex-wrap gap-2 text-sm">
            {PROVIDERS.map((p) => (
              <li key={p}>
                <Badge>{p} — غير مربوط</Badge>
              </li>
            ))}
          </ul>
        </div>
      </Card>

      <Card>
        <h2 className="mb-3 font-semibold">رسوم المنصة والسحب</h2>
        <ActionForm action={saveSettingAction.bind(null, "fees")} submitLabel="حفظ الرسوم">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="رسوم الدفع الإلكتروني (نقاط أساس)" name="onlinePaymentFeeBps" hint="250 = 2.5% تُخصم من كل عملية إلكترونية">
              <Input id="onlinePaymentFeeBps" name="onlinePaymentFeeBps" type="number" min={0} max={10000} defaultValue={settings.fees.onlinePaymentFeeBps} />
            </Field>
            <Field label="أيام تعليق الرصيد" name="payoutHoldDays" hint="حماية من الاسترداد والاحتيال">
              <Input id="payoutHoldDays" name="payoutHoldDays" type="number" min={0} max={90} defaultValue={settings.fees.payoutHoldDays} />
            </Field>
            <Field label="الحد الأدنى للسحب (ر.س)" name="minPayout">
              <Input id="minPayout" name="minPayout" inputMode="decimal" dir="ltr" defaultValue={toMajorString(settings.fees.minPayout)} />
            </Field>
          </div>
          <p className="text-xs text-ink-soft">الرسوم الجديدة تنطبق على العمليات القادمة فقط؛ القيود المسجلة لا تتغير. النسبة يجب أن تغطي عمولة مزود الدفع الفعلية [يحتاج تحقق].</p>
        </ActionForm>
      </Card>

      <Card className="p-0">
        <h2 className="px-4 pt-4 font-semibold">المدفوعات آخر 30 يوماً</h2>
        {activity.byProvider.length === 0 ? (
          <p className="p-4 text-sm text-ink-soft">لا مدفوعات إلكترونية بعد.</p>
        ) : (
          <table className="w-full text-sm">
            <tbody className="divide-y divide-line">
              {activity.byProvider.map((r) => (
                <tr key={`${r.provider}-${r.status}`}>
                  <td className="px-4 py-2">{r.provider}</td>
                  <td className="px-2 py-2">{r.status}</td>
                  <td className="px-2 py-2 text-end">{num(r.count)}</td>
                  <td className="px-4 py-2 text-end">{formatMoney(r.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card className="p-0">
        <h2 className="px-4 pt-4 font-semibold">آخر إشعارات بوابات الدفع (Webhooks)</h2>
        <ul className="divide-y divide-line text-sm">
          {activity.webhooks.map((w, i) => (
            <li key={i} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
              <span className="font-mono text-xs">
                {w.provider} · {w.type}
              </span>
              <span className="text-xs text-ink-soft">{dateTimeFmt.format(new Date(w.received_at))}</span>
              {w.error ? <Badge tone="danger">{w.error.slice(0, 60)}</Badge> : w.processed_at ? <Badge tone="success">تمت المعالجة</Badge> : <Badge tone="warning">لم تُعالج</Badge>}
            </li>
          ))}
          {!activity.webhooks.length && <li className="p-4 text-ink-soft">لا إشعارات.</li>}
        </ul>
      </Card>
    </div>
  );
}
