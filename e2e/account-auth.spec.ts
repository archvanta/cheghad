import { test, expect } from "@playwright/test";
import { initial } from "../src/data";
// This test uses a mocked account API. Worker crypto/persistence is tested
// separately against the actual local Workers runtime.
test("username login, cloud reload, logout and isolated demo", async ({
  page,
}) => {
  let signedIn = false,
    ledger = structuredClone(initial),
    undo: typeof ledger | null = null,
    reads = 0;
  const password = "OnlyForTests_928";
  await page.route("**/api/**", async (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname;
    const reply = (body: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    if (path.endsWith("/session"))
      return reply(
        signedIn ? { username: "visitor_a" } : { error: "ابتدا وارد شو" },
        signedIn ? 200 : 401,
      );
    if (path.endsWith("/login")) {
      const input = req.postDataJSON();
      expect(input.username).toBe("visitor_a");
      expect(input.credential).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(req.postData()).not.toContain(password);
      signedIn = true;
      return reply({ username: "visitor_a" });
    }
    if (path.endsWith("/logout")) {
      signedIn = false;
      return reply({ ok: true });
    }
    if (!signedIn) return reply({ error: "ابتدا وارد شو" }, 401);
    if (path === "/api/ledger" && req.method() === "GET") {
      reads++;
      return reply({ ledger, undo });
    }
    if (path === "/api/ledger" && req.method() === "PUT") {
      const body = req.postDataJSON();
      expect(body.ledger.revision).toBe(ledger.revision);
      undo = ledger;
      ledger = { ...body.ledger, revision: ledger.revision + 1 };
      return reply({ ledger, undo });
    }
    return reply({ error: "مسیر نامعتبر" }, 404);
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "به چقدر خوش آمدی" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "داشبورد", exact: true }),
  ).toHaveCount(0);
  await page.getByLabel("نام کاربری", { exact: true }).fill("Visitor_A");
  await page.getByLabel("رمز عبور", { exact: true }).fill(password);
  await page.getByRole("button", { name: "ورود", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "داشبورد", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "تنظیمات", exact: true }).click();
  await page.locator('input[name="cash"]').fill("123456");
  await page
    .getByRole("button", { name: "ذخیره تنظیمات مالی", exact: true })
    .click();
  await expect.poll(() => ledger.profile.cash).toBe(123456);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "داشبورد", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "تنظیمات", exact: true }).click();
  await expect(page.locator('input[name="cash"]')).toHaveValue("123456");
  await page.getByRole("button", { name: "خروج از حساب", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "به چقدر خوش آمدی" }),
  ).toBeVisible();
  const before = reads;
  await page.getByRole("button", { name: "مشاهده دمو", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "داشبورد", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "تنظیمات", exact: true }).click();
  await expect(page.locator('input[name="cash"]')).toHaveValue("18000000");
  expect(reads).toBe(before);
  expect(ledger.profile.cash).toBe(123456);
  await page
    .getByRole("button", { name: "بازگشت به ورود", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "به چقدر خوش آمدی" }),
  ).toBeVisible();
});
