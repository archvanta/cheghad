import { it, expect } from "vitest";
import { AiBudget } from "./quota";
import { MemoryStorage } from "./tests/helpers";
const request = (path: string, body: unknown = {}) =>
  new Request("https://quota" + path, {
    method: "POST",
    body: JSON.stringify(body),
  });
it("تعداد درخواست‌ها در فراخوانی هم‌زمان اتمیک محدود می‌شود", async () => {
  const object = new AiBudget(
    { storage: new MemoryStorage() },
    { AI_REQUESTS_PER_MINUTE: "2", AI_REQUESTS_PER_DAY: "3" },
  );
  const replies = await Promise.all(
    Array.from({ length: 10 }, () => object.fetch(request("/request"))),
  );
  expect(replies.filter((r) => r.status === 200)).toHaveLength(2);
  expect(replies.filter((r) => r.status === 429)).toHaveLength(8);
});
it("رزرو توکن از بودجه عبور نمی‌کند", async () => {
  const object = new AiBudget(
    { storage: new MemoryStorage() },
    { AI_TOKENS_PER_DAY: "100" },
  );
  expect((await object.fetch(request("/tokens", { tokens: 80 }))).status).toBe(
    200,
  );
  expect((await object.fetch(request("/tokens", { tokens: 21 }))).status).toBe(
    429,
  );
});
