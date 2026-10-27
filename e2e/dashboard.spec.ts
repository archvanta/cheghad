import { test, expect } from "@playwright/test";
test("دفتر واقعی، پرداخت جزئی، ذخیره و نمایش واکنش‌گرا", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("./");
  await expect(
    page.getByRole("heading", { name: "تصویر مالی تو" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "تنظیمات", exact: true }).click();
  await page.getByLabel("موجودی افتتاحیه (تومان)").fill("۱۰۰۰");
  await page.getByRole("button", { name: "ذخیره تنظیمات" }).click();
  await expect(page.getByRole("status")).toContainText("ذخیره‌شده");
  await page.getByRole("button", { name: "ثبت جدید" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("عنوان", { exact: true }).fill("قسط آزمایشی");
  await dialog.getByLabel("نوع", { exact: true }).selectOption("installment");
  await dialog.getByLabel("مبلغ (تومان").fill("۳۰۰");
  await dialog.getByRole("button", { name: "ذخیره رویداد" }).click();
  await expect(dialog).toBeHidden();
  await page.getByRole("button", { name: "دفتر مالی", exact: true }).click();
  await page.getByRole("button", { name: "ثبت پرداخت", exact: true }).click();
  await dialog.getByLabel("مبلغ پرداخت یا دریافت").fill("۱۰۰");
  await dialog.getByRole("button", { name: "تأیید ثبت" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("باقی‌مانده: ۲۰۰")).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "دفتر مالی", exact: true }).click();
  await expect(page.getByText("باقی‌مانده: ۲۰۰")).toBeVisible();
  await page.getByRole("button", { name: "داشبورد", exact: true }).click();
  await expect(page.locator(".hero-number")).toContainText("۹۰۰");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "تغییر تم" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.screenshot({
    path: `test-results/dashboard-${test.info().project.name}.png`,
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
