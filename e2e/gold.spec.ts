import { test, expect } from "@playwright/test";
test("خرید و فروش طلا به مانده واقعی متصل‌اند", async ({ page }) => {
  await page.goto("./");
  await expect(
    page.getByRole("heading", { name: "تصویر مالی تو" }),
  ).toBeVisible();
  if (
    !(await page.getByRole("button", { name: "طلا", exact: true }).isVisible())
  )
    await page.getByText("بیشتر", { exact: true }).click();
  await page.getByRole("button", { name: "طلا", exact: true }).click();
  await page.getByLabel("عنوان دارایی").fill("طلا عمومی");
  await page.getByLabel("قیمت دستی هر").fill("۱۰۰۰");
  await page.getByRole("button", { name: "ذخیره دارایی", exact: true }).click();
  await page
    .getByLabel("دارایی معامله")
    .selectOption({ label: "طلا عمومی · گرم" });
  await page.getByLabel("مقدار (گرم").fill("۱٫۵");
  await page.getByLabel("قیمت معامله هر").fill("۱۰۰۰");
  await page.getByRole("button", { name: "ذخیره معامله", exact: true }).click();
  await expect(
    page.getByText("بهای مانده ۱٬۵۰۰", { exact: false }),
  ).toBeVisible();
  await page
    .getByLabel("دارایی معامله")
    .selectOption({ label: "طلا عمومی · گرم" });
  await page.getByLabel("جهت معامله").selectOption("sell");
  await page.getByLabel("مقدار (گرم").fill("۰٫۵");
  await page.getByLabel("قیمت معامله هر").fill("۱۲۰۰");
  await page.getByRole("button", { name: "ذخیره معامله", exact: true }).click();
  await expect(
    page.getByText("بهای مانده ۱٬۰۰۰", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "داشبورد", exact: true }).click();
  await expect(page.locator(".hero-number")).toContainText("۹۰۰");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
