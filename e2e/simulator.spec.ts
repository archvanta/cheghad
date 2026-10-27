import { test, expect } from "@playwright/test";
test("چهار سناریوی مستقل قابل مقایسه و قابل کپی‌اند", async ({ page }) => {
  await page.goto("./");
  await expect(
    page.getByRole("heading", { name: "تصویر مالی تو" }),
  ).toBeVisible();
  if (
    !(await page
      .getByRole("button", { name: "آزمایشگاه تصمیم", exact: true })
      .isVisible())
  )
    await page.getByText("بیشتر", { exact: true }).click();
  await page
    .getByRole("button", { name: "آزمایشگاه تصمیم", exact: true })
    .click();
  await page.getByLabel("نام سناریو").fill("نگهداری نقد عمومی");
  await page.getByRole("button", { name: "ذخیره و محاسبه سناریو" }).click();
  await expect(page.locator(".comparison > section")).toHaveCount(1);
  for (let i = 1; i < 4; i++) {
    await page
      .getByRole("button", { name: "کپی سناریو", exact: true })
      .first()
      .click();
    await expect(page.locator(".comparison > section")).toHaveCount(i + 1);
  }
  await page.reload();
  await expect(page.locator("nav")).toBeVisible();
  if (
    !(await page
      .getByRole("button", { name: "آزمایشگاه تصمیم", exact: true })
      .isVisible())
  ) {
    await expect(page.getByText("بیشتر", { exact: true })).toBeVisible();
    await page.getByText("بیشتر", { exact: true }).click();
  }
  await page
    .getByRole("button", { name: "آزمایشگاه تصمیم", exact: true })
    .click();
  await expect(page.locator(".comparison > section")).toHaveCount(4);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
