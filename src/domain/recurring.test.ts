import { expect, it } from "vitest";
import { emptyState, ruleSchema, stateSchema, type Rule } from "./model";
import { expandEntries, reviseRule, budgetReport } from "./recurring";
import { addPayment, summary } from "./engine";
const makeRule = (extra: Partial<Rule> = {}): Rule =>
  ruleSchema.parse({
    id: crypto.randomUUID(),
    title: "نمونه عمومی",
    kind: "income",
    start: "2025-03-21",
    end: null,
    frequency: "monthly",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    revisions: [{ from: "2025-03-21", amount: 1000 }],
    ...extra,
  });
it("ماهانه شمسی و شناسه پایدار و عدم ایجاد پرداخت واقعی", () => {
  const s = { ...emptyState(), rules: [makeRule()] };
  const e = expandEntries(s, "2025-05-21");
  expect(e.map((x) => x.dueDate)).toEqual(
    ["2025-03-21", "2025-04-21", "2025-05-22"].filter((d) => d <= "2025-05-21"),
  );
  expect(expandEntries(s, "2025-05-21")).toEqual(e);
  expect(summary(s, "2025-03-21", "2025-04-20", "2025-03-21").cash).toBe(0);
});
it("روز ۳۱ ماه در ماه کوتاه و بازگشت به روز اصلی در بهار", () => {
  const r = makeRule({
    start: "2025-08-22",
    revisions: [{ from: "2025-08-22", amount: 10 }],
  });
  const dates = expandEntries(
    { ...emptyState(), rules: [r] },
    "2026-05-01",
  ).map((e) => e.dueDate);
  expect(dates).toContain("2025-10-22");
  expect(dates).toContain("2026-03-20");
  expect(dates).toContain("2026-04-20");
});
it("تکرار هفتگی و روزانه با پایان شامل آخرین روز", () => {
  for (const [frequency, expected] of [
    ["daily", 8],
    ["weekly", 2],
  ] as const) {
    const r = makeRule({ frequency, end: "2025-03-28" });
    expect(
      expandEntries({ ...emptyState(), rules: [r] }, "2025-05-01"),
    ).toHaveLength(expected);
  }
});
it("نسخه جدید مبلغ، حفظ سابقه و منع تغییر گذشته", () => {
  const r = makeRule();
  expect(() => reviseRule(r, "2025-03-20", 2000, "2025-04-01")).toThrow();
  const updated = reviseRule(r, "2025-04-21", 2000, "2025-04-01");
  const e = expandEntries({ ...emptyState(), rules: [updated] }, "2025-05-22");
  expect(e.map((x) => x.amount)).toEqual([1000, 2000, 2000]);
});
it("دریافت رخداد فقط یک بار و مستقل از تغییر بعدی قاعده", () => {
  const r = makeRule();
  const s = { ...emptyState(), rules: [r] };
  const first = addPayment(
    expandEntries(s, "2025-03-21")[0],
    1000,
    "2025-03-21",
  );
  s.entries = [first];
  s.rules = [reviseRule(r, "2025-03-21", 3000, "2025-03-21")];
  expect(expandEntries(s, "2025-03-21")).toEqual([first]);
  const result = summary(s, "2025-03-21", "2025-04-20", "2025-03-21");
  expect([result.cash, result.projected]).toEqual([1000, 1000]);
});
it("حذف یک رخداد باعث بازسازی آن نمی‌شود", () => {
  const s = { ...emptyState(), rules: [makeRule()] };
  const e = expandEntries(s, "2025-04-21");
  s.excludedEntryIds = [e[0].id];
  expect(expandEntries(s, "2025-04-21")).toHaveLength(1);
});
it("بودجه هزینه به تاریخ پرداخت واقعی و تعهد به سررسید وابسته است", () => {
  const id = crypto.randomUUID();
  const rule = makeRule({ kind: "expense", categoryId: id });
  const s = {
    ...emptyState(),
    categories: [{ id, name: "عمومی", budget: 500 }],
    rules: [rule],
  };
  const first = expandEntries(s, "2025-03-21")[0];
  s.entries = [addPayment(first, 600, "2025-04-25")];
  const a = budgetReport(s, "2025-03-21", "2025-04-20")[0];
  expect([a.actual, a.planned]).toEqual([0, 1000]);
  const b = budgetReport(s, "2025-04-21", "2025-05-21")[0];
  expect([b.actual, b.planned]).toEqual([600, 1000]);
  expect(summary(s, "2025-04-21", "2025-05-21", "2025-04-25").cash).toBe(-600);
});
it("دسته نامعتبر و نسخه‌های مبلغ تکراری رد می‌شوند", () => {
  expect(() =>
    stateSchema.parse({
      ...emptyState(),
      rules: [makeRule({ categoryId: crypto.randomUUID() })],
    }),
  ).toThrow();
  expect(() =>
    makeRule({
      revisions: [
        { from: "2025-03-21", amount: 1 },
        { from: "2025-03-21", amount: 2 },
      ],
    }),
  ).toThrow();
});
it("جایگزینی برنامه سوابق مجازی گذشته را نگه می‌دارد", async () => {
  const { replaceSchedule } = await import("./recurring");
  const { today } = await import("./model");
  const r = makeRule({ end: "2025-05-22" });
  const start = today();
  const next = replaceSchedule(
    { ...emptyState(), rules: [r] },
    {
      ...r,
      start,
      end: null,
      title: "جدید",
      revisions: [{ from: start, amount: 2000 }],
    },
    start,
  );
  expect(next.entries.map((e) => e.amount)).toEqual([1000, 1000, 1000]);
  expect(next.entries[0].title).toBe(r.title);
});
