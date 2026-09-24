import type { Metadata } from "next";
import Link from "next/link";
import { Alert, ButtonLink, Card } from "@/components/ui";
import { ROLE_LABELS } from "@/server/stores/permissions";
import { getInvitation } from "@/server/team/service";
import { getCurrentSession } from "@/server/web";
import { AcceptInvitation } from "./accept";

export const metadata: Metadata = { title: "دعوة للانضمام", referrer: "no-referrer" };

export default async function InvitePage({ searchParams }: PageProps<"/invite">) {
  const sp = await searchParams;
  const storeId = typeof sp.store === "string" ? sp.store : "";
  const token = typeof sp.token === "string" ? sp.token : "";
  const invitation = await getInvitation(storeId, token);
  const session = await getCurrentSession();
  const here = `/invite?store=${encodeURIComponent(storeId)}&token=${encodeURIComponent(token)}`;

  return (
    <main className="flex flex-1 flex-col items-center px-4 py-10">
      <Link href="/" className="mb-8 text-lg font-bold text-brand">
        Ayten Commerce
      </Link>
      <Card className="flex w-full max-w-md flex-col gap-4">
        {!invitation ? (
          <Alert>الدعوة غير صالحة أو انتهت صلاحيتها أو استُخدمت من قبل. اطلب من صاحب المتجر إرسال دعوة جديدة.</Alert>
        ) : (
          <>
            <h1 className="text-xl font-bold">دعوة للانضمام إلى فريق {invitation.storeName}</h1>
            <p className="text-sm leading-7 text-ink-soft">
              الدور: <strong className="text-ink">{ROLE_LABELS[invitation.role]}</strong>
              <br />
              البريد المدعو: <span className="ltr">{invitation.email}</span>
            </p>
            {!session ? (
              <div className="flex flex-col gap-2">
                <p className="text-sm">سجّل الدخول أو أنشئ حساباً بالبريد المدعو نفسه، ثم ارجع لهذه الصفحة.</p>
                <ButtonLink href={`/login?next=${encodeURIComponent(here)}`}>تسجيل الدخول</ButtonLink>
                <ButtonLink href={`/register?next=${encodeURIComponent(here)}`} tone="secondary">
                  إنشاء حساب
                </ButtonLink>
              </div>
            ) : session.user.email.toLowerCase() !== invitation.email.toLowerCase() ? (
              <Alert tone="warning">
                أنت مسجّل الدخول بالبريد <span className="ltr">{session.user.email}</span>. هذه الدعوة لبريد آخر؛ سجّل الخروج وادخل بالبريد المدعو.
              </Alert>
            ) : (
              <AcceptInvitation storeId={storeId} token={token} />
            )}
          </>
        )}
      </Card>
    </main>
  );
}
