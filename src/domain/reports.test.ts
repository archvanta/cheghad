import { it, expect } from "vitest";
import { calendarDays, calendarMonth, csv, reportRows } from "./reports";
import { emptyState, entrySchema } from "./model";
it("مرز ماه میلادی و شمسی، کبیسه و ترتیب روزها صحیح است", () => {
  expect(calendarMonth("2024-02-10", 0, "gregory")).toMatchObject({
    start: "2024-02-01",
    end: "2024-02-29",
  });
  const j = calendarMonth("2025-03-20", 0, "persian");
  expect(j.end).toBe("2025-03-20");
  expect(calendarDays(j.start, j.end)).toHaveLength(30);
});
it("CSV کوتیشن و فرمول ورودی را خنثی می‌کند", () => {
  const text = csv([["=SUM(1,2)", 'نام "عمومی"', -12]]);
  expect(text).toContain("'=SUM");
  expect(text).toContain('نام ""عمومی""');
  expect(text).toContain('"-12"');
});
it("گزارش فقط پرداخت واقعی در تاریخ انتخابی را صادر می‌کند", () => {
  const now = new Date().toISOString();
  const e = entrySchema.parse({
    id: crypto.randomUUID(),
    title: "عمومی",
    kind: "income",
    amount: 500,
    dueDate: "2026-01-01",
    confirmed: true,
    createdAt: now,
    updatedAt: now,
    payments: [{ id: crypto.randomUUID(), amount: 100, date: "2026-02-01" }],
  });
  const s = { ...emptyState(), entries: [e] };
  expect(reportRows(s, "2026-01-01", "2026-01-31")).toHaveLength(1);
  expect(reportRows(s, "2026-02-01", "2026-02-28")[1][3]).toBe(100);
});
