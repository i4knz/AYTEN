import type { Metadata } from "next";
import { getPaymentSettings, onlinePaymentsAvailable } from "@/server/commerce/shipping";
import { toMajorString } from "@/server/lib/money";
import { roleHas } from "@/server/stores/permissions";
import { loadStore } from "../../access";
import { PaymentsForm } from "./payments-form";

export const metadata: Metadata = { title: "الدفع" };

export default async function PaymentsPage({ params }: PageProps<"/dashboard/[storeId]/settings/payments">) {
  const { storeId } = await params;
  const { session, access } = await loadStore(storeId);
  const p = await getPaymentSettings(session.user.id, storeId);
  return (
    <PaymentsForm
      storeId={storeId}
      canEdit={roleHas(access.role, "settings.write")}
      onlineAvailable={onlinePaymentsAvailable()}
      testMode={process.env.PAYMENT_GATEWAY === "test"}
      initial={{
        codEnabled: p.cod.enabled,
        codFee: p.cod.fee ? toMajorString(p.cod.fee) : "",
        bankEnabled: p.bankTransfer.enabled,
        bankName: p.bankTransfer.bankName ?? "",
        accountName: p.bankTransfer.accountName ?? "",
        iban: p.bankTransfer.iban ?? "",
        onlineEnabled: p.online.enabled,
      }}
    />
  );
}
