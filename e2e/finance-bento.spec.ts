import { test, expect } from "@playwright/test";
test("Bento dashboard and both budget comparisons work on desktop and mobile", async ({
  page,
}, testInfo) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.clock.install({ time: new Date("2026-10-27T12:00:00Z") });
  await page.goto("/cheghad/");
  await expect(
    page.getByRole("heading", { name: "به چقدر خوش آمدی" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "داشبورد", exact: true }),
  ).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath("login-desktop.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: testInfo.outputPath("login-mobile.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 1360, height: 1000 });
  await page.getByRole("button", { name: "مشاهده دمو", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "داشبورد", exact: true }),
  ).toBeVisible({ timeout: 10000 });
  await expect(
    page.getByRole("button", { name: "دستیار هوش مصنوعی" }),
  ).toHaveCount(0);
  // Synthetic fixture lives only in this isolated browser context.
  const fixture = await page.evaluate(async () => {
    const entries = [
      { kind: "income", amount: 25000000, month: "1405-09", repeat: true },
      {
        kind: "installment",
        amount: 17540000,
        month: "1405-09",
        repeat: false,
      },
      {
        kind: "installment",
        amount: 10940000,
        month: "1405-10",
        repeat: false,
      },
      { kind: "installment", amount: 7900000, month: "1405-11", repeat: false },
    ].map((e) => ({
      ...e,
      id: crypto.randomUUID(),
      name: "نمونه آزمون",
      day: 20,
      status: "planned",
      confirmed: true,
      allowEarly: "yes",
      allowPartial: "yes",
      cancelled: false,
      revisions: [],
    }));
    const ledger = {
      version: 2,
      revision: 0,
      entries,
      payments: [],
      budgets: [],
      history: [],
      profile: {
        cash: 15000000,
        reserve: 0,
        goldGrams: 0,
        goldPrice: null,
        goldCost: null,
        goldFeePct: 0,
        usdUnits: 0,
        usdPrice: null,
        usdCost: null,
        theme: "dark",
      },
    };
    return ledger;
  });
  await page.getByRole("button", { name: "تنظیمات", exact: true }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator('input[type="file"]').setInputFiles({
    name: "synthetic-fixture.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(fixture)),
  });
  await expect(
    page.getByRole("button", { name: "بازگردانی آخرین تغییر", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "داشبورد", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "دارایی خالص", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "۳ ماه", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "۳ ماه", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "تم روشن", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByRole("button", { name: "تم تیره", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.screenshot({
    path: testInfo.outputPath("dashboard-desktop.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  if (
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
  )
    throw Error("Dashboard mobile overflow");
  const navBounds = await page.locator(".sidebar .nav").evaluateAll((nodes) =>
    nodes.map((n) => ({
      left: n.getBoundingClientRect().left,
      right: n.getBoundingClientRect().right,
    })),
  );
  expect(navBounds.every((n) => n.left >= 0 && n.right <= 390)).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("dashboard-mobile.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 1360, height: 1000 });
  await page.getByRole("button", { name: "شبیه‌ساز", exact: true }).click();
  const comparison = page.getByRole("region", {
    name: "مقایسهٔ خرید طلا یا پرداخت بدهی",
  });
  await expect(comparison).toBeVisible();
  await expect(comparison.locator(".strategy-result > strong")).toHaveText([
    "۲۳٫۶۲ میلیون",
    "۲۳٫۶۲ میلیون",
  ]);
  const slider = comparison.getByRole("slider");
  await slider.fill("15");
  await expect(comparison.locator(".strategy-result > strong")).toHaveText([
    "۸٫۶۲ میلیون",
    "۸٫۶۲ میلیون",
  ]);
  await page.screenshot({
    path: testInfo.outputPath("comparison-desktop.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(comparison).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > innerWidth,
  );
  if (overflow) throw new Error("Page overflows mobile viewport");
  await page.screenshot({
    path: testInfo.outputPath("comparison-mobile.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "تنظیمات", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "اتصال اختیاری هوش مصنوعی" }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "درآمد و هزینه", exact: true })
    .click();
  await page.getByRole("button", { name: "درآمد", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "بستن پنجره", exact: true }).click();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: "داشبورد", exact: true }).click();
  await expect(page.locator(".tab-content")).toHaveCSS(
    "animation-name",
    "none",
  );
  await page
    .getByRole("button", { name: "بازگشت به ورود", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "به چقدر خوش آمدی" }),
  ).toBeVisible();
  if (errors.length) throw Error(errors.join("\n"));
  console.log(
    "PASS: dashboard, no AI controls, both reference budgets, mobile layout, settings and entry dialog",
  );
});
