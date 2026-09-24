import { redirect } from "next/navigation";
import { listMyStores } from "@/server/stores/service";
import { requireSession } from "@/server/web";

export default async function DashboardIndex() {
  const session = await requireSession("/dashboard");
  const stores = await listMyStores(session.user.id);
  redirect(stores.length ? `/dashboard/${stores[0].id}` : "/onboarding");
}
