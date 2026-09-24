"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { Alert } from "@/components/ui";
import type { FormState } from "@/server/web";
import { acceptInvitationAction } from "./actions";

export function AcceptInvitation({ storeId, token }: { storeId: string; token: string }) {
  const [state, action] = useActionState<FormState>(acceptInvitationAction.bind(null, storeId, token), {});
  return (
    <form action={action} className="flex flex-col gap-3">
      {state.message && <Alert>{state.message}</Alert>}
      <SubmitButton pendingText="جارٍ الانضمام…">قبول الدعوة</SubmitButton>
    </form>
  );
}
