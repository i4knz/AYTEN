import { expect, test } from "@playwright/test";
import { createStore, expectNoHorizontalScroll, lastEmailLink, register, uniqueEmail } from "./helpers";

const PASSWORD = "correct horse battery";

test("merchant signs up, creates a store, verifies email and edits settings", async ({ page }, info) => {
  const email = uniqueEmail("journey");
  const slug = `e2e-${info.project.name}-${Date.now().toString(36)}`;

  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expectNoHorizontalScroll(page);

  await register(page, { name: "سارة", email, password: PASSWORD });
  await expectNoHorizontalScroll(page);

  // Slug suggestion from an Arabic name; the merchant then sets their own.
  await page.getByLabel("اسم المتجر").fill("عطور نجد");
  await expect(page.getByLabel("رابط المتجر")).toHaveValue(/^atwr-njd/);
  const storeId = await createStore(page, { name: "عطور نجد", slug });

  await expect(page.getByText("تم إنشاء متجرك")).toBeVisible();
  await expect(page.getByText("لم تؤكد بريدك الإلكتروني بعد")).toBeVisible();
  await expect(page.getByText(`${slug}.localhost:3100`).first()).toBeVisible();
  await expectNoHorizontalScroll(page);

  // Verify email via the link that was "sent".
  await page.goto(await lastEmailLink(email, "email_verify"));
  await expect(page.getByText("تم تأكيد بريدك الإلكتروني")).toBeVisible();
  await page.goto(`/dashboard/${storeId}`);
  await expect(page.getByText("لم تؤكد بريدك الإلكتروني بعد")).toHaveCount(0);

  // Settings: validation error, then a successful save.
  await page.goto(`/dashboard/${storeId}/settings`);
  await page.getByLabel("رقم واتساب").fill("12345");
  await page.getByRole("button", { name: "حفظ التغييرات" }).click();
  await expect(page.getByText("أدخل رقم جوال سعودي صحيحاً")).toBeVisible();
  await page.getByLabel("رقم واتساب").fill("0501234567");
  await page.getByRole("button", { name: "حفظ التغييرات" }).click();
  await expect(page.getByText("تم حفظ التغييرات.")).toBeVisible();
  await expectNoHorizontalScroll(page);

  // The storefront subdomain resolves to this store and shows the WhatsApp button.
  await page.goto(`http://${slug}.localhost:3100/`);
  await expect(page.getByRole("heading", { name: "عطور نجد" })).toBeVisible();
  await expect(page.getByRole("link", { name: "تواصل معنا عبر واتساب" })).toHaveAttribute("href", "https://wa.me/966501234567");
});

test("a merchant cannot open another merchant's dashboard", async ({ browser }, info) => {
  const alice = await browser.newContext();
  const bob = await browser.newContext();
  const a = await alice.newPage();
  const b = await bob.newPage();

  await register(a, { name: "علياء", email: uniqueEmail("alice"), password: PASSWORD });
  const aliceStore = await createStore(a, { name: "متجر علياء", slug: `alice-${info.project.name}-${Date.now().toString(36)}` });

  await register(b, { name: "بدر", email: uniqueEmail("bob"), password: PASSWORD });
  for (const path of [`/dashboard/${aliceStore}`, `/dashboard/${aliceStore}/settings`]) {
    const res = await b.goto(path);
    expect(res?.status(), path).toBe(404);
    await expect(b.getByText("متجر علياء")).toHaveCount(0);
  }
  await alice.close();
  await bob.close();
});

test("signed-out users are sent to login and returned after signing in", async ({ page }) => {
  const email = uniqueEmail("return");
  await register(page, { name: "خالد", email, password: PASSWORD });
  await page.getByRole("button", { name: "إنشاء الحساب" }).count(); // already on onboarding
  await page.context().clearCookies();

  await page.goto("/account/security");
  await expect(page).toHaveURL(/\/login\?next=%2Faccount%2Fsecurity$/);
  await page.getByLabel("البريد الإلكتروني").fill(email);
  await page.getByLabel("كلمة المرور").fill("wrong password here");
  await page.getByRole("button", { name: "دخول" }).click();
  await expect(page.getByText("البريد الإلكتروني أو كلمة المرور غير صحيحة.")).toBeVisible();
  await page.getByLabel("كلمة المرور").fill(PASSWORD);
  await page.getByRole("button", { name: "دخول" }).click();
  await expect(page).toHaveURL(/\/account\/security$/);
  await expect(page.getByText("هذا الجهاز")).toBeVisible();
});

test("password reset works end to end and signs out other sessions", async ({ page, browser }) => {
  const email = uniqueEmail("reset");
  await register(page, { name: "نورة", email, password: PASSWORD });

  const other = await browser.newContext();
  const o = await other.newPage();
  await o.goto("/forgot-password");
  await o.getByLabel("البريد الإلكتروني").fill(email);
  await o.getByRole("button", { name: "إرسال الرابط" }).click();
  await expect(o.getByText("إذا كان البريد مسجلاً لدينا")).toBeVisible();

  await o.goto(await lastEmailLink(email, "password_reset"));
  await o.getByLabel("كلمة المرور الجديدة").fill("a brand new passphrase");
  await o.getByRole("button", { name: "حفظ كلمة المرور" }).click();
  await expect(o).toHaveURL(/\/login\?reset=1$/);
  await expect(o.getByText("تم تغيير كلمة المرور")).toBeVisible();

  // The original browser session was revoked by the reset.
  await page.goto("/account/security");
  await expect(page).toHaveURL(/\/login/);
  await other.close();
});

test("unknown storefronts and direct /s/ paths return 404", async ({ page }) => {
  expect((await page.goto("http://no-such-store.localhost:3100/"))?.status()).toBe(404);
  expect((await page.goto("/s/anything"))?.status()).toBe(404);
});
