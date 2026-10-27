import { it, expect } from "vitest";
import { fromJalali, toJalali, jalaliDays } from "./dates";
it("تبدیل رفت و برگشت و اسفند کبیسه معتبر است", () => {
  expect(fromJalali(1403, 12, 30)).toBe("2025-03-20");
  expect(toJalali("2025-03-21")).toEqual({ jy: 1404, jm: 1, jd: 1 });
  expect(jalaliDays(1403, 12)).toBe(30);
  expect(() => fromJalali(1404, 12, 30)).toThrow();
});
