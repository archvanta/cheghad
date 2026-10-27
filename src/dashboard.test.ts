import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { initial } from "./data";
import {
  entrySchema,
  monthOf,
  nextMonth,
  recordPayment,
  type Ledger,
} from "./finance";
import {
  dashboardHistory,
  dashboardSnapshot,
  upcomingPayments,
} from "./dashboard";
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-27T12:00:00Z"));
});
afterEach(() => vi.useRealTimers());
function example(): Ledger {
  return {
    ...structuredClone(initial),
    profile: {
      ...initial.profile,
      cash: 1000,
      goldGrams: 2,
      goldCost: 2000,
      goldPrice: 1500,
      usdUnits: 5,
      usdCost: 500,
      usdPrice: 120,
    },
    entries: [
      entrySchema.parse({
        id: "salary",
        name: "حقوق",
        kind: "income",
        amount: 2000,
        month: monthOf(),
        day: 7,
        status: "planned",
        repeat: false,
      }),
      entrySchema.parse({
        id: "debt",
        name: "بدهی",
        kind: "installment",
        amount: 500,
        month: nextMonth(monthOf(), 4),
        day: 7,
        status: "planned",
        repeat: false,
      }),
    ],
  };
}
it("خالص دارایی شامل درآمد دریافت‌نشده نیست و بدهی آینده را کسر می‌کند", () => {
  expect(dashboardSnapshot(example())).toMatchObject({
    cash: 1000,
    total: 4600,
    debt: 500,
    netWorth: 4100,
    gain: 1100,
    gainPct: 44,
  });
});
it("نرخ یا مبلغ بدهی نامعلوم با مقدار صفر پنهان نمی‌شود", () => {
  const l = example();
  l.profile.goldPrice = null;
  expect(dashboardSnapshot(l).netWorth).toBeNull();
  l.profile.goldPrice = 1500;
  l.entries[1].amount = null;
  expect(dashboardSnapshot(l).netWorth).toBeNull();
  expect(dashboardSnapshot(l).debt).toBeNull();
});
it("تاریخچه فقط دریافت واقعی را در ماه خودش می‌شمارد", () => {
  let l = example();
  expect(dashboardHistory(l, 3).at(-1)?.incoming).toBe(0);
  l = recordPayment(l, "salary", monthOf(), 2000, "2026-10-27");
  const history = dashboardHistory(l, 3);
  expect(history.map((r) => r.incoming)).toEqual([0, 0, 0.002]);
  expect(history.at(-1)?.cash).toBe(3000);
  expect(history[0].cash).toBe(1000);
  expect(history.map((r) => r.gold)).toEqual([0.003, 0.003, 0.003]);
});
it("پرداخت‌های پیش رو فقط ماندهٔ پرداخت‌نشده را نشان می‌دهند", () => {
  const l = example();
  l.entries[1].month = monthOf();
  expect(upcomingPayments(l).map((r) => r.entry.id)).toEqual(["debt"]);
  l.entries[1].allowEarly = "yes";
  const paid = recordPayment(l, "debt", monthOf(), 500, "2026-10-27");
  expect(upcomingPayments(paid)).toHaveLength(0);
});
