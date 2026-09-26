import type { Metadata } from "next";
import { ActionForm } from "@/components/action-form";
import { Badge, Card, Input, Pagination } from "@/components/ui";
import { adminCan } from "@/server/admin/access";
import { listMerchants } from "@/server/admin/stores";
import { loadAdmin } from "../access";
import { revokeSessionsAction } from "../actions";
import { dateFmt, dateTimeFmt, num } from "../format";

export const metadata: Metadata = { title: "التجار" };

export default async function AdminMerchantsPage({ searchParams }: PageProps<"/admin/merchants">) {
  const { session, admin } = await loadAdmin("stores.read");
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const page = Math.max(1, Number(sp.page) || 1);
  const data = await listMerchants(session.user.id, { q, page });
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <h1 className="text-2xl font-bold">التجار ({num(data.total)})</h1>
      <form className="flex gap-2" role="search">
        <Input name="q" defaultValue={q} placeholder="الاسم أو البريد" aria-label="بحث" className="max-w-sm" />
        <button type="submit" className="rounded-xl bg-ink px-4 text-sm font-semibold text-white">
          بحث
        </button>
      </form>
      <Card className="p-0">
        <ul className="divide-y divide-line">
          {data.merchants.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
              <div className="min-w-0">
                <p className="font-medium">
                  {m.name} {m.emailVerifiedAt ? <Badge tone="success">مؤكد</Badge> : <Badge tone="warning">غير مؤكد</Badge>}
                </p>
                <p className="ltr text-end text-xs text-ink-soft">{m.email}</p>
                <p className="text-xs text-ink-soft">
                  سجّل {dateFmt.format(m.createdAt)} · {num(m.stores)} متجر · آخر دخول {m.lastLoginAt ? dateTimeFmt.format(m.lastLoginAt) : "—"}
                  {m.referredBy && ` · دعاه ${m.referredBy}`}
                </p>
              </div>
              {adminCan(admin, "stores.manage") && m.activeSessions > 0 && (
                <ActionForm action={revokeSessionsAction.bind(null, m.id)} submitLabel={`تسجيل الخروج من ${m.activeSessions} جهاز`} tone="secondary" confirmText="تسجيل خروج هذا الحساب من كل الأجهزة؟" inline />
              )}
            </li>
          ))}
        </ul>
      </Card>
      <Pagination page={data.page} pageCount={data.pageCount} href={(p) => `/admin/merchants?${new URLSearchParams({ ...(q && { q }), page: String(p) })}`} />
    </div>
  );
}
