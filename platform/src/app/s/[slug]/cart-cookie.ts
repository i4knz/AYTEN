import "server-only";
import { cookies } from "next/headers";

// Host-only cookie on the storefront's own host, so carts never leak between stores.
const secure = (process.env.APP_URL ?? "").startsWith("https://");
export const CART_COOKIE = secure ? "__Host-ayten_cart" : "ayten_cart";

export async function readCartToken() {
  return (await cookies()).get(CART_COOKIE)?.value ?? null;
}

export async function writeCartToken(token: string) {
  (await cookies()).set(CART_COOKIE, token, { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
}
