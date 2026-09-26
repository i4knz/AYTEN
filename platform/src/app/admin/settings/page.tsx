import type { Metadata } from "next";
import { ActionForm } from "@/components/action-form";
import { Card, Field, Input } from "@/components/ui";
import { getSettingsAdmin } from "@/server/admin/platform";
import { loadAdmin } from "../access";
import { saveSettingAction } from "../actions";

export const metadata: Metadata = { title: "إعدادات المنصة" };

export default async function AdminSettingsPage() {
  const { session } = await loadAdmin("settings.manage");
  const s = await getSettingsAdmin(session.user.id);
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <h1 className="text-2xl font-bold">إعدادات المنصة</h1>
      <Card>
        <h2 className="mb-1 font-semibold">فوترة الاشتراكات</h2>
        <p className="mb-3 text-sm text-ink-soft">تظهر بيانات الحساب للتاجر عند إصدار فاتورة اشتراك.</p>
        <ActionForm action={saveSettingAction.bind(null, "billing")} submitLabel="حفظ">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="اسم البنك" name="bankName">
              <Input id="bankName" name="bankName" defaultValue={s.billing.bankName} />
            </Field>
            <Field label="اسم المستفيد" name="accountName">
              <Input id="accountName" name="accountName" defaultValue={s.billing.accountName} />
            </Field>
            <Field label="الآيبان" name="iban">
              <Input id="iban" name="iban" dir="ltr" defaultValue={s.billing.iban} />
            </Field>
            <Field label="الرقم الضريبي للمنصة" name="vatNumber" hint="اتركه فارغاً إن لم تكن المنصة مسجلة">
              <Input id="vatNumber" name="vatNumber" dir="ltr" defaultValue={s.billing.vatNumber} />
            </Field>
            <Field label="ضريبة القيمة المضافة على الاشتراكات (نقاط أساس)" name="vatBps" hint="1500 = 15%. صفر حتى التسجيل الضريبي [يحتاج تحقق]">
              <Input id="vatBps" name="vatBps" type="number" min={0} max={10000} defaultValue={s.billing.vatBps} />
            </Field>
            <Field label="فترة السماح بعد انتهاء الاشتراك (أيام)" name="graceDays">
              <Input id="graceDays" name="graceDays" type="number" min={0} max={60} defaultValue={s.billing.graceDays} />
            </Field>
          </div>
        </ActionForm>
      </Card>
      <Card>
        <h2 className="mb-3 font-semibold">قنوات الدعم</h2>
        <ActionForm action={saveSettingAction.bind(null, "support")} submitLabel="حفظ">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="بريد الدعم" name="support-email">
              <Input id="support-email" name="email" type="email" dir="ltr" defaultValue={s.support.email} />
            </Field>
            <Field label="واتساب الدعم" name="whatsapp">
              <Input id="whatsapp" name="whatsapp" dir="ltr" placeholder="9665XXXXXXXX" defaultValue={s.support.whatsapp} />
            </Field>
          </div>
        </ActionForm>
      </Card>
      <Card>
        <h2 className="mb-3 font-semibold">برنامج الإحالات</h2>
        <ActionForm action={saveSettingAction.bind(null, "referrals")} submitLabel="حفظ">
          <Field label="مكافأة المُحيل (أيام مجانية)" name="rewardDays" hint="تُمنح عند أول فاتورة مدفوعة للمتجر المُحال. صفر = إيقاف المكافآت.">
            <Input id="rewardDays" name="rewardDays" type="number" min={0} max={365} defaultValue={s.referrals.rewardDays} />
          </Field>
        </ActionForm>
      </Card>
    </div>
  );
}
