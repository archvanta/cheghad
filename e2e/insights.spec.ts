import { test, expect, type Page } from "@playwright/test";
async function nav(page: Page, name: string) {
  await expect(page.locator("nav")).toBeVisible();
  if (!(await page.getByRole("button", { name, exact: true }).isVisible()))
    await page.getByText("بیشتر", { exact: true }).click();
  await page.getByRole("button", { name, exact: true }).click();
}
test("تقویم، پیش‌بینی، گزارش CSV و تنظیم واحد واقعی‌اند", async ({ page }) => {
  await page.goto("./");
  await expect(
    page.getByRole("heading", { name: "تصویر مالی تو" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "ثبت جدید", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("عنوان", { exact: true }).fill("هزینه عمومی گزارش");
  await dialog.getByLabel("نوع", { exact: true }).selectOption("expense");
  await dialog.getByLabel("مبلغ (تومان").fill("۱۰۰");
  await dialog.getByRole("button", { name: "ذخیره رویداد" }).click();
  await expect(dialog).toBeHidden();
  await nav(page, "دفتر مالی");
  await page.getByRole("button", { name: "ثبت پرداخت", exact: true }).click();
  await dialog.getByRole("button", { name: "تأیید ثبت" }).click();
  await expect(dialog).toBeHidden();
  await nav(page, "تقویم");
  await expect(page.locator(".calendar-grid")).toBeVisible();
  await expect(
    page.getByText("هزینه عمومی گزارش", { exact: false }),
  ).toBeVisible();
  await nav(page, "پیش‌بینی");
  await expect(page.locator("tbody tr")).toHaveCount(12);
  await page.getByLabel("افق پیش‌بینی", { exact: false }).selectOption("3");
  await expect(page.locator("tbody tr")).toHaveCount(3);
  await nav(page, "گزارش‌ها");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "خروجی CSV واقعی" }).click();
  expect((await download).suggestedFilename()).toMatch(/\.csv$/);
  await nav(page, "تنظیمات");
  await page.getByLabel("واحد نمایش مبالغ").selectOption("rial");
  await page.getByLabel("نمایش اعداد").selectOption("en-US");
  await page.getByRole("button", { name: "ذخیره تنظیمات" }).click();
  await nav(page, "داشبورد");
  await expect(page.locator(".hero-number")).toContainText("-1,000");
  await expect(page.locator(".hero-number")).toContainText("ریال");
  await page.reload();
  await expect(page.locator(".hero-number")).toContainText("-1,000");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
