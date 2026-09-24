"use client";

import { useActionState, useTransition } from "react";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Input, Select } from "@/components/ui";
import type { FormState } from "@/server/web";
import { changeRoleAction, inviteAction, removeMemberAction, revokeInvitationAction } from "./actions";

type RoleOption = { value: string; label: string };

export function InviteForm({ storeId, roles }: { storeId: string; roles: RoleOption[] }) {
  const [state, action] = useActionState<FormState, FormData>(inviteAction.bind(null, storeId), {});
  return (
    <form action={action} className="flex flex-col gap-3">
      {state.message && <Alert tone={state.ok ? "success" : "error"}>{state.message}</Alert>}
      <div className="grid gap-3 sm:grid-cols-[1fr_12rem_auto]">
        <div>
          <Input name="email" type="email" dir="ltr" required placeholder="email@example.com" aria-label="البريد الإلكتروني" defaultValue={state.ok ? undefined : state.values?.email} />
          {state.fieldErrors?.email && <p className="mt-1 text-xs text-red-700">{state.fieldErrors.email}</p>}
        </div>
        <Select name="role" aria-label="الدور" defaultValue={state.values?.role ?? "orders"}>
          {roles.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </Select>
        <SubmitButton pendingText="جارٍ الإرسال…">إرسال الدعوة</SubmitButton>
      </div>
    </form>
  );
}

export function MemberActions({ storeId, memberId, role, name, roles }: { storeId: string; memberId: string; role: string; name: string; roles: RoleOption[] }) {
  const [pending, start] = useTransition();
  return (
    <div className="flex items-center gap-2">
      <Select
        aria-label={`دور ${name}`}
        defaultValue={role}
        disabled={pending}
        className="w-auto py-1.5"
        onChange={(ev) => {
          const fd = new FormData();
          fd.set("role", ev.target.value);
          start(() => changeRoleAction(storeId, memberId, fd));
        }}
      >
        {roles.map((r) => (
          <option key={r.value} value={r.value}>
            {r.label}
          </option>
        ))}
      </Select>
      <button
        type="button"
        disabled={pending}
        className="text-sm text-red-700"
        onClick={() => confirm(`إزالة ${name} من الفريق؟ سيفقد الوصول فوراً.`) && start(() => removeMemberAction(storeId, memberId))}
      >
        إزالة
      </button>
    </div>
  );
}

export function RevokeInvitation({ storeId, invitationId }: { storeId: string; invitationId: string }) {
  const [pending, start] = useTransition();
  return (
    <button type="button" disabled={pending} className="text-sm text-red-700" onClick={() => start(() => revokeInvitationAction(storeId, invitationId))}>
      إلغاء الدعوة
    </button>
  );
}
