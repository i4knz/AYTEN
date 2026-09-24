import Link from "next/link";
import type { ReactNode } from "react";
import { Alert } from "./ui";

export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
      <Link href="/" className="text-sm text-brand">
        Ayten Commerce
      </Link>
      <h1 className="mb-4 mt-4 text-3xl font-bold">{title}</h1>
      <Alert tone="warning">
        مسودة أولية للنسخة التجريبية، وهي قيد المراجعة القانونية. سيتم إشعار المستخدمين بأي تعديل جوهري قبل سريانه.
      </Alert>
      <div className="mt-6 flex flex-col gap-4 leading-8 text-ink [&_h2]:mt-4 [&_h2]:text-lg [&_h2]:font-semibold [&_ul]:list-disc [&_ul]:ps-6">
        {children}
      </div>
    </main>
  );
}
