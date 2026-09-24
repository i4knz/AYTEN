import type { Metadata } from "next";
import Link from "next/link";
import { Alert, Card } from "@/components/ui";
import { ResetPasswordForm } from "./reset-form";

export const metadata: Metadata = { title: "تعيين كلمة مرور جديدة", referrer: "no-referrer" };

export default async function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  const { token } = await searchParams;
  if (typeof token !== "string" || token.length < 20) {
    return (
      <Card>
        <Alert>الرابط غير مكتمل. افتح الرابط من الرسالة مباشرة أو اطلب رابطاً جديداً.</Alert>
        <Link href="/forgot-password" className="mt-4 inline-block text-sm text-brand">
          طلب رابط جديد
        </Link>
      </Card>
    );
  }
  return <ResetPasswordForm token={token} />;
}
