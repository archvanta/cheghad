import { test, expect } from "@playwright/test";
test("قرارداد و قسط واقعی در نقد و بدهی یک بار منظور می‌شوند", async ({
  page,
}) => {
  await page.goto("./");
  await expect(
    page.getByRole("heading", { name: "تصویر مالی تو" }),
  ).toBeVisible();
  if (
    !(await page
      .getByRole("button", { name: "بدهی‌ها", exact: true })
      .isVisible())
  )
    await page.getByText("بیشتر", { exact: true }).click();
  await page.getByRole("button", { name: "بدهی‌ها", exact: true }).click();
  await page.getByLabel("عنوان قرارداد").fill("وام عمومی");
  await page.getByLabel("اعتباردهنده", { exact: true }).fill("اعتبار آزمایشی");
  await page
    .getByRole("button", { name: "ذخیره قرارداد", exact: true })
    .click();
  await page.getByLabel("قرارداد قسط").selectOption({ label: "وام عمومی" });
  await page.getByLabel("عنوان قسط", { exact: true }).fill("قسط نمونه");
  await page.getByLabel("مبلغ قسط").fill("۳۰۰");
  await page.getByRole("button", { name: "افزودن قسط", exact: true }).click();
  await expect(
    page.getByText("مانده ۳۰۰ تومان", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "دفتر مالی", exact: true }).click();
  await page.getByRole("button", { name: "ثبت پرداخت", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "تأیید ثبت" })
    .click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByText("باقی‌مانده: ۰")).toBeVisible();
  await page.getByRole("button", { name: "داشبورد", exact: true }).click();
  await expect(page.locator(".hero-number")).toContainText("‎−۳۰۰");
});
