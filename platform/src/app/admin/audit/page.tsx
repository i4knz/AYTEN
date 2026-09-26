import type { Metadata } from "next";
import Link from "next/link";
import { Card, Input, Select } from "@/components/ui";
import { listAuditLogsAdmin } from "@/server/admin/stores";
import { loadAdmin } from "../access";
import { dateTimeFmt } from "../format";

export const metadata: Metadata = { title: "سجل التدقيق" };

const ACTORS = { platform_admin: "إدارة المنصة", user: "مستخدم", system: "النظام" } as const;

export default async function AdminAuditPage({ searchParams }: PageProps<"/admin/audit">) {
  const { session } = await loadAdmin("audit.read");
  const sp = await searchParams;
  const actor = typeof sp.actor === "string" ? sp.actor : "";
  const action = typeof sp.action === "string" ? sp.action : "";
  const page = Math.max(1, Number(sp.page) || 1);
  const { rows } = await listAuditLogsAdmin(session.user.id, { actor, action, page });
  const qs = (p: number) => `/admin/audit?${new URLSearchParams({ ...(actor && { actor }), ...(action && { action }), page: String(p) })}`;
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold">سجل التدقيق</h1>
        <p className="text-sm text-ink-soft">كل إجراء حساس في المنصة، بمن قام به ومتى. السجل غير قابل للتعديل أو الحذف.</p>
      </div>
      <form className="flex flex-wrap gap-2">
        <Select name="actor" defaultValue={actor} aria-label="المنفّذ" className="w-auto">
          <option value="">كل المنفذين</option>
          {Object.entries(ACTORS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
        <Input name="action" defaultValue={action} placeholder="الإجراء، مثل admin. أو order." aria-label="الإجراء" className="max-w-xs" dir="ltr" />
        <button type="submit" className="rounded-xl bg-ink px-4 text-sm font-semibold text-white">
          تصفية
        </button>
      </form>
      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[48rem] text-sm">
          <thead className="bg-muted/60 text-ink-soft">
            <tr>
              <th className="px-4 py-2 text-start font-medium">الوقت</th>
              <th className="px-2 py-2 text-start font-medium">المنفّذ</th>
              <th className="px-2 py-2 text-start font-medium">الإجراء</th>
              <th className="px-2 py-2 text-start font-medium">المتجر</th>
              <th className="px-4 py-2 text-start font-medium">التفاصيل</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map(({ log, actorName, storeName }) => (
              <tr key={log.id}>
                <td className="whitespace-nowrap px-4 py-2 text-xs">{dateTimeFmt.format(log.createdAt)}</td>
                <td className="px-2 py-2">
                  {actorName ?? "—"} <span className="text-xs text-ink-soft">({ACTORS[log.actorType]})</span>
                </td>
                <td className="px-2 py-2 font-mono text-xs" dir="ltr">
                  {log.action}
                </td>
                <td className="px-2 py-2">{log.storeId ? <Link href={`/admin/stores/${log.storeId}`} className="text-brand">{storeName}</Link> : "—"}</td>
                <td className="max-w-xs truncate px-4 py-2 text-xs text-ink-soft" dir="ltr" title={JSON.stringify(log.metadata)}>
                  {log.reason ? `${log.reason} · ` : ""}
                  {JSON.stringify(log.metadata)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <nav className="flex justify-center gap-4 text-sm">
        {page > 1 && <Link href={qs(page - 1)} className="text-brand">السابق</Link>}
        {rows.length === 50 && <Link href={qs(page + 1)} className="text-brand">التالي</Link>}
      </nav>
    </div>
  );
}
