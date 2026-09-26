import type { Metadata } from "next";
import { ActionForm } from "@/components/action-form";
import { Badge, Card, Field, Input, Select } from "@/components/ui";
import { ADMIN_ROLE_LABELS, ADMIN_ROLE_PERMISSIONS } from "@/server/admin/access";
import { listAdmins } from "@/server/admin/platform";
import { ADMIN_ROLES } from "@/server/db/schema";
import { loadAdmin } from "../access";
import { grantAdminAction, revokeAdminAction } from "../actions";

export const metadata: Metadata = { title: "المشرفون" };

export default async function AdminTeamPage() {
  const { session } = await loadAdmin("admins.manage");
  const admins = await listAdmins(session.user.id);
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <h1 className="text-2xl font-bold">مشرفو المنصة</h1>
      <Card>
        <ActionForm action={grantAdminAction} submitLabel="إضافة / تغيير الدور">
          <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
            <Field label="بريد الحساب" name="email" hint="يجب أن يكون الشخص مسجلاً في المنصة">
              <Input id="email" name="email" type="email" dir="ltr" required />
            </Field>
            <Field label="الدور" name="role">
              <Select id="role" name="role" defaultValue="support">
                {ADMIN_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ADMIN_ROLE_LABELS[r]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </ActionForm>
      </Card>
      <Card className="p-0">
        <ul className="divide-y divide-line">
          {admins.map((a) => (
            <li key={a.userId} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
              <div>
                <p className="font-medium">
                  {a.name} <Badge tone={a.role === "owner" ? "success" : "neutral"}>{ADMIN_ROLE_LABELS[a.role]}</Badge>
                </p>
                <p className="ltr text-end text-xs text-ink-soft">{a.email}</p>
              </div>
              {a.userId !== session.user.id && <ActionForm action={revokeAdminAction.bind(null, a.userId)} submitLabel="إزالة" tone="ghost" inline confirmText={`إزالة صلاحية ${a.name}؟`} />}
            </li>
          ))}
        </ul>
      </Card>
      <Card>
        <h2 className="mb-2 font-semibold">صلاحيات الأدوار</h2>
        <ul className="flex flex-col gap-1 text-sm">
          {ADMIN_ROLES.map((r) => (
            <li key={r}>
              <strong>{ADMIN_ROLE_LABELS[r]}:</strong> <span className="font-mono text-xs text-ink-soft" dir="ltr">{ADMIN_ROLE_PERMISSIONS[r].join(", ")}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
