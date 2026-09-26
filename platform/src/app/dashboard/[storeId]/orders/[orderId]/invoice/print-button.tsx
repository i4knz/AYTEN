"use client";

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="mt-8 rounded-xl bg-black px-4 py-2 text-white print:hidden">
      طباعة
    </button>
  );
}
