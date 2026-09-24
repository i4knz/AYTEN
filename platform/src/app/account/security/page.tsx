import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Button, Card } from "@/components/ui";
import { listActiveSessions } from "@/server/auth/service";
import { requireSession } from "@/server/web";
import { revokeOtherSessionsAction, revokeSessionAction } from "./actions";
import { ChangePasswordForm, ResendVerification } from "./forms";

export const metadata: Metadata = { title: "أمان الحساب" };

const dateFmt = new Intl.DateTimeFormat("ar-SA-u-nu-latn", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" });

function describeAgent(ua: string | null) {
  if (!ua) return "جهاز غير معروف";
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "متصفح";
  const os = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "";
  return os ? `${browser} على ${os}` : browser;
}

export default async function SecurityPage() {
  const session = await requireSession("/account/security");
  const sessions = await listActiveSessions(session.user.id);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">أمان الحساب</h1>
        <Link href="/dashboard" className="text-sm text-brand">
          العودة للوحة التحكم
        </Link>
      </div>

      <Card className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">البريد الإلكتروني</h2>
            <p className="ltr text-end text-sm text-ink-soft">{session.user.email}</p>
          </div>
          <Badge tone={session.user.emailVerified ? "success" : "warning"}>
            {session.user.emailVerified ? "مؤكد" : "غير مؤكد"}
          </Badge>
        </div>
        {!session.user.emailVerified && <ResendVerification />}
      </Card>

      <Card>
        <h2 className="mb-4 font-semibold">تغيير كلمة المرور</h2>
        <ChangePasswordForm />
      </Card>

      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold">الأجهزة المسجّل دخولها</h2>
          {sessions.length > 1 && (
            <form action={revokeOtherSessionsAction}>
              <Button tone="secondary" type="submit">
                تسجيل الخروج من الأجهزة الأخرى
              </Button>
            </form>
          )}
        </div>
        <ul className="flex flex-col divide-y divide-line">
          {sessions.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-3 py-3">
              <div className="text-sm">
                <p className="font-medium">
                  {describeAgent(s.userAgent)} {s.id === session.sessionId && <Badge tone="success">هذا الجهاز</Badge>}
                </p>
                <p className="text-xs text-ink-soft">
                  آخر نشاط: {dateFmt.format(s.lastSeenAt)}
                  {s.ip && <span className="ltr"> · {s.ip}</span>}
                </p>
              </div>
              {s.id !== session.sessionId && (
                <form action={revokeSessionAction}>
                  <input type="hidden" name="sessionId" value={s.id} />
                  <Button tone="ghost" type="submit" className="text-red-700">
                    إنهاء
                  </Button>
                </form>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </main>
  );
}
