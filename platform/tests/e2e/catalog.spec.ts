import { expect, test } from "@playwright/test";
import sharp from "sharp";
import { createStore, expectNoHorizontalScroll, lastEmailLink, register, uniqueEmail } from "./helpers";

const PASSWORD = "correct horse battery";

test("merchant adds a product with options and an image, publishes, and a shopper sees it", async ({ page, browser }, info) => {
  const email = uniqueEmail("catalog");
  const slug = `shop-${info.project.name}-${Date.now().toString(36)}`;
  await register(page, { name: "ريم", email, password: PASSWORD });
  const storeId = await createStore(page, { name: "أزياء ريم", slug });

  // Publishing is blocked until email is verified and a product is active.
  await page.getByRole("button", { name: "نشر المتجر" }).click();
  await expect(page.getByText("يجب تأكيد البريد الإلكتروني")).toBeVisible();
  await page.goto(await lastEmailLink(email, "email_verify"));

  // Category.
  await page.goto(`/dashboard/${storeId}/products/categories`);
  await page.getByLabel("اسم التصنيف").fill("فساتين");
  await page.getByRole("button", { name: "إضافة" }).click();
  await expect(page.getByText("تمت إضافة التصنيف.")).toBeVisible();

  // Product with two options.
  await page.goto(`/dashboard/${storeId}/products/new`);
  await page.getByLabel("اسم المنتج").fill("فستان سهرة");
  await page.getByLabel("الوصف").fill("فستان طويل من الشيفون.\nمتوفر بلونين.");
  await page.getByRole("button", { name: /إضافة خيار/ }).click();
  await page.getByLabel("القيم (افصل بينها بفاصلة)").first().fill("أسود، كحلي");
  await page.getByRole("button", { name: /إضافة خيار/ }).click();
  await page.getByLabel("القيم (افصل بينها بفاصلة)").nth(1).fill("S, M");
  await expect(page.getByText("السعر والمخزون لكل نسخة (4)")).toBeVisible();
  await page.getByLabel("سعر أسود / S").fill("350");
  await page.getByRole("button", { name: "السعر", exact: true }).click(); // fill all prices from first row
  await page.getByLabel("السعر قبل الخصم أسود / S").fill("420");
  await page.getByLabel("كمية أسود / S").fill("2");
  await page.getByLabel("كمية أسود / M").fill("5");
  await page.getByLabel("كمية كحلي / S").fill("0");
  await page.getByLabel("كمية كحلي / M").fill("1");
  await page.getByLabel("فساتين").check();
  await page.getByRole("button", { name: "حفظ المنتج" }).click();
  await expect(page.getByText("تم حفظ المنتج.")).toBeVisible();
  await expectNoHorizontalScroll(page);

  // Image upload: re-encoded and shown.
  const png = await sharp({ create: { width: 1200, height: 1200, channels: 3, background: "#223344" } }).png().toBuffer();
  await page.getByLabel("اختر صور المنتج").setInputFiles({ name: "dress.png", mimeType: "image/png", buffer: png });
  await page.getByRole("button", { name: "رفع الصور" }).click();
  await expect(page.getByText("تم رفع الصور.")).toBeVisible();
  await expect(page.locator('img[src*="/media/stores/"]').first()).toBeVisible();

  // Listing shows price and stock.
  await page.goto(`/dashboard/${storeId}/products`);
  await expect(page.getByText("فستان سهرة")).toBeVisible();
  await expect(page.getByText("8 متوفر")).toBeVisible();

  // Shipping is required before publishing.
  await page.goto(`/dashboard/${storeId}/settings/shipping`);
  await page.getByLabel("الاسم").last().fill("توصيل");
  await page.getByLabel("السعر (ر.س)").last().fill("25");
  await page.getByRole("button", { name: "إضافة" }).click();
  await expect(page.getByText("تم الحفظ.")).toBeVisible();

  // Publish.
  await page.goto(`/dashboard/${storeId}`);
  await page.getByRole("button", { name: "نشر المتجر" }).click();
  await expect(page.getByText("متجرك منشور")).toBeVisible();

  // Shopper view in a fresh browser context (not signed in).
  const shopper = await browser.newContext();
  const s = await shopper.newPage();
  await s.goto(`http://${slug}.localhost:3100/`);
  await expect(s.getByRole("link", { name: "فساتين" }).first()).toBeVisible();
  await s.getByRole("link", { name: /فستان سهرة/ }).click();
  await expect(s.getByRole("heading", { name: "فستان سهرة" })).toBeVisible();
  await expect(s.getByText("350 ر.س").first()).toBeVisible();
  await expect(s.getByText("متبقٍ 2 فقط")).toBeVisible();
  await s.getByRole("button", { name: "كحلي" }).click();
  await s.getByRole("button", { name: "S" }).click();
  await expect(s.getByText("نفدت الكمية")).toBeVisible();
  const ld = JSON.parse((await s.locator('script[type="application/ld+json"]').textContent())!);
  expect(ld).toMatchObject({ "@type": "Product", name: "فستان سهرة" });
  await expectNoHorizontalScroll(s);
  await shopper.close();
});

test("owner invites a staff member who joins with limited access", async ({ page, browser }, info) => {
  await register(page, { name: "مالك", email: uniqueEmail("owner"), password: PASSWORD });
  const storeId = await createStore(page, { name: "متجر الفريق", slug: `team-${info.project.name}-${Date.now().toString(36)}` });

  const staffEmail = uniqueEmail("staff");
  await page.goto(`/dashboard/${storeId}/team`);
  await page.getByLabel("البريد الإلكتروني").fill(staffEmail);
  await page.getByLabel("الدور").selectOption("orders");
  await page.getByRole("button", { name: "إرسال الدعوة" }).click();
  await expect(page.getByText(`أرسلنا الدعوة إلى ${staffEmail}`)).toBeVisible();
  await expect(page.getByText("دعوات بانتظار القبول")).toBeVisible();

  const staffCtx = await browser.newContext();
  const staff = await staffCtx.newPage();
  await staff.goto(await lastEmailLink(staffEmail, "store_invitation"));
  await expect(staff.getByRole("heading", { name: "دعوة للانضمام إلى فريق متجر الفريق" })).toBeVisible();
  await staff.getByRole("link", { name: "إنشاء حساب" }).click();
  await staff.getByLabel("الاسم").fill("موظف الطلبات");
  await staff.getByLabel("البريد الإلكتروني").fill(staffEmail);
  await staff.getByLabel("كلمة المرور").fill(PASSWORD);
  await staff.getByRole("checkbox").check();
  await staff.getByRole("button", { name: "إنشاء الحساب" }).click();
  await staff.getByRole("button", { name: "قبول الدعوة" }).click();
  await expect(staff).toHaveURL(new RegExp(`/dashboard/${storeId}$`));

  // Orders staff cannot manage the team or create products.
  expect((await staff.goto(`/dashboard/${storeId}/team`))?.status()).toBe(404);
  expect((await staff.goto(`/dashboard/${storeId}/products/new`))?.status()).toBe(404);
  await staffCtx.close();

  await page.reload();
  await expect(page.getByText("موظف الطلبات")).toBeVisible();
});
