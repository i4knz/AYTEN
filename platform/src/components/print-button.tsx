"use client";

import { Printer } from "lucide-react";
import { Button } from "./ui";

export function PrintButton() {
  return (
    <Button type="button" tone="secondary" onClick={() => window.print()} className="print:hidden">
      <Printer className="size-4" aria-hidden />
      طباعة
    </Button>
  );
}
