import type { Metadata } from "next";
import { TrackForm } from "./track-form";

export const metadata: Metadata = { title: "تتبع الطلب" };

export default async function TrackPage({ params }: PageProps<"/s/[slug]/track">) {
  const { slug } = await params;
  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 py-8">
      <h1 className="text-2xl font-bold">تتبع طلبك</h1>
      <p className="text-sm text-ink-soft">أدخل رقم الطلب ورقم الجوال المستخدم عند الشراء.</p>
      <TrackForm slug={slug} />
    </div>
  );
}
