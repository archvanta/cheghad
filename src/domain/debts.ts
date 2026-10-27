import {
  debtSchema,
  entrySchema,
  isoDate,
  type State,
  type Entry,
} from "./model";
import { remaining, addPayment } from "./engine";
export function payDebtEntry(
  state: State,
  entry: Entry,
  amount: number,
  date: string,
) {
  const debt = state.debts.find((d) => d.id === entry.debtId);
  if (debt) {
    if (date < entry.dueDate && debt.allowEarly !== "yes")
      throw Error("اجازه پرداخت زودهنگام مشخص نیست");
    if (amount < remaining(entry) && debt.allowPartial !== "yes")
      throw Error("اجازه پرداخت جزئی مشخص نیست");
  }
  return addPayment(entry, amount, date);
}
/** Explicit creditor quote for ALL remaining installments. No assumed debt discount. */
export function settleDebt(
  state: State,
  debtId: string,
  quotedCash: number,
  date: string,
): State {
  isoDate.parse(date);
  const debt = debtSchema.parse(state.debts.find((d) => d.id === debtId));
  if (debt.allowEarly !== "yes") throw Error("تسویه زودهنگام مجاز نشده است");
  if (!Number.isSafeInteger(quotedCash) || quotedCash <= 0)
    throw Error("مبلغ اعلام‌شده معتبر نیست");
  if (
    state.entries.some(
      (e) => e.debtId === debtId && !e.cancelled && e.amount === null,
    )
  )
    throw Error("مبلغ اقساط کامل نیست");
  const entries = state.entries.filter(
    (e) => e.debtId === debtId && remaining(e) > 0,
  );
  if (entries.some((e) => e.amount === null))
    throw Error("مبلغ اقساط کامل نیست");
  const total = entries.reduce((s, e) => s + BigInt(remaining(e)), 0n);
  if (total === 0n) throw Error("بدهی باقی نمانده است");
  let allocated = 0;
  const updated = new Map<string, Entry>();
  entries.forEach((e, i) => {
    const reduction = remaining(e);
    const cash =
      i === entries.length - 1
        ? quotedCash - allocated
        : Number((BigInt(quotedCash) * BigInt(reduction)) / total);
    allocated += cash;
    updated.set(
      e.id,
      entrySchema.parse({
        ...e,
        updatedAt: new Date().toISOString(),
        payments: [
          ...e.payments,
          { id: crypto.randomUUID(), amount: cash, reduction, date },
        ],
      }),
    );
  });
  return {
    ...state,
    entries: state.entries.map((e) => updated.get(e.id) ?? e),
  };
}
export function importInstallments(text: string, debtId: string): Entry[] {
  let rows: unknown;
  if (text.trim().startsWith("[")) rows = JSON.parse(text);
  else {
    const lines = text.trim().split(/\r?\n/);
    if (lines.shift() !== "title,amountRial,dueDate")
      throw Error("سرستون CSV معتبر نیست");
    rows = lines.map((line) => {
      const fields = line.split(",");
      if (fields.length !== 3) throw Error("CSV باید سه ستون داشته باشد");
      return {
        title: fields[0],
        amount: Number(fields[1]),
        dueDate: fields[2],
      };
    });
  }
  if (!Array.isArray(rows) || rows.length > 500) throw Error("حداکثر ۵۰۰ قسط");
  const now = new Date().toISOString();
  return rows.map((row) =>
    entrySchema.parse({
      ...row,
      id: crypto.randomUUID(),
      debtId,
      kind: "installment",
      confirmed: false,
      createdAt: now,
      updatedAt: now,
      payments: [],
    }),
  );
}
