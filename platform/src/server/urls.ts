/** Public URL of a store's storefront: <slug>.<STOREFRONT_ROOT_DOMAIN>. */
export function storefrontUrl(slug: string): string {
  const protocol = (process.env.APP_URL ?? "http://localhost:3000").startsWith("https://") ? "https" : "http";
  return `${protocol}://${slug}.${process.env.STOREFRONT_ROOT_DOMAIN ?? "localhost:3000"}`;
}
