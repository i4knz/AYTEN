import { readFile } from "node:fs/promises";
import { expect, type Page } from "@playwright/test";

export function uniqueEmail(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;
}

/** Latest link of the given kind sent to `to`, read from the log email transport. */
export async function lastEmailLink(to: string, tag: string): Promise<string> {
  let lines: string[] = [];
  await expect
    .poll(async () => {
      const raw = await readFile(".data/e2e/outbox.jsonl", "utf8").catch(() => "");
      lines = raw.trim().split("\n").filter(Boolean);
      return lines.some((l) => {
        const m = JSON.parse(l);
        return m.to === to && m.tag === tag;
      });
    })
    .toBe(true);
  const message = lines.map((l) => JSON.parse(l)).reverse().find((m) => m.to === to && m.tag === tag);
  const url = message.text.match(/https?:\/\/\S+/)?.[0];
  if (!url) throw new Error("no link in email");
  return url;
}

export async function register(page: Page, { name, email, password }: { name: string; email: string; password: string }) {
  await page.goto("/register");
  await page.getByLabel("الاسم").fill(name);
  await page.getByLabel("البريد الإلكتروني").fill(email);
  await page.getByLabel("كلمة المرور").fill(password);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "إنشاء الحساب" }).click();
  await expect(page).toHaveURL(/\/onboarding$/);
}

export async function createStore(page: Page, { name, slug }: { name: string; slug: string }) {
  await page.getByLabel("اسم المتجر").fill(name);
  const slugInput = page.getByLabel("رابط المتجر");
  await slugInput.fill(slug);
  await page.getByLabel("مجال النشاط").selectOption("beauty");
  await page.getByRole("button", { name: "إنشاء المتجر" }).click();
  await expect(page).toHaveURL(/\/dashboard\/[0-9a-f-]{36}\?welcome=1$/);
  return page.url().match(/dashboard\/([0-9a-f-]{36})/)![1];
}

/** Fails the test on horizontal overflow, which breaks RTL layouts on phones. */
export async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}
