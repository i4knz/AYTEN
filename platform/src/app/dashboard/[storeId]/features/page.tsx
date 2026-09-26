import type { Metadata } from "next";
import { Card } from "@/components/ui";
import { FEATURE_LIST, getStoreTracking } from "@/server/design/settings";
import { roleHas } from "@/server/stores/permissions";
import { loadStore } from "../access";
import { FeatureToggle } from "./toggle";

export const metadata: Metadata = { title: "المزايا" };

export default async function FeaturesPage({ params }: PageProps<"/dashboard/[storeId]/features">) {
  const { storeId } = await params;
  const { access } = await loadStore(storeId);
  const { features } = await getStoreTracking(storeId);
  const canEdit = roleHas(access.role, "settings.write");
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold">المزايا</h1>
        <p className="text-sm text-ink-soft">فعّل أو أوقف مزايا المتجر حسب احتياجك.</p>
      </div>
      <div className="flex flex-col gap-3">
        {FEATURE_LIST.map((f) => (
          <Card key={f.key} className="flex items-center justify-between gap-4">
            <div>
              <p className="font-semibold">{f.title}</p>
              <p className="text-sm text-ink-soft">{f.body}</p>
            </div>
            <FeatureToggle storeId={storeId} featureKey={f.key} enabled={!!features[f.key]} disabled={!canEdit} label={f.title} />
          </Card>
        ))}
      </div>
    </div>
  );
}
