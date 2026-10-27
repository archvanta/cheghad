import { test, expect } from "@playwright/test";
test("تکرار، بودجه، پرداخت مستقل و بازگردانی تغییر", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("./");
  await page
    .getByRole("button", { name: "برنامه و بودجه", exact: true })
    .click();
  await page.getByLabel("نام دسته", { exact: true }).fill("رفت‌وآمد عمومی");
  await page.getByLabel("بودجه ماهانه").fill("۴۰");
  await page.getByRole("button", { name: "افزودن دسته", exact: true }).click();
  await expect(page.getByText("رفت‌وآمد عمومی · پرداخت واقعی")).toBeVisible();
  await page.getByLabel("عنوان تکرار").fill("هزینه تکراری عمومی");
  await page.getByLabel("نوع تکرار", { exact: true }).selectOption("expense");
  await page.getByLabel("مبلغ تکرار").fill("۲۰۰");
  await page.getByLabel("دسته تکرار").selectOption({ label: "رفت‌وآمد عمومی" });
  await page.getByRole("button", { name: "افزودن قاعده", exact: true }).click();
  await expect(page.getByText("هزینه تکراری عمومی · هزینه")).toBeVisible();
  await page.getByRole("button", { name: "دفتر مالی", exact: true }).click();
  const first = page.locator(".entry").first();
  await first.getByRole("button", { name: "ثبت پرداخت", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("مبلغ پرداخت یا دریافت").fill("۵۰");
  await dialog.getByRole("button", { name: "تأیید ثبت" }).click();
  await expect(dialog).toBeHidden();
  await expect(first).toContainText("باقی‌مانده: ۱۵۰");
  await page
    .getByRole("button", { name: "برنامه و بودجه", exact: true })
    .click();
  const rule = page
    .locator("details")
    .filter({
      has: page.locator("summary", { hasText: "هزینه تکراری عمومی" }),
    });
  await rule.locator(":scope > summary").click();
  await rule.getByLabel("مبلغ جدید").fill("۳۰۰");
  await rule.getByRole("button", { name: "ذخیره مبلغ آینده" }).click();
  await expect(rule).toContainText("۳۰۰");
  await page
    .getByRole("button", { name: "بازگردانی آخرین تغییر", exact: true })
    .click();
  await expect(rule).not.toContainText("۳۰۰");
  await page.reload();
  await page.getByRole("button", { name: "دفتر مالی", exact: true }).click();
  await expect(page.locator(".entry").first()).toContainText("باقی‌مانده: ۱۵۰");
  await page
    .getByRole("button", { name: "برنامه و بودجه", exact: true })
    .click();
  const budget = page
    .locator("details")
    .filter({ has: page.locator("summary", { hasText: "رفت‌وآمد عمومی" }) });
  await budget.locator("summary").click();
  await expect(budget).toContainText("اضافه‌مصرف: ۱۰");
  expect(errors).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
