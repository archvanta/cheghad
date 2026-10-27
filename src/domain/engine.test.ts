import { describe, it, expect } from "vitest";
import { addPayment, parseMoney, summary, dailyForecast } from "./engine";
import { emptyState, jalaliMonth, stateSchema, type Entry } from "./model";
const entry = (
  kind: Entry["kind"],
  amount: number | null,
  dueDate = "2026-12-01",
): Entry => ({
  id: crypto.randomUUID(),
  kind,
  amount,
  title: "آزمایشی",
  dueDate,
  confirmed: true,
  payments: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});
describe("موتور مالی", () => {
  it("ورودی فارسی و عربی و تبدیل دقیق بدون گردکردن پنهان", () => {
    expect(parseMoney("۱٬۲۳۴٫۵")).toBe(12345);
    expect(parseMoney("١٠", "rial")).toBe(10);
    expect(() => parseMoney("1.23")).toThrow();
    expect(() => parseMoney("9999999999999999")).toThrow();
  });
  it("مانده و کسری واقعی را حفظ می‌کند", () => {
    const s = {
      ...emptyState(),
      openingBalance: 100,
      entries: [entry("expense", 150)],
    };
    expect(summary(s, "2026-12-01", "2026-12-30", "2026-11-01").capacity).toBe(
      -50,
    );
  });
  it("دریافت مورد انتظار وجه نقد نیست و پس از دریافت دوبار شمرده نمی‌شود", () => {
    const e = entry("income", 800);
    const s = { ...emptyState(), entries: [e] };
    expect(summary(s, "2026-12-01", "2026-12-30", "2026-12-01").cash).toBe(0);
    s.entries = [addPayment(e, 800, "2026-12-01")];
    const r = summary(s, "2026-12-01", "2026-12-30", "2026-12-01");
    expect(r.cash).toBe(800);
    expect(r.projected).toBe(800);
  });
  it("پرداخت جزئی و کامل و منع بیش‌پرداخت", () => {
    const e = addPayment(entry("installment", 100), 40, "2026-11-01");
    expect(() => addPayment(e, 61, "2026-11-02")).toThrow();
    expect(() => addPayment(e, 0, "2026-11-02")).toThrow();
    const s = { ...emptyState(), openingBalance: 200, entries: [e] };
    let r = summary(s, "2026-12-01", "2026-12-30", "2026-11-02");
    expect([r.cash, r.debt, r.projected, r.netWorth]).toEqual([
      160, 60, 100, 100,
    ]);
    s.entries = [addPayment(e, 60, "2026-11-02")];
    r = summary(s, "2026-12-01", "2026-12-30", "2026-11-02");
    expect([r.cash, r.debt, r.projected, r.netWorth]).toEqual([
      100, 0, 100, 100,
    ]);
  });
  it("سررسید جدید و هزینه نامشخص و مقدار نیازمند تأیید", () => {
    const e = entry("expense", null);
    const s = { ...emptyState(), entries: [e] };
    expect(
      summary(s, "2026-12-01", "2026-12-30", "2026-11-01").incomplete,
    ).toBe(1);
    expect(
      summary(
        { ...s, entries: [{ ...e, dueDate: "2027-01-01" }] },
        "2026-12-01",
        "2026-12-30",
        "2026-11-01",
      ).incomplete,
    ).toBe(0);
  });
  it("کسری پیش از دریافت حقوق و اقساط عقب‌افتاده", () => {
    const s = {
      ...emptyState(),
      entries: [
        entry("expense", 200, "2026-12-05"),
        entry("income", 400, "2026-12-20"),
      ],
    };
    expect(dailyForecast(s, "2026-12-01", "2026-12-30").minimum).toBe(-200);
    expect(dailyForecast(s, "2026-12-10", "2026-12-30").minimum).toBe(-200);
  });
  it("مرز دقیق ماه شمسی و کبیسه", () => {
    expect(jalaliMonth("2025-03-20").end).toBe("2025-03-20");
    expect(jalaliMonth("2025-03-20", 1).start).toBe("2025-03-21");
  });
  it("شناسه تکراری و تاریخ نامعتبر را رد می‌کند", () => {
    const e = entry("income", 1);
    expect(() =>
      stateSchema.parse({ ...emptyState(), entries: [e, e] }),
    ).toThrow();
    expect(() =>
      stateSchema.parse({
        ...emptyState(),
        entries: [{ ...e, dueDate: "2026-02-30" }],
      }),
    ).toThrow();
  });
});
