import { register } from "@/server/auth/service";
import { createStore } from "@/server/stores/service";

let seq = 0;

export async function makeUser(overrides: Partial<{ name: string; email: string; password: string }> = {}) {
  seq += 1;
  const input = {
    name: overrides.name ?? `تاجر ${seq}`,
    email: overrides.email ?? `merchant${seq}-${Date.now()}@example.com`,
    password: overrides.password ?? "correct horse battery",
    acceptTerms: true,
  };
  const { userId, sessionToken } = await register(input);
  return { userId, sessionToken, ...input };
}

export async function makeStore(userId: string, overrides: Partial<{ name: string; slug: string }> = {}) {
  seq += 1;
  return createStore(userId, {
    name: overrides.name ?? `متجر ${seq}`,
    slug: overrides.slug ?? `store-${seq}-${Date.now().toString(36)}`,
    businessType: "general",
  });
}
