import type { Metadata } from "next";
import { ActionForm } from "@/components/action-form";
import { Badge, Card, Field, Input, Select } from "@/components/ui";
import { listAnnouncementsAdmin } from "@/server/admin/support";
import { loadAdmin } from "../access";
import { createAnnouncementAction, deleteAnnouncementAction } from "../actions";
import { dateFmt } from "../format";

export const metadata: Metadata = { title: "الإعلانات" };

export default async function AdminAnnouncementsPage() {
  const { session } = await loadAdmin("content.manage");
  const rows = await listAnnouncementsAdmin(session.user.id);
  const now = new Date();
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold">الإعلانات</h1>
        <p className="text-sm text-ink-soft">رسالة تظهر أعلى لوحة تحكم كل التجار (صيانة مجدولة، ميزة جديدة، تنبيه مهم).</p>
      </div>
      <Card>
        <ActionForm action={createAnnouncementAction} submitLabel="نشر الإعلان">
          <Field label="العنوان" name="title">
            <Input id="title" name="title" required maxLength={120} />
          </Field>
          <Field label="التفاصيل" name="body">
            <Input id="body" name="body" maxLength={1000} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="النوع" name="level">
              <Select id="level" name="level" defaultValue="info">
                <option value="info">معلومة</option>
                <option value="warning">تنبيه</option>
              </Select>
            </Field>
            <Field label="يظهر لمدة (أيام)" name="days">
              <Input id="days" name="days" type="number" min={1} max={365} defaultValue={7} />
            </Field>
          </div>
        </ActionForm>
      </Card>
      <Card className="p-0">
        <ul className="divide-y divide-line">
          {rows.map((a) => {
            const live = a.startsAt <= now && (!a.endsAt || a.endsAt > now);
            return (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
                <div>
                  <p className="font-medium">
                    {a.title} {live ? <Badge tone="success">ظاهر الآن</Badge> : <Badge>منتهٍ</Badge>}
                  </p>
                  <p className="text-xs text-ink-soft">
                    {dateFmt.format(a.startsAt)} — {a.endsAt ? dateFmt.format(a.endsAt) : "بلا نهاية"}
                  </p>
                </div>
                <ActionForm action={deleteAnnouncementAction.bind(null, a.id)} submitLabel="حذف" tone="ghost" inline confirmText="حذف الإعلان؟" />
              </li>
            );
          })}
          {!rows.length && <li className="p-4 text-center text-sm text-ink-soft">لا إعلانات.</li>}
        </ul>
      </Card>
    </div>
  );
}
