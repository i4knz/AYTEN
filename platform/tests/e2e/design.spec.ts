import { expect, test } from "@playwright/test";
import { createStore, lastEmailLink, register, uniqueEmail } from "./helpers";

test("merchant applies a template, edits a section, publishes it, and adds a policy page", async ({ page, browser }, info) => {
  const email = uniqueEmail("design");
  const slug = `design-${info.project.name}-${Date.now().toString(36)}`;
  await register(page, { name: "لمى", email, password: "correct horse battery" });
  const storeId = await createStore(page, { name: "عطور لمى", slug });
  await page.goto(await lastEmailLink(email, "email_verify"));

  // Minimal setup to publish the store.
  await page.goto(`/dashboard/${storeId}/products/new`);
  await page.getByLabel("اسم المنتج").fill("عطر مسك");
  await page.getByLabel("السعر (ر.س)").fill("150");
  await page.getByLabel("الكمية المتوفرة").fill("5");
  await page.getByRole("button", { name: "حفظ المنتج" }).click();
  await expect(page.getByText("تم حفظ المنتج.")).toBeVisible();
  await page.goto(`/dashboard/${storeId}/settings/shipping`);
  await page.getByLabel("الاسم").last().fill("توصيل");
  await page.getByLabel("السعر (ر.س)").last().fill("20");
  await page.getByRole("button", { name: "إضافة" }).click();
  await expect(page.getByText("تم الحفظ.")).toBeVisible();
  await page.goto(`/dashboard/${storeId}`);
  await page.getByRole("button", { name: "نشر المتجر" }).click();
  await expect(page.getByText("متجرك منشور")).toBeVisible();

  // Theme editor.
  await page.goto(`/dashboard/${storeId}/design`);
  await page.getByRole("button", { name: "القوالب" }).click();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: /فخم/ }).click();
  await page.getByRole("button", { name: "الأقسام" }).click();
  await page.getByRole("button", { name: "بانر رئيسي" }).click();
  await page.getByLabel("العنوان").first().fill("عطور تليق بك");
  await expect(page.getByRole("region", { name: "معاينة" }).getByText("عطور تليق بك")).toBeVisible();
  await page.getByRole("button", { name: "نشر التصميم" }).click();
  await expect(page.getByText("تم نشر التصميم على متجرك.")).toBeVisible();

  // Policy page from a template.
  await page.goto(`/dashboard/${storeId}/pages`);
  await page.getByRole("button", { name: "+ سياسة الاستبدال والاسترجاع" }).click();
  await expect(page.getByLabel("العنوان")).toHaveValue("سياسة الاستبدال والاسترجاع");
  await page.getByLabel("منشورة").check();
  await page.getByRole("button", { name: "حفظ" }).click();
  await expect(page.getByText("تم الحفظ.")).toBeVisible();

  // Shopper sees the published design and the footer link.
  const ctx = await browser.newContext();
  const s = await ctx.newPage();
  await s.goto(`http://${slug}.localhost:3100/`);
  await expect(s.getByRole("heading", { name: "عطور تليق بك" })).toBeVisible();
  const bg = await s.locator('[style*="--color-surface"]').first().evaluate((el) => getComputedStyle(el).getPropertyValue("--color-surface").trim());
  expect(bg).toBe("#0f0f10");
  await s.getByRole("link", { name: "سياسة الاستبدال والاسترجاع" }).click();
  await expect(s.getByRole("heading", { name: "مدة الاسترجاع" })).toBeVisible();
  await ctx.close();
});
