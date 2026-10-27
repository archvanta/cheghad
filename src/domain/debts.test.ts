import { it, expect } from "vitest";
import { emptyState, debtSchema, entrySchema } from "./model";
import { settleDebt, payDebtEntry, importInstallments } from "./debts";
import { summary, remaining } from "./engine";
const setup = () => {
  const now = new Date().toISOString();
  const d = debtSchema.parse({
    id: crypto.randomUUID(),
    title: "اعتبار نمونه",
    provider: "عمومی",
    reference: "",
    principal: null,
    allowEarly: "yes",
    allowPartial: "yes",
    notes: "",
    createdAt: now,
    updatedAt: now,
  });
  const e = entrySchema.parse({
    id: crypto.randomUUID(),
    debtId: d.id,
    title: "قسط",
    kind: "installment",
    amount: 1000,
    dueDate: "2026-12-01",
    confirmed: true,
    createdAt: now,
    updatedAt: now,
    payments: [],
  });
  return { ...emptyState(), openingBalance: 2000, debts: [d], entries: [e] };
};
it("تسویه بدون تخفیف فقط زمان نقد را تغییر می‌دهد", () => {
  const s = setup();
  const next = settleDebt(s, s.debts[0].id, 1000, "2026-10-01");
  expect(remaining(next.entries[0])).toBe(0);
  const r = summary(next, "2026-12-01", "2026-12-31", "2026-10-01");
  expect([r.cash, r.debt, r.netWorth, r.projected]).toEqual([
    1000, 0, 1000, 1000,
  ]);
  expect(s.entries[0].payments).toEqual([]);
});
it("تخفیف و کارمزد مبلغ نقد را از کاهش اصل بدهی جدا می‌کنند", () => {
  for (const cash of [800, 1200]) {
    const s = setup(),
      n = settleDebt(s, s.debts[0].id, cash, "2026-10-01");
    const r = summary(n, "2026-12-01", "2026-12-31", "2026-10-01");
    expect(r.debt).toBe(0);
    expect(r.cash).toBe(2000 - cash);
  }
});
it("مجوز نامشخص و ممنوع مانع پرداخت زود و جزئی‌اند", () => {
  const s = setup();
  s.debts[0].allowEarly = "unknown";
  s.debts[0].allowPartial = "no";
  expect(() => settleDebt(s, s.debts[0].id, 1000, "2026-10-01")).toThrow();
  expect(() => payDebtEntry(s, s.entries[0], 500, "2026-12-01")).toThrow();
  expect(() => payDebtEntry(s, s.entries[0], 1000, "2026-10-01")).toThrow();
});
it("تقسیم مبلغ تسویه حتی با گردکردن، وجه نقدی گم نمی‌کند", () => {
  const s = setup();
  s.entries.push({ ...s.entries[0], id: crypto.randomUUID() });
  const n = settleDebt(s, s.debts[0].id, 1, "2026-10-01");
  expect(
    n.entries.flatMap((e) => e.payments).reduce((s, p) => s + p.amount, 0),
  ).toBe(1);
  expect(n.entries.every((e) => remaining(e) === 0)).toBe(true);
});
it("قسط نامشخص مانع تسویه کامل و قسط لغوشده خارج از تعهد است", () => {
  const s = setup();
  s.entries[0].amount = null;
  expect(() => settleDebt(s, s.debts[0].id, 10, "2026-10-01")).toThrow();
  s.entries[0].cancelled = true;
  expect(summary(s, "2026-12-01", "2026-12-31", "2026-10-01").debt).toBe(0);
});
it("ورود CSV و JSON فقط اطلاعات معتبر نیازمند تأیید می‌سازد", () => {
  const id = crypto.randomUUID();
  expect(
    importInstallments("title,amountRial,dueDate\nنمونه,123,2026-12-01", id)[0]
      .confirmed,
  ).toBe(false);
  expect(
    importInstallments(
      '[{"title":"نمونه","amount":123,"dueDate":"2026-12-01"}]',
      id,
    )[0].amount,
  ).toBe(123);
  expect(() =>
    importInstallments("title,amountRial,dueDate\nنمونه,1.5,2026-12-01", id),
  ).toThrow();
});
