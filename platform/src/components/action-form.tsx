"use client";

import { useActionState, type ReactNode } from "react";
import type { FormState } from "@/server/web";
import { SubmitButton } from "./submit-button";
import { Alert, cx, type ButtonTone } from "./ui";

/**
 * A form bound to a server action returning FormState. Shows the result
 * message and every field error, so simple admin forms need no client code.
 */
export function ActionForm({
  action,
  children,
  submitLabel,
  pendingText,
  tone,
  confirmText,
  className,
  inline,
}: {
  action: (prev: FormState, form: FormData) => Promise<FormState>;
  children?: ReactNode;
  submitLabel: string;
  pendingText?: string;
  tone?: ButtonTone;
  confirmText?: string;
  className?: string;
  inline?: boolean;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const errors = Object.values(state.fieldErrors ?? {});
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (confirmText && !confirm(confirmText)) e.preventDefault();
      }}
      className={cx(inline ? "flex flex-wrap items-end gap-2" : "flex flex-col gap-3", className)}
    >
      {state.message && (
        <div className={inline ? "basis-full" : undefined}>
          <Alert tone={state.ok ? "success" : "error"}>
            {state.message}
            {errors.length > 0 && (
              <ul className="mt-1 list-inside list-disc">
                {errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            )}
          </Alert>
        </div>
      )}
      {children}
      <div>
        <SubmitButton tone={tone} pendingText={pendingText}>
          {submitLabel}
        </SubmitButton>
      </div>
    </form>
  );
}
