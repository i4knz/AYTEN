import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentSession, safeNextPath } from "@/server/web";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "تسجيل الدخول" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const next = safeNextPath(typeof sp.next === "string" ? sp.next : undefined);
  if (await getCurrentSession()) redirect(next);
  return <LoginForm next={next} passwordReset={sp.reset === "1"} />;
}
