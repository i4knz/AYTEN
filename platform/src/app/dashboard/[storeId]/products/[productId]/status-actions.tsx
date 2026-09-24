"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui";
import { setProductStatusAction } from "../actions";

export function ProductStatusActions({ storeId, productId, status }: { storeId: string; productId: string; status: "draft" | "active" | "archived" }) {
  const [pending, start] = useTransition();
  if (status === "archived") {
    return (
      <Button tone="secondary" disabled={pending} onClick={() => start(() => setProductStatusAction(storeId, productId, "draft"))}>
        استعادة كمسودة
      </Button>
    );
  }
  return (
    <Button
      tone="ghost"
      className="text-red-700"
      disabled={pending}
      onClick={() => {
        if (confirm("أرشفة المنتج؟ سيختفي من المتجر ويمكنك استعادته لاحقاً.")) start(() => setProductStatusAction(storeId, productId, "archived"));
      }}
    >
      أرشفة
    </Button>
  );
}
