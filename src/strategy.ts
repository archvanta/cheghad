import Decimal from "decimal.js";
import {
  actualCash,
  amountAt,
  dueDate,
  isAsset,
  ledgerSchema,
  monthOf,
  nextMonth,
  occurrences,
  remaining,
  round,
  scenario,
  today,
  type Ledger,
} from "./finance";

/** Fixed-price, zero-fee comparison. Values are tomans, never gold grams.
 * Retained budget includes living expenses, rather than adding them twice.
 * A shortage reduces the final holding even when no gold was bought that month.
 */
export function compareStrategies(
  ledger: Ledger,
  start: string,
  initial: number,
  retained: number,
  months = 3,
) {
  if (!Number.isInteger(months) || months < 1 || months > 24)
    throw Error("افق مقایسه باید بین یک تا ۲۴ ماه باشد");
  for (const value of [initial, retained]) {
    if (
      !Number.isFinite(value) ||
      value < 0 ||
      !Number.isSafeInteger(value * 10)
    )
      throw Error("مبالغ مقایسه باید مثبت و با دقت حداکثر یک ریال باشند");
  }
  if (start < nextMonth(monthOf(), 1))
    throw Error("برای مقایسهٔ حقوق کامل، شروع را از ماه آینده انتخاب کن");
  const source = ledgerSchema.parse(ledger);
  // Existing holdings remain outside this comparison; completed trades still
  // affect actual cash. Pending trades are excluded from the salary allocation.
  source.entries = source.entries.map((e) =>
    isAsset(e.kind) ? { ...e, cancelled: true } : e,
  );
  const end = dueDate(nextMonth(start, months - 1), 31);
  if (
    occurrences(source, end).some(
      ({ entry, month }) => amountAt(entry, month) === null || !entry.confirmed,
    )
  )
    throw Error("مبلغ و تأیید درآمد، هزینه و اقساط را برای مقایسه کامل کن");
  const debts = source.entries.filter(
    (e) => e.kind === "installment" && !e.cancelled,
  );
  if (debts.some((e) => amountAt(e, e.month) === null))
    throw Error("برای مقایسه، مبلغ همهٔ بدهی‌ها لازم است");
  const debtTotal = round(
    debts.reduce(
      (sum, e) => sum.add(remaining(source, e, e.month, today())),
      new Decimal(0),
    ),
  );
  const paidNow = Math.min(initial, debtTotal);
  function run(mode: "gold" | "debt") {
    const baseline = scenario(
      source,
      start,
      months,
      initial,
      0,
      mode === "debt" ? paidNow : 0,
      0,
      0,
    );
    let purchases = new Decimal(0),
      extraLiving = new Decimal(0);
    const rows = baseline.map((row) => {
      const living = Math.max(retained, row.expenses);
      const capacity = round(
        new Decimal(row.income).sub(row.installmentPaid).sub(living),
      );
      const buy = Math.max(0, capacity),
        shortage = Math.max(0, -capacity);
      purchases = purchases.add(buy);
      extraLiving = extraLiving.add(living).sub(row.expenses);
      return {
        month: row.month,
        buy,
        shortage,
        income: row.income,
        installments: row.installmentPaid,
      };
    });
    const final = baseline.at(-1)!;
    const initialGold = mode === "gold" ? initial : 0;
    const cash = round(
      new Decimal(final.cash).sub(initialGold).sub(purchases).sub(extraLiving),
    );
    const grossGold = round(purchases.add(initialGold));
    const fundingShortage = Math.max(0, -cash);
    const netGold = round(new Decimal(grossGold).sub(fundingShortage));
    return {
      rows,
      monthlyGold: round(purchases),
      initialGold,
      cash,
      grossGold,
      netGold,
      fundingShortage,
      remainingDebt: final.debt,
      netAssets: round(
        new Decimal(netGold).add(Math.max(0, cash)).sub(final.debt),
      ),
    };
  }
  // Avoid suggesting permission for a real early repayment: this is hypothetical.
  return {
    gold: run("gold"),
    debt: run("debt"),
    paidNow,
    openingCash: actualCash(source),
    startingFundingGap: Math.max(
      0,
      round(new Decimal(initial).sub(actualCash(source))),
    ),
    end,
  };
}
