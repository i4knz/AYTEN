import { getStorefrontData } from "@/server/design/theme";
import { RenderSections } from "@/themes/sections";
import { loadStorefront, loadTheme } from "./data";

export default async function StorefrontHome({ params }: PageProps<"/s/[slug]">) {
  const store = await loadStorefront((await params).slug);
  if (!store?.isOpen) return null; // The layout renders the closed-store page.
  const [theme, data] = await Promise.all([loadTheme(store.id), getStorefrontData(store.id, { name: store.name, whatsapp: store.whatsapp })]);
  return (
    <>
      <h1 className="sr-only">{store.name}</h1>
      <RenderSections theme={theme} data={data} />
    </>
  );
}
