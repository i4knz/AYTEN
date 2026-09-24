"use client";

import { useActionState, useState, useTransition } from "react";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Input, Select } from "@/components/ui";
import type { FormState } from "@/server/web";
import { createCategoryAction, deleteCategoryAction, updateCategoryAction } from "../actions";

type Parent = { id: string; name: string };

export function CategoryCreateForm({ storeId, parents }: { storeId: string; parents: Parent[] }) {
  const [state, action] = useActionState<FormState, FormData>(createCategoryAction.bind(null, storeId), {});
  return (
    <form action={action} className="flex flex-col gap-3">
      {state.message && <Alert tone={state.ok ? "success" : "error"}>{state.message}</Alert>}
      <div className="grid gap-3 sm:grid-cols-[1fr_12rem_auto]">
        <Input name="name" required maxLength={80} placeholder="اسم التصنيف" aria-label="اسم التصنيف" defaultValue={state.ok ? undefined : state.values?.name} />
        <Select name="parentId" aria-label="التصنيف الرئيسي" defaultValue="">
          <option value="">تصنيف رئيسي</option>
          {parents.map((p) => (
            <option key={p.id} value={p.id}>
              فرعي من: {p.name}
            </option>
          ))}
        </Select>
        <SubmitButton pendingText="…">إضافة</SubmitButton>
      </div>
      {state.fieldErrors?.parentId && <p className="text-xs text-red-700">{state.fieldErrors.parentId}</p>}
    </form>
  );
}

export function CategoryRow({
  storeId,
  category,
  parents,
  canWrite,
  hasChildren,
}: {
  storeId: string;
  category: { id: string; name: string; parentId: string | null; productCount: number };
  parents: Parent[];
  canWrite: boolean;
  hasChildren: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [state, action] = useActionState<FormState, FormData>(updateCategoryAction.bind(null, storeId, category.id), {});
  const [pending, start] = useTransition();
  const indent = category.parentId ? "ps-8" : "";

  if (editing && canWrite) {
    return (
      <li className={`px-4 py-3 ${indent}`}>
        <form action={action} className="flex flex-col gap-2">
          {state.message && !state.ok && <Alert>{state.message}</Alert>}
          <div className="grid gap-2 sm:grid-cols-[1fr_12rem_auto_auto]">
            <Input name="name" defaultValue={category.name} maxLength={80} aria-label="اسم التصنيف" />
            <Select name="parentId" defaultValue={category.parentId ?? ""} aria-label="التصنيف الرئيسي" disabled={hasChildren}>
              <option value="">تصنيف رئيسي</option>
              {parents.map((p) => (
                <option key={p.id} value={p.id}>
                  فرعي من: {p.name}
                </option>
              ))}
            </Select>
            <SubmitButton pendingText="…">حفظ</SubmitButton>
            <button type="button" className="text-sm text-ink-soft" onClick={() => setEditing(false)}>
              إلغاء
            </button>
          </div>
          {state.ok && <p className="text-xs text-emerald-700">تم الحفظ.</p>}
        </form>
      </li>
    );
  }

  return (
    <li className={`flex items-center justify-between gap-3 px-4 py-3 ${indent}`}>
      <div>
        <p className="font-medium">{category.name}</p>
        <p className="text-xs text-ink-soft">{category.productCount} منتج</p>
      </div>
      {canWrite && (
        <div className="flex gap-3 text-sm">
          <button type="button" className="text-brand" onClick={() => setEditing(true)}>
            تعديل
          </button>
          <button
            type="button"
            disabled={pending}
            className="text-red-700"
            onClick={() =>
              confirm(
                hasChildren
                  ? "حذف التصنيف؟ ستصبح تصنيفاته الفرعية تصنيفات رئيسية، ولن تُحذف المنتجات."
                  : "حذف التصنيف؟ لن تُحذف المنتجات المرتبطة به.",
              ) && start(() => deleteCategoryAction(storeId, category.id))
            }
          >
            حذف
          </button>
        </div>
      )}
    </li>
  );
}
