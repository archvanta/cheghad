import { expandEntries } from "./recurring";
import Decimal from "decimal.js";
import { entrySchema, type Entry, type State } from "./model";
const exact = (n: Decimal) => {
  if (!n.isInteger() || n.abs().gt(Number.MAX_SAFE_INTEGER))
    throw new Error("مبلغ خارج از محدوده دقت مجاز است");
  return n.toNumber();
};
export function parseMoney(value: string, unit: "rial" | "toman" = "toman") {
  const normalized = value
    .trim()
    .replace(/[۰-۹]/g, (c) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(c)))
    .replace(/[٠-٩]/g, (c) => String("٠١٢٣٤٥٦٧٨٩".indexOf(c)))
    .replace(/[,٬]/g, "")
    .replace("٫", ".");
  if (!/^\d+(\.\d+)?$/.test(normalized))
    throw new Error("مبلغ معتبر وارد کنید");
  return exact(new Decimal(normalized).mul(unit === "toman" ? 10 : 1));
}
export const paid = (entry: Entry, asOf = "9999-12-31") =>
  exact(
    entry.payments
      .filter((p) => p.date <= asOf)
      .reduce((s, p) => s.add(p.amount), new Decimal(0)),
  );
export const remaining = (e: Entry, asOf?: string) =>
  exact(new Decimal(e.amount ?? 0).sub(paid(e, asOf)));
export function addPayment(entry: Entry, amount: number, date: string): Entry {
  return entrySchema.parse({
    ...entry,
    updatedAt: new Date().toISOString(),
    payments: [...entry.payments, { id: crypto.randomUUID(), amount, date }],
  });
}
export function cashBalance(state: State, asOf: string) {
  return exact(
    state.entries.reduce(
      (s, e) =>
        s.add(new Decimal(paid(e, asOf)).mul(e.kind === "income" ? 1 : -1)),
      new Decimal(state.openingBalance),
    ),
  );
}
export function summary(
  state: State,
  start: string,
  end: string,
  asOf: string,
) {
  const expanded = expandEntries(state, end);
  const entries = expanded.filter(
    (e) => e.dueDate >= start && e.dueDate <= end,
  );
  const total = (kind: Entry["kind"]) =>
    exact(
      entries
        .filter((e) => e.kind === kind)
        .reduce((s, e) => s.add(e.amount ?? 0), new Decimal(0)),
    );
  const cash = cashBalance(state, asOf);
  // Overdue unpaid records remain obligations. Future receipts remain projections, never cash.
  const outstanding = expanded.filter((e) => e.dueDate <= end);
  const projected = exact(
    outstanding.reduce(
      (s, e) =>
        s.add(
          new Decimal(remaining(e, asOf)).mul(e.kind === "income" ? 1 : -1),
        ),
      new Decimal(cash),
    ),
  );
  const debt = exact(
    state.entries
      .filter((e) => e.kind === "installment")
      .reduce((s, e) => s.add(remaining(e, asOf)), new Decimal(0)),
  );
  const incomplete = outstanding.filter(
    (e) => e.amount === null || !e.confirmed,
  ).length;
  return {
    cash,
    projected,
    debt,
    income: total("income"),
    expense: total("expense"),
    installments: total("installment"),
    capacity: exact(new Decimal(projected).sub(state.reserve)),
    netWorth: exact(new Decimal(cash).sub(debt)),
    incomplete,
  };
}
export function dailyForecast(state: State, from: string, to: string) {
  let balance = new Decimal(cashBalance(state, from));
  const events = expandEntries(state, to)
    .filter((e) => e.dueDate <= to)
    .map((e) => ({
      date: e.dueDate < from ? from : e.dueDate,
      delta: new Decimal(remaining(e, from)).mul(e.kind === "income" ? 1 : -1),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const daily = new Map<string, Decimal>();
  for (const e of events)
    daily.set(e.date, (daily.get(e.date) ?? new Decimal(0)).add(e.delta));
  const points = [{ date: from, balance: exact(balance) }];
  for (const [date, delta] of daily) {
    balance = balance.add(delta);
    points.push({ date, balance: exact(balance) });
  }
  return { points, minimum: Math.min(...points.map((p) => p.balance)) };
}
