import type { Metadata } from "next";
import Link from "next/link";
import { countAudience, getCampaign, SEGMENT_LABELS } from "@/server/marketing/campaigns";
import { loadStore } from "../../../access";
import { CampaignForm } from "./form";

export const metadata: Metadata = { title: "حملة" };

export default async function CampaignPage({ params }: PageProps<"/dashboard/[storeId]/marketing/campaigns/[campaignId]">) {
  const { storeId, campaignId } = await params;
  const { session } = await loadStore(storeId);
  const [campaign, audience] = await Promise.all([campaignId === "new" ? null : getCampaign(session.user.id, storeId, campaignId), countAudience(session.user.id, storeId)]);
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <div>
        <Link href={`/dashboard/${storeId}/marketing/campaigns`} className="text-sm text-brand">→ الحملات</Link>
        <h1 className="mt-1 text-2xl font-bold">{campaign?.name ?? "حملة جديدة"}</h1>
      </div>
      <CampaignForm
        storeId={storeId}
        campaignId={campaign?.id ?? null}
        status={campaign?.status ?? "draft"}
        sentCount={campaign?.sentCount ?? 0}
        segments={Object.entries(SEGMENT_LABELS).map(([k, l]) => ({ value: k, label: `${l} (${audience[k as keyof typeof audience]})` }))}
        initial={{
          name: campaign?.name ?? "",
          subject: campaign?.subject ?? "",
          body: campaign?.body ?? "",
          buttonText: campaign?.buttonText ?? "تسوق الآن",
          buttonLink: campaign?.buttonLink ?? "/",
          segment: campaign?.segment ?? "subscribers",
        }}
      />
    </div>
  );
}
