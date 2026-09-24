"use client";

import { Button } from "@/components/ui";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      <h1 className="text-xl font-semibold">حدث خطأ غير متوقع</h1>
      <p className="text-sm text-ink-soft">سجّلنا المشكلة. حاول مرة أخرى، وإذا تكررت تواصل مع الدعم.</p>
      <Button onClick={reset} tone="secondary">
        إعادة المحاولة
      </Button>
    </main>
  );
}
