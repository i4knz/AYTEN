import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Alert, Badge, Card } from "@/components/ui";
import { INVITABLE_ROLES } from "@/server/db/schema";
import { ROLE_LABELS, ROLE_PERMISSIONS, roleHas } from "@/server/stores/permissions";
import { listTeam } from "@/server/team/service";
import { loadStore } from "../access";
import { InviteForm, MemberActions, RevokeInvitation } from "./forms";

export const metadata: Metadata = { title: "الفريق" };

const PERMISSION_LABELS: Record<string, string> = {
  "products.read": "عرض المنتجات",
  "products.write": "تعديل المنتجات",
  "orders.read": "عرض الطلبات",
  "orders.write": "إدارة الطلبات",
  "customers.read": "عرض العملاء",
  "customers.export": "تصدير العملاء",
  "inventory.write": "تعديل المخزون",
  "reports.read": "التقارير",
  "design.write": "تصميم المتجر",
  "marketing.write": "الكوبونات والتسويق",
  "settings.write": "الإعدادات",
  "team.manage": "إدارة الفريق",
  "billing.read": "عرض الفواتير",
  "billing.manage": "إدارة الاشتراك",
};

const dateFmt = new Intl.DateTimeFormat("ar-SA-u-nu-latn", { dateStyle: "medium", timeZone: "Asia/Riyadh" });

export default async function TeamPage({ params }: PageProps<"/dashboard/[storeId]/team">) {
  const { storeId } = await params;
  const { session, access } = await loadStore(storeId);
  if (!roleHas(access.role, "team.manage")) notFound();
  const { members, invitations } = await listTeam(session.user.id, storeId);
  const assignable = INVITABLE_ROLES.filter((r) => r !== "manager" || access.role === "owner");

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <h1 className="text-2xl font-bold">الفريق</h1>
      <Card>
        <h2 className="mb-3 font-semibold">دعوة عضو</h2>
        <InviteForm storeId={storeId} roles={assignable.map((r) => ({ value: r, label: ROLE_LABELS[r] }))} />
      </Card>

      <Card className="p-0">
        <h2 className="px-4 pt-4 font-semibold">الأعضاء ({members.length})</h2>
        <ul className="divide-y divide-line">
          {members.map((m) => {
            const editable = m.role !== "owner" && m.userId !== session.user.id && (m.role !== "manager" || access.role === "owner");
            return (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="font-medium">
                    {m.name} {m.userId === session.user.id && <Badge>أنت</Badge>}
                  </p>
                  <p className="ltr truncate text-end text-xs text-ink-soft">{m.email}</p>
                </div>
                {editable ? (
                  <MemberActions
                    storeId={storeId}
                    memberId={m.id}
                    role={m.role}
                    name={m.name}
                    roles={assignable.map((r) => ({ value: r, label: ROLE_LABELS[r] }))}
                  />
                ) : (
                  <Badge tone={m.role === "owner" ? "success" : "neutral"}>{ROLE_LABELS[m.role]}</Badge>
                )}
              </li>
            );
          })}
        </ul>
      </Card>

      {invitations.length > 0 && (
        <Card className="p-0">
          <h2 className="px-4 pt-4 font-semibold">دعوات بانتظار القبول</h2>
          <ul className="divide-y divide-line">
            {invitations.map((inv) => (
              <li key={inv.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div>
                  <p className="ltr text-end text-sm">{inv.email}</p>
                  <p className="text-xs text-ink-soft">
                    {ROLE_LABELS[inv.role]} · تنتهي {dateFmt.format(inv.expiresAt)}
                  </p>
                </div>
                <RevokeInvitation storeId={storeId} invitationId={inv.id} />
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <h2 className="mb-3 font-semibold">ماذا يستطيع كل دور؟</h2>
        <div className="-mx-6 overflow-x-auto px-6">
          <table className="w-full min-w-[36rem] text-xs">
            <thead>
              <tr>
                <th className="py-2 text-start font-medium text-ink-soft">الصلاحية</th>
                {(["owner", ...INVITABLE_ROLES] as const).map((r) => (
                  <th key={r} className="px-1 py-2 font-medium text-ink-soft">
                    {ROLE_LABELS[r]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {Object.entries(PERMISSION_LABELS).map(([perm, label]) => (
                <tr key={perm}>
                  <td className="py-1.5">{label}</td>
                  {(["owner", ...INVITABLE_ROLES] as const).map((r) => (
                    <td key={r} className="text-center">
                      {(ROLE_PERMISSIONS[r] as readonly string[]).includes(perm) ? "✓" : "—"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Alert tone="info">كل عضو يدخل بحسابه الخاص، ويُسجَّل من قام بكل إجراء حساس ومتى.</Alert>
    </div>
  );
}
