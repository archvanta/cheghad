import { test, expect } from "@playwright/test";
test("دلار با مقدار مستقل و نرخ تومان ذخیره و ارزش‌گذاری می‌شود", async ({
  page,
}) => {
  await page.goto("./");
  await expect(
    page.getByRole("heading", { name: "تصویر مالی تو" }),
  ).toBeVisible();
  if (
    !(await page
      .getByRole("button", { name: "طلا و دلار", exact: true })
      .isVisible())
  )
    await page.getByText("بیشتر", { exact: true }).click();
  await page.getByRole("button", { name: "طلا و دلار", exact: true }).click();
  await page.getByLabel("عنوان دارایی").fill("دلار عمومی");
  await page.getByLabel("نوع دارایی").selectOption("usd");
  await page.getByLabel("قیمت دستی هر").fill("۱۲۰");
  await page.getByRole("button", { name: "ذخیره دارایی", exact: true }).click();
  await page
    .getByLabel("دارایی معامله")
    .selectOption({ label: "دلار عمومی · دلار" });
  await page.getByLabel("مقدار (گرم").fill("۱۰٫۵");
  await page.getByLabel("قیمت معامله هر").fill("۱۰۰");
  await page.getByRole("button", { name: "ذخیره معامله", exact: true }).click();
  await expect(page.getByText("دلار آمریکا · 10.5 دلار")).toBeVisible();
  await page.getByRole("button", { name: "داشبورد", exact: true }).click();
  await expect(page.locator(".hero-number")).toContainText("۱٬۰۵۰");
  await expect(page.getByText("۱٬۲۶۰", { exact: true })).toBeVisible();
});
