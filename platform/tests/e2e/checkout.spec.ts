import { expect, test, type Page } from "@playwright/test";
import { createStore, expectNoHorizontalScroll, lastEmailLink, register, uniqueEmail } from "./helpers";

const PASSWORD = "correct horse battery";

/** Registers a merchant, verifies email, adds a product (stock 3), a shipping method and a coupon, and publishes. */
async function openShop(page: Page, tag: string) {
  const email = uniqueEmail(tag);
  const slug = `${tag}-${Date.now().toString(36)}`;
  await register(page, { name: "تاجر", email, password: PASSWORD });
  const storeId = await createStore(page, { name: "متجر التجربة", slug });
  await page.goto(await lastEmailLink(email, "email_verify"));

  await page.goto(`/dashboard/${storeId}/products/new`);
  await page.getByLabel("اسم المنتج").fill("شمعة معطرة");
  await page.getByLabel("السعر (ر.س)").fill("80");
  await page.getByLabel("الكمية المتوفرة").fill("3");
  await page.getByRole("button", { name: "حفظ المنتج" }).click();
  await expect(page.getByText("تم حفظ المنتج.")).toBeVisible();

  await page.goto(`/dashboard/${storeId}/settings/shipping`);
  await page.getByLabel("الاسم").last().fill("توصيل الرياض");
  await page.getByLabel("السعر (ر.س)").last().fill("20");
  await page.getByRole("button", { name: "إضافة" }).click();
  await expect(page.getByText("تم الحفظ.")).toBeVisible();

  await page.goto(`/dashboard/${storeId}/marketing/coupons/new`);
  await page.getByLabel("رمز الكوبون").fill("WELCOME10");
  await page.getByLabel("النسبة %").fill("10");
  await page.getByRole("button", { name: "حفظ الكوبون" }).click();
  await expect(page.getByText("WELCOME10")).toBeVisible();

  await page.goto(`/dashboard/${storeId}`);
  await page.getByRole("button", { name: "نشر المتجر" }).click();
  await expect(page.getByText("متجرك منشور")).toBeVisible();
  return { storeId, slug };
}

async function fillCheckout(s: Page, phone = "0551234567") {
  await s.getByLabel("الاسم").fill("سلمى");
  await s.getByLabel("رقم الجوال").fill(phone);
  await s.getByLabel("المدينة").fill("الرياض");
  await s.getByLabel("الحي").fill("النرجس");
}

test("a shopper buys with a coupon and cash on delivery; the merchant fulfils the order", async ({ page, browser }, info) => {
  const { storeId, slug } = await openShop(page, `buy-${info.project.name}`);
  const shopper = await browser.newContext();
  const s = await shopper.newPage();
  const store = `http://${slug}.localhost:3100`;

  await s.goto(`${store}/`);
  await s.getByRole("link", { name: /شمعة معطرة/ }).click();
  await s.getByRole("button", { name: "زيادة الكمية" }).click();
  await s.getByRole("button", { name: "أضف إلى السلة" }).click();
  await expect(s.getByText("أُضيف إلى السلة.")).toBeVisible();
  await expect(s.getByRole("link", { name: "السلة (2)" })).toBeVisible();

  await s.goto(`${store}/cart`);
  await s.getByLabel("كود الخصم").fill("welcome10");
  await s.getByRole("button", { name: "تطبيق" }).click();
  await expect(s.getByText("−16 ر.س")).toBeVisible();
  await s.getByRole("link", { name: "إتمام الطلب" }).click();
  await expectNoHorizontalScroll(s);

  await s.getByRole("button", { name: "تأكيد الطلب" }).click();
  await expect(s.getByRole("alert").first()).toBeVisible();
  await fillCheckout(s);
  // 160 − 16 + 20 shipping = 164
  await expect(s.getByText("164 ر.س").last()).toBeVisible();
  await s.getByRole("button", { name: "تأكيد الطلب" }).click();
  await expect(s.getByRole("heading", { name: "شكراً لك! تم استلام طلبك" })).toBeVisible();
  await expect(s.getByRole("heading", { name: "طلب #1001" })).toBeVisible();
  await expectNoHorizontalScroll(s);

  // Track the order from a fresh session with number + phone.
  const other = await browser.newContext();
  const t = await other.newPage();
  await t.goto(`${store}/track`);
  await t.getByLabel("رقم الطلب").fill("1001");
  await t.getByLabel("رقم الجوال").fill("0551234567");
  await t.getByRole("button", { name: "عرض الطلب" }).click();
  await expect(t.getByRole("heading", { name: "طلب #1001" })).toBeVisible();
  await other.close();

  // Merchant side.
  await page.goto(`/dashboard/${storeId}/orders`);
  await expect(page.getByRole("link", { name: /#1001/ })).toBeVisible();
  await page.getByRole("link", { name: /#1001/ }).click();
  await expect(page.getByRole("main").getByText("سلمى").first()).toBeVisible();
  await page.getByRole("button", { name: "بدء التجهيز" }).click();
  await expect(page.getByRole("main").getByText("قيد التجهيز").first()).toBeVisible();
  await page.getByRole("button", { name: "شحن الطلب" }).click();
  await page.getByLabel("شركة الشحن").fill("سمسا");
  await page.getByLabel("رقم التتبع").fill("SM123");
  await page.getByRole("button", { name: "تأكيد الشحن" }).click();
  await expect(page.getByText("تم شحن الطلب عبر سمسا")).toBeVisible();
  await page.getByRole("button", { name: "تم التسليم" }).click();
  await expect(page.getByText("اكتمل الطلب")).toBeVisible();
  await expectNoHorizontalScroll(page);

  // Stock: 3 - 2 = 1.
  await page.goto(`/dashboard/${storeId}/inventory`);
  await expect(page.getByRole("main").locator("li", { hasText: "شمعة معطرة" })).toContainText("1 متاح");

  // The shopper sees the shipment on their order page.
  await s.reload();
  await expect(s.getByText("SM123").first()).toBeVisible();
  await shopper.close();
});

test("online payment through the test gateway: failure, retry, success", async ({ page, browser }, info) => {
  const { storeId, slug } = await openShop(page, `pay-${info.project.name}`);
  await page.goto(`/dashboard/${storeId}/settings/payments`);
  await page.getByLabel(/الدفع الإلكتروني/).check();
  await page.getByRole("button", { name: "حفظ" }).click();
  await expect(page.getByText("تم حفظ إعدادات الدفع.")).toBeVisible();

  const shopper = await browser.newContext();
  const s = await shopper.newPage();
  const store = `http://${slug}.localhost:3100`;
  await s.goto(`${store}/`);
  await s.getByRole("link", { name: /شمعة معطرة/ }).click();
  await s.getByRole("button", { name: "أضف إلى السلة" }).click();
  await expect(s.getByText("أُضيف إلى السلة.")).toBeVisible();
  await s.goto(`${store}/checkout`);
  await fillCheckout(s, "0559876543");
  await s.getByLabel(/بطاقة مدى/).check();
  await s.getByRole("button", { name: "المتابعة للدفع" }).click();

  await expect(s.getByText("بوابة دفع تجريبية")).toBeVisible();
  await expect(s.getByText("100 ر.س")).toBeVisible();
  await s.getByRole("button", { name: "محاكاة رفض البطاقة" }).click();
  await expect(s.getByText("لم تكتمل عملية الدفع")).toBeVisible();
  await s.getByRole("button", { name: "ادفع الآن" }).click();
  await s.getByRole("button", { name: "محاكاة دفع ناجح" }).click();
  await expect(s.getByText("تم الدفع إلكترونياً بنجاح")).toBeVisible();
  await expect(s.getByText("مدفوع")).toBeVisible();
  await shopper.close();

  await page.goto(`/dashboard/${storeId}/orders`);
  await expect(page.getByText("مدفوع").first()).toBeVisible();
});
