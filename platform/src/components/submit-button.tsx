"use client";

import { useFormStatus } from "react-dom";
import { Button, type ButtonTone } from "./ui";

export function SubmitButton({
  children,
  pendingText = "جارٍ التنفيذ…",
  tone,
  className,
}: {
  children: React.ReactNode;
  pendingText?: string;
  tone?: ButtonTone;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} aria-disabled={pending} tone={tone} className={className}>
      {pending ? pendingText : children}
    </Button>
  );
}
