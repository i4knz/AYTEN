import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentSession, safeNextPath } from "@/server/web";
import { RegisterForm } from "./register-form";

export const metadata: Metadata = { title: "إنشاء حساب" };

export default async function RegisterPage({ searchParams }: PageProps<"/register">) {
  const sp = await searchParams;
  const next = safeNextPath(typeof sp.next === "string" ? sp.next : undefined, "/onboarding");
  if (await getCurrentSession()) redirect(next === "/onboarding" ? "/dashboard" : next);
  return <RegisterForm next={next} />;
}
