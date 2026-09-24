import Link from "next/link";
import { Alert, Card } from "@/components/ui";
import { getSetupChecklist } from "@/server/stores/service";
import { storefrontUrl } from "@/server/urls";
import { roleHas } from "@/server/stores/permissions";
import { loadStore } from "./access";
import { PublishCard } from "./publish-card";

export default async function StoreHome({ params, searchParams }: PageProps<"/dashboard/[storeId]">) {
  const { storeId } = await params;
  const { welcome } = await searchParams;
  const { session, access } = await loadStore(storeId);
  const checklist = await getSetupChecklist(access);
  const available = checklist.filter((i) => i.available && i.key !== "publish");
  const upcoming = checklist.filter((i) => !i.available);
  const pending = available.filter((i) => !i.done);
  const doneCount = available.length - pending.length;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      {welcome === "1" && (
        <Alert tone="success">
          تم إنشاء متجرك <strong>{access.store.name}</strong>. أكمل الخطوات أدناه بالترتيب الذي يناسبك.
        </Alert>
      )}
      {!session.user.emailVerified && (
        <Alert tone="warning">
          لم تؤكد بريدك الإلكتروني بعد. أرسلنا لك رابط التأكيد.{" "}
          <Link href="/account/security" className="font-semibold underline">
            إعادة الإرسال
          </Link>
        </Alert>
      )}

      <div>
        <h1 className="text-2xl font-bold">أهلاً {session.user.name}</h1>
        <p className="text-sm text-ink-soft">
          رابط متجرك:{" "}
          <a href={storefrontUrl(access.store.slug)} target="_blank" rel="noopener" className="ltr text-brand hover:underline">
            {new URL(storefrontUrl(access.store.slug)).host}
          </a>
        </p>
      </div>

      <PublishCard
        storeId={storeId}
        status={access.store.status}
        storeUrl={storefrontUrl(access.store.slug)}
        canPublish={roleHas(access.role, "settings.write")}
        blockers={[
          ...(checklist.find((i) => i.key === "verify_email")?.done ? [] : ["أكّد البريد الإلكتروني لمالك المتجر."]),
          ...(checklist.find((i) => i.key === "product_active")?.done ? [] : ["انشر منتجاً واحداً على الأقل."]),
        ]}
      />

      <Card>
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold">إعداد المتجر</h2>
          <span className="text-sm text-ink-soft">
            {doneCount} من {available.length} مكتملة
          </span>
        </div>
        <div className="mb-5 h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
          <div className="h-full rounded-full bg-brand" style={{ width: `${(doneCount / Math.max(available.length, 1)) * 100}%` }} />
        </div>
        {pending.length === 0 ? (
          <p className="text-sm text-ink-soft">أكملت كل الخطوات المتاحة حالياً. 🎉</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {pending.map((item) => (
              <li key={item.key} className="flex items-center justify-between gap-4 py-3">
                <span className="text-sm">{item.label}</span>
                {item.href && (
                  <Link href={item.href} className="text-sm font-semibold text-brand">
                    ابدأ
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <h2 className="mb-1 text-lg font-semibold">قادم في الأيام القادمة</h2>
        <p className="mb-4 text-sm leading-7 text-ink-soft">
          نبني هذه الخطوات الآن ضمن النسخة التجريبية. ستظهر هنا تلقائياً عند جاهزيتها.
        </p>
        <ul className="grid gap-2 sm:grid-cols-2">
          {upcoming.map((item) => (
            <li key={item.key} className="rounded-xl bg-muted px-3 py-2 text-sm text-ink-soft">
              {item.label}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
