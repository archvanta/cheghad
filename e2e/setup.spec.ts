import { test, expect } from "@playwright/test";
test("راهنمای خصوصی با تاریخ شمسی و بدون داده ساختگی تکمیل می‌شود", async ({
  page,
}) => {
  await page.goto("./");
  const setup = page.getByRole("region", { name: "راه‌اندازی خصوصی" });
  await expect(setup).toBeVisible();
  await setup.getByRole("button", { name: "ذخیره و ادامه" }).click();
  await setup
    .getByLabel("عنوان درآمد راه‌اندازی")
    .fill("درآمد عمومی راه‌اندازی");
  await setup.getByLabel("مبلغ ماهانه راه‌اندازی").fill("۵۰۰");
  await setup.getByLabel("اولین موعد حقوق روز").selectOption("1");
  await setup.getByRole("button", { name: "ذخیره و ادامه" }).click();
  await setup.getByRole("button", { name: "رد کردن این مرحله" }).click();
  await setup.getByRole("button", { name: "رد کردن این مرحله" }).click();
  await setup.getByLabel("نقد افتتاحیه راه‌اندازی").fill("۱۰۰");
  await setup.getByRole("button", { name: "ذخیره و ادامه" }).click();
  await setup.getByRole("button", { name: "پایان راه‌اندازی" }).click();
  await expect(setup).toBeHidden();
  await page.reload();
  await expect(page.locator(".hero-number")).toContainText("۱۰۰");
  await expect(setup).toBeHidden();
});
