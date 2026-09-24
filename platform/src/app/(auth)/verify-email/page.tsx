import type { Metadata } from "next";
import { Alert, ButtonLink, Card } from "@/components/ui";
import { verifyEmail } from "@/server/auth/service";
import { getCurrentSession } from "@/server/web";

export const metadata: Metadata = { title: "تأكيد البريد الإلكتروني", referrer: "no-referrer" };

// Verification is idempotent and only flips email_verified_at, so it is safe
// to perform on GET (link scanners opening it cause no harm).
export default async function VerifyEmailPage({ searchParams }: PageProps<"/verify-email">) {
  const { token } = await searchParams;
  const ok = typeof token === "string" && (await verifyEmail(token));
  const session = await getCurrentSession();
  const alreadyVerified = !ok && session?.user.emailVerified;
  return (
    <Card className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">تأكيد البريد الإلكتروني</h1>
      {ok || alreadyVerified ? (
        <Alert tone="success">تم تأكيد بريدك الإلكتروني. شكراً لك!</Alert>
      ) : (
        <Alert>الرابط غير صالح أو انتهت صلاحيته أو استُخدم من قبل. يمكنك طلب رابط جديد من صفحة أمان الحساب.</Alert>
      )}
      <ButtonLink href={session ? (ok || alreadyVerified ? "/dashboard" : "/account/security") : "/login"}>
        {session ? (ok || alreadyVerified ? "المتابعة إلى لوحة التحكم" : "طلب رابط جديد") : "تسجيل الدخول"}
      </ButtonLink>
    </Card>
  );
}
