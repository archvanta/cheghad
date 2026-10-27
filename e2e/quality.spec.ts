import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test("دسترس‌پذیری، مسیرها و نمای تبلت بدون خطای اجرایی", async ({ page }) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("./");
  await page
    .getByRole("button", { name: "ادامه بدون راهنما", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "راه‌اندازی خصوصی" }),
  ).toBeHidden();
  for (const route of [
    "dashboard",
    "income",
    "expenses",
    "gold",
    "forecast",
    "settings",
  ]) {
    await page.goto("./#" + route);
    await expect(page.locator("nav")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(
      result.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => ({
          target: n.target,
          reason: n.failureSummary,
        })),
      })),
    ).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.goto("./#dashboard");
  await page.getByRole("button", { name: "تغییر تم" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  const light = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    light.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => ({
        target: n.target,
        summary: n.failureSummary,
      })),
    })),
  ).toEqual([]);
  await page.setViewportSize({ width: 834, height: 1112 });
  await page.goto("./#gold");
  await expect(
    page.getByRole("heading", { name: "طلا و دلار", level: 1 }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/tablet-${test.info().project.name}.png`,
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
