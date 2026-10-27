import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { initial } from "./data";
import {
  entrySchema,
  ledgerSchema,
  parseAmount,
  rial,
  tomans,
  cashflow,
  forecast,
  actualCash,
  recordPayment,
  remaining,
  portfolio,
  scenario,
  monthOf,
  nextMonth,
  dueDate,
  type Kind,
  type Ledger,
} from "./finance";
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-27T12:00:00Z"));
});
afterEach(() => vi.useRealTimers());
const entry = (
  kind: Kind,
  amount: number | null,
  extra: Record<string, unknown> = {},
) =>
  entrySchema.parse({
    id: crypto.randomUUID(),
    name: "عمومی",
    amount,
    kind,
    month: monthOf(),
    day: 1,
    status: "planned",
    repeat: false,
    confirmed: true,
    allowPartial: "yes",
    allowEarly: "yes",
    ...extra,
  });
const ledger = (
  entries: ReturnType<typeof entry>[] = [],
  cash = 0,
): Ledger => ({
  ...structuredClone(initial),
  profile: { ...initial.profile, cash },
  entries,
});
it("ورودی فارسی/عربی و ریال صحیح بدون گردکردن پنهان", () => {
  expect(parseAmount("۱۲٬۳۴۵٫۶")).toBe(12345.6);
  expect(parseAmount("١٠٠")).toBe(100);
  expect(rial(0.1)).toBe(1);
  expect(tomans(1)).toBe(0.1);
  expect(() => parseAmount("1.23")).toThrow();
  expect(() => rial(Number.MAX_SAFE_INTEGER)).toThrow();
});
it("درآمد مورد انتظار نقد نیست و دریافت دوباره شمرده نمی‌شود", () => {
  const e = entry("income", 1000),
    l = ledger([e]);
  expect(actualCash(l)).toBe(0);
  expect(forecast(l, monthOf(), 1)[0].cash).toBe(1000);
  const n = recordPayment(l, e.id, e.month, 1000, "2026-10-27");
  expect(actualCash(n)).toBe(1000);
  expect(forecast(n, monthOf(), 1)[0].cash).toBe(1000);
});
it("پرداخت جزئی و کامل با منع بیش‌پرداخت", () => {
  const e = entry("installment", 1000),
    l = ledger([e], 2000);
  const n = recordPayment(l, e.id, e.month, 400, "2026-10-27");
  expect(remaining(n, e, e.month)).toBe(600);
  expect(actualCash(n)).toBe(1600);
  expect(forecast(n, monthOf(), 1)[0].cash).toBe(1000);
  expect(() => recordPayment(n, e.id, e.month, 601, "2026-10-27")).toThrow();
});
it("شرایط نامعلوم قسط مجوز پرداخت جزئی یا زود نیست", () => {
  const e = entry("installment", 1000, {
      day: 20,
      allowEarly: "unknown",
      allowPartial: "unknown",
    }),
    l = ledger([e], 2000);
  expect(() => recordPayment(l, e.id, e.month, 500, "2026-10-27")).toThrow();
});
it("هزینه نامعلوم هشدار دارد و تاریخ ماه کوتاه درست است", () => {
  const l = ledger([entry("expense", null)]);
  expect(cashflow(l, monthOf()).unknown).toBe(1);
  expect(dueDate("1403-12", 31)).toBe("2025-03-20");
  expect(dueDate("1404-12", 31)).toBe("2026-03-20");
});
it("کسری پیش از روز حقوق منفی باقی می‌ماند", () => {
  const l = ledger([
    entry("income", 2000, { day: 20 }),
    entry("installment", 1000, { day: 7 }),
  ]);
  const r = forecast(l, monthOf(), 1)[0];
  expect(r.cash).toBe(1000);
  expect(r.minimum).toBe(-1000);
});
it("مبلغ تکرارشونده آینده به دریافت قبلی دست نمی‌زند", () => {
  const prev = nextMonth(monthOf(), -1),
    e = entry("income", 1000, {
      month: prev,
      repeat: true,
      revisions: [{ month: monthOf(), amount: 1500 }],
    });
  const l = ledger([e]);
  const n = recordPayment(l, e.id, prev, 1000, dueDate(prev, 1));
  expect(actualCash(n)).toBe(1000);
  expect(cashflow(n, monthOf()).income).toBe(1500);
  expect(forecast(n, monthOf(), 2).at(-1)?.cash).toBe(4000);
});
it("خرید/فروش جزئی طلا و دلار موجودی مستقل و کارمزد دارند", () => {
  const gold = entry("goldBuy", 2100),
    sell = entry("goldSell", 1000),
    usd = entry("usdBuy", 500);
  let l = ledger([gold, sell, usd], 5000);
  l.profile.goldPrice = 1200;
  l.profile.usdPrice = 100;
  l = recordPayment(l, gold.id, gold.month, 2100, "2026-10-27", {
    quantity: "2",
    unitPrice: 1000,
    fee: 100,
  });
  l = recordPayment(l, sell.id, sell.month, 680, "2026-10-27", {
    quantity: "0.5",
    unitPrice: 1400,
    fee: 20,
  });
  l = recordPayment(l, usd.id, usd.month, 500, "2026-10-27", {
    quantity: "5",
    unitPrice: 100,
    fee: 0,
  });
  expect(actualCash(l)).toBe(3080);
  const p = portfolio(l);
  expect(p[0]).toMatchObject({
    quantity: "1.5",
    cost: 1575,
    realized: 155,
    value: 1800,
  });
  expect(p[1].quantity).toBe("5");
  l.profile.goldPrice = 1500;
  expect(actualCash(l)).toBe(3080);
});
it("فروش بیش از موجودی و معامله بدون وزن رد می‌شوند", () => {
  const e = entry("goldSell", 1000),
    l = ledger([e]);
  expect(() =>
    recordPayment(l, e.id, e.month, 1000, "2026-10-27", {
      quantity: "1",
      unitPrice: 1000,
      fee: 0,
    }),
  ).toThrow();
  expect(() => recordPayment(l, e.id, e.month, 1000, "2026-10-27")).toThrow();
});
it("سناریو هدیه/بودجه تخصیص را دوباره وارد نقد نمی‌کند", () => {
  const l = ledger([entry("income", 500)], 1000);
  expect(scenario(l, monthOf(), 3, 500, 0, 0, 0, 0)[0].cash).toBe(1500);
  expect(actualCash(l)).toBe(1000);
});
it("پرداخت زود بدهی بدون تخفیف ثروت تازه نمی‌سازد", () => {
  const l = ledger(
    [
      entry("income", 2000, { day: 20 }),
      entry("expense", 500, { day: 10 }),
      entry("installment", 1000, { day: 7 }),
    ],
    1000,
  );
  const before = JSON.stringify(l);
  const normal = scenario(l, monthOf(), 3, 1000, 0, 0, 0, 0),
    early = scenario(l, monthOf(), 3, 1000, 0, 1000, 0, 0);
  expect(normal.at(-1)?.netWorth).toBe(1500);
  expect(early.at(-1)?.netWorth).toBe(1500);
  expect(early[0].minimum).toBe(-500);
  expect(JSON.stringify(l)).toBe(before);
});
it("سناریو خرید طلای ماهانه را تجمیع و اضافه تخصیص را رد می‌کند", () => {
  const l = ledger([], 5000);
  l.profile.goldPrice = 1000;
  const r = scenario(l, monthOf(), 3, 500, 0, 0, 500, 100);
  expect(r.at(-1)?.goldAccumulated).toBe(800);
  expect(r.at(-1)?.goldValue).toBe(800);
  expect(r.at(-1)?.netWorth).toBe(5000);
  expect(() => scenario(l, monthOf(), 3, 500, 0, 200, 400, 0)).toThrow();
});
it("بدهی خارج از افق هم در خالص دارایی کسر می‌شود", () => {
  const l = ledger(
    [entry("installment", 1000, { month: nextMonth(monthOf(), 6) })],
    2000,
  );
  expect(scenario(l, monthOf(), 3, 0, 0, 0, 0, 0).at(-1)?.netWorth).toBe(1000);
});
it("شناسه تکراری و مقدار منفی در پشتیبان رد می‌شوند", () => {
  const e = entry("income", 100);
  expect(() => ledgerSchema.parse(ledger([e, e]))).toThrow();
  expect(() => ledgerSchema.parse(ledger([entry("expense", 1)], -1))).toThrow();
});
