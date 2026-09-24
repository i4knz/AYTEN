import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex flex-1 flex-col items-center px-4 py-10">
      <Link href="/" className="mb-8 text-lg font-bold text-brand">
        Ayten Commerce
      </Link>
      <div className="w-full max-w-md">{children}</div>
    </main>
  );
}
