import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { initial } from "./data";
import { entrySchema, monthOf, nextMonth, type Ledger } from "./finance";
import { compareStrategies } from "./strategy";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-27T12:00:00Z"));
});
afterEach(() => vi.useRealTimers());
function example(): Ledger {
  const start = nextMonth(monthOf(), 1);
  const entry = (
    kind: "income" | "installment" | "expense",
    amount: number,
    offset = 0,
    repeat = false,
  ) =>
    entrySchema.parse({
      id: crypto.randomUUID(),
      status: "planned",
      name: "نمونهٔ آزمون",
      kind,
      amount,
      month: nextMonth(start, offset),
      day: 20,
      repeat,
      confirmed: true,
    });
  return {
    ...structuredClone(initial),
    profile: { ...initial.profile, cash: 15e6 },
    entries: [
      entry("income", 25e6, 0, true),
      entry("installment", 17.54e6),
      entry("installment", 10.94e6, 1),
      entry("installment", 7.9e6, 2),
    ],
  };
}
it("بودجه ۱۰ میلیون: اعداد جدول و خالص ۲۳٫۶۲ تصویر را بازتولید می‌کند", () => {
  const l = example(),
    before = JSON.stringify(l);
  const r = compareStrategies(l, nextMonth(monthOf(), 1), 15e6, 10e6);
  expect(r.gold.rows.map((r) => r.buy)).toEqual([0, 4.06e6, 7.1e6]);
  expect(r.gold.rows[0].shortage).toBe(2.54e6);
  expect(r.debt.rows.map((r) => r.buy)).toEqual([12.46e6, 4.06e6, 7.1e6]);
  expect(r.gold.monthlyGold).toBe(11.16e6);
  expect(r.debt.monthlyGold).toBe(23.62e6);
  expect(r.gold.netGold).toBe(23.62e6);
  expect(r.debt.netGold).toBe(23.62e6);
  expect(JSON.stringify(l)).toBe(before);
});
it("بودجه ۱۵ میلیون: کسری هر دو ماه و خالص ۸٫۶۲ تصویر درست است", () => {
  const r = compareStrategies(example(), nextMonth(monthOf(), 1), 15e6, 15e6);
  expect(r.gold.rows.map((r) => r.shortage)).toEqual([7.54e6, 0.94e6, 0]);
  expect(r.gold.monthlyGold).toBe(2.1e6);
  expect(r.debt.monthlyGold).toBe(9.56e6);
  expect(r.gold.netGold).toBe(8.62e6);
  expect(r.debt.netGold).toBe(8.62e6);
});
it("هزینه زندگی دوباره از بودجه نگهداری کسر نمی‌شود", () => {
  const l = example(),
    r = compareStrategies(l, nextMonth(monthOf(), 1), 15e6, 10e6);
  l.entries.push(
    entrySchema.parse({
      id: crypto.randomUUID(),
      status: "planned",
      day: 20,
      name: "زندگی",
      kind: "expense",
      amount: 5e6,
      month: nextMonth(monthOf(), 1),
      repeat: true,
      confirmed: true,
    }),
  );
  const withLiving = compareStrategies(l, nextMonth(monthOf(), 1), 15e6, 10e6);
  expect(withLiving.gold.netGold).toBe(r.gold.netGold);
  expect(withLiving.debt.netGold).toBe(r.debt.netGold);
  l.entries.at(-1)!.amount = 12e6;
  expect(
    compareStrategies(l, nextMonth(monthOf(), 1), 15e6, 10e6).gold.netGold,
  ).toBe(17.62e6);
});
it("مبلغی بیش از بدهی تسویه نمی‌شود و نقد فرضی ساخته نمی‌شود", () => {
  const l = example();
  l.entries = l.entries.filter((e) => e.kind === "income");
  const r = compareStrategies(l, nextMonth(monthOf(), 1), 15e6, 10e6);
  expect(r.paidNow).toBe(0);
  expect(r.gold.netAssets).toBe(r.debt.netAssets);
  l.profile.cash = 0;
  const missing = compareStrategies(l, nextMonth(monthOf(), 1), 15e6, 10e6);
  expect(missing.startingFundingGap).toBe(15e6);
  expect(missing.gold.netAssets).toBe(r.gold.netAssets - 15e6);
});
it("بدهی خارج از افق و مبالغ نامعلوم پنهان نمی‌شوند", () => {
  const l = example();
  l.entries.push(
    entrySchema.parse({
      id: crypto.randomUUID(),
      status: "planned",
      day: 20,
      repeat: false,
      name: "بدهی بعدی",
      kind: "installment",
      amount: 2e6,
      month: nextMonth(monthOf(), 8),
      confirmed: true,
    }),
  );
  const r = compareStrategies(l, nextMonth(monthOf(), 1), 15e6, 10e6);
  expect(r.gold.remainingDebt).toBe(2e6);
  expect(r.gold.netAssets).toBe(21.62e6);
  l.entries[0].amount = null;
  expect(() =>
    compareStrategies(l, nextMonth(monthOf(), 1), 15e6, 10e6),
  ).toThrow();
});
