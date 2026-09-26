import { expect, test } from "@playwright/test";
import { Client } from "pg";
import { createStore, expectNoHorizontalScroll, register, uniqueEmail } from "./helpers";

const PASSWORD = "correct horse battery";
const OWNER_URL = process.env.TEST_DATABASE_OWNER_URL ?? "postgres://ayten_owner:ayten_owner_dev@localhost:5432/ayten_test";

async function grantPlatformOwner(email: string) {
  const c = new Client({ connectionString: OWNER_URL });
  await c.connect();
  try {
    await c.query(`insert into platform_admins (user_id, role) select id, 'owner' from users where email = $1 on conflict (user_id) do nothing`, [email]);
  } finally {
    await c.end();
  }
}

test("merchant uses the platform area and the platform owner confirms their subscription", async ({ page, browser }, info) => {
  const email = uniqueEmail("plat");
  await register(page, { name: "ريم", email, password: PASSWORD });
  const storeName = `متجر ريم ${info.project.name}`;
  const subject = `استفسار عن التحويل ${info.project.name}`;
  const storeId = await createStore(page, { name: storeName, slug: `plat-${info.project.name}-${Date.now().toString(36)}` });

  // Subscription: trial on the default plan, then request an upgrade invoice.
  await page.goto(`/dashboard/${storeId}/billing`);
  await expect(page.getByText("فترة تجريبية").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "الأساسية" })).toBeVisible();
  await expectNoHorizontalScroll(page);
  await page.getByRole("radio", { name: "سنوي" }).click();
  await page.locator("form").filter({ has: page.getByRole("heading", { name: "الأساسية" }) }).getByRole("button", { name: "الترقية لهذه الباقة" }).click();
  await expect(page.getByText(/صدرت الفاتورة رقم \d+/)).toBeVisible();
  await expect(page.getByRole("heading", { name: /فاتورة بانتظار الدفع/ })).toBeVisible();

  // Help center: open a ticket.
  await page.goto(`/dashboard/${storeId}/help`);
  await expect(page.getByRole("heading", { name: "كيف نقدر نساعدك؟" })).toBeVisible();
  await page.getByRole("link", { name: "فتح تذكرة جديدة" }).click();
  await page.getByLabel("نوع المشكلة").selectOption("payments");
  await page.getByLabel("العنوان").fill(subject);
  await page.getByLabel("التفاصيل").fill("متى يصل مبلغ الاشتراك بعد التحويل البنكي؟");
  await page.getByRole("button", { name: "إرسال التذكرة" }).click();
  await expect(page).toHaveURL(/\/help\/tickets\/[0-9a-f-]{36}$/);
  await expect(page.getByText("متى يصل مبلغ الاشتراك بعد التحويل البنكي؟")).toBeVisible();

  // Referrals and apps.
  await page.goto(`/dashboard/${storeId}/referrals`);
  await expect(page.getByLabel("رابط الإحالة")).toHaveValue(/\/register\?ref=[A-Z0-9]{8}$/);
  await page.goto(`/dashboard/${storeId}/apps`);
  await page.getByRole("switch", { name: "تفعيل ملف منتجات Google" }).click();
  await expect(page.getByLabel("رابط ملف المنتجات")).toHaveValue(/\/feeds\/google\.xml$/);

  // A merchant is not an admin: /admin does not exist for them.
  expect((await page.goto("/admin"))?.status()).toBe(404);

  // The platform owner confirms the transfer in the admin panel.
  await grantPlatformOwner(email);
  const admin = await (await browser.newContext({ storageState: await page.context().storageState() })).newPage();
  await admin.goto("/admin");
  await expect(admin.getByRole("heading", { name: "نظرة عامة على المنصة" })).toBeVisible();
  await expectNoHorizontalScroll(admin);
  await admin.goto("/admin/invoices?status=issued");
  const card = admin.locator("li").filter({ hasText: storeName }).first();
  await card.getByLabel("مرجع التحويل").fill("TRX-E2E");
  admin.once("dialog", (d) => d.accept());
  await card.getByRole("button", { name: "تأكيد الدفع" }).click();
  // Paid invoices leave the "awaiting payment" queue and show up as paid with their reference.
  await expect(admin.locator("li").filter({ hasText: storeName })).toHaveCount(0);
  await admin.goto("/admin/invoices?status=paid");
  await expect(admin.locator("li").filter({ hasText: storeName }).filter({ hasText: "مرجع TRX-E2E" }).first()).toBeVisible();

  await admin.goto("/admin/tickets");
  await admin.getByRole("link", { name: new RegExp(subject) }).click();
  await admin.getByLabel("الرد", { exact: true }).fill("وصلنا التحويل وتم التفعيل.");
  await admin.getByRole("button", { name: "إرسال" }).click();
  await expect(admin.getByText("أُرسل الرد للتاجر.")).toBeVisible();

  await page.goto(`/dashboard/${storeId}/billing`);
  const main = page.getByRole("main");
  await expect(main.getByText("نشط", { exact: true })).toBeVisible();
  await expect(main.getByText("الباقة الحالية").locator("xpath=following-sibling::p")).toHaveText("الأساسية");
});
