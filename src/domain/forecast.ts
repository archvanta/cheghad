import Decimal from "decimal.js";
import {
  type State,
  type Scenario,
  type GoldTransaction,
  jalaliMonth,
} from "./model";
import { expandEntries } from "./recurring";
import { cashBalance, remaining } from "./engine";
import { goldPortfolio, goldTotals, tradeValue, roundRial } from "./gold";
import { settleDebt } from "./debts";
const D = Decimal.clone({ precision: 40 });
const nextDay = (s: string) => {
  const d = new Date(s + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};
function buy(
  state: State,
  assetId: string | undefined,
  budget: number,
  date: string,
  feeBps: number,
) {
  if (!budget) return 0;
  const asset = state.goldAssets.find((a) => a.id === assetId);
  if (!asset?.price) throw Error("برای خرید، دارایی و قیمت معتبر لازم است");
  let quantity = new D(budget)
    .div(new D(asset.price).mul(new D(1).add(new D(feeBps).div(10000))))
    .toDecimalPlaces(6, Decimal.ROUND_DOWN);
  if (quantity.isZero()) return 0;
  const now = new Date().toISOString();
  let t: GoldTransaction = {
    id: crypto.randomUUID(),
    assetId: asset.id,
    side: "buy",
    quantity: quantity.toFixed(),
    price: asset.price,
    commission: 0,
    workmanship: 0,
    tax: 0,
    other: 0,
    date,
    opening: false,
    notes: "فرض شبیه‌سازی",
    createdAt: now,
    updatedAt: now,
  };
  const priceTrade = () => {
    t.quantity = quantity.toFixed();
    t.commission = roundRial(
      new D(t.quantity).mul(t.price).mul(feeBps).div(10000),
    );
    return tradeValue(t).cash;
  };
  let spent = priceTrade();
  while (spent > budget) {
    quantity = quantity.sub("0.000001");
    if (quantity.lte(0)) return 0;
    spent = priceTrade();
  }
  state.goldTransactions.push(t);
  return spent;
}
export function project(
  state: State,
  from: string,
  horizon: number,
  scenario?: Scenario,
) {
  if (![3, 6, 12, 18, 24].includes(horizon)) throw Error("افق نامعتبر");
  let working = structuredClone(state);
  const last = jalaliMonth(from, horizon - 1).end;
  working.entries = expandEntries(working, last);
  const warnings: string[] = [];
  if (
    working.entries.some(
      (e) =>
        e.dueDate <= last &&
        !e.cancelled &&
        (e.amount === null || !e.confirmed),
    )
  )
    warnings.push("مبلغ یا تأیید برخی رویدادها کامل نیست");
  const initialCash = cashBalance(working, from);
  let initialSpent = 0;
  let earlyDebtSpent = 0;
  if (scenario) {
    if (scenario.available > initialCash)
      warnings.push("مبلغ تخصیص از نقد واقعی بیشتر است؛ منبع تأمین مشخص نشده");
    if (scenario.debtAmount) {
      const debt = working.debts.find((d) => d.id === scenario.debtId);
      if (!debt) throw Error("قرارداد سناریو مشخص نیست");
      const linked = working.entries.filter(
        (e) => e.debtId === debt.id && !e.cancelled,
      );
      if (linked.some((e) => e.amount === null))
        throw Error("مبلغ قرارداد کامل نیست");
      if (scenario.debtMode === "quote") {
        warnings.push(
          "فرض: اعتباردهنده مبلغ تسویه و حذف تمام اقساط باقی‌مانده را تأیید کند",
        );
        debt.allowEarly = "yes";
        working = settleDebt(working, debt.id, scenario.debtAmount, from);
      } else {
        warnings.push(
          "پرداخت بدهی به مبلغ اسمی، فرضی است؛ مجوز و تخفیف اعتباردهنده لحاظ نشده",
        );
        let budget = scenario.debtAmount;
        for (const e of linked.sort((a, b) =>
          a.dueDate.localeCompare(b.dueDate),
        )) {
          const amount = Math.min(budget, remaining(e, from));
          if (amount > 0) {
            e.payments.push({ id: crypto.randomUUID(), amount, date: from });
            budget -= amount;
          }
        }
        if (budget > 0)
          warnings.push("بخش مازاد تخصیص بدهی خرج نشده و نقد می‌ماند");
      }
    }
    earlyDebtSpent = initialCash - cashBalance(working, from);
    initialSpent += buy(
      working,
      scenario.goldAssetId,
      scenario.goldAmount,
      from,
      scenario.feeBps,
    );
    initialSpent += buy(
      working,
      scenario.usdAssetId,
      scenario.usdAmount,
      from,
      scenario.feeBps,
    );
  }
  const basePrices = new Map(state.goldAssets.map((a) => [a.id, a.price]));
  const points: { date: string; cash: number }[] = [];
  const months = [];
  let minimum = cashBalance(working, from);
  for (let index = 0; index < horizon; index++) {
    const m = jalaliMonth(from, index),
      start = index === 0 ? from : m.start;
    const opening = index === 0 ? initialCash : cashBalance(working, start);
    let income = 0,
      expense = 0,
      installments = 0,
      investment = index === 0 ? initialSpent : 0;
    for (let date = start; date <= m.end; date = nextDay(date)) {
      for (const e of working.entries.filter(
        (e) =>
          !e.cancelled &&
          (e.dueDate < start ? date === start : e.dueDate === date),
      )) {
        const amount = remaining(e, date);
        if (amount <= 0) continue;
        e.payments.push({ id: crypto.randomUUID(), amount, date });
        if (e.kind === "income") income += amount;
        else if (e.kind === "expense") expense += amount;
        else installments += amount;
      }
      const cash = cashBalance(working, date);
      minimum = Math.min(minimum, cash);
      points.push({ date, cash });
    }
    if (scenario) {
      for (const a of working.goldAssets) {
        const base = basePrices.get(a.id);
        const custom = scenario.plans.find(
          (p) => p.month === index && p.assetId === a.id,
        )?.price;
        if (custom !== null && custom !== undefined) a.price = custom;
        else if (base !== null && base !== undefined) {
          const change =
            a.kind === "usd" ? scenario.usdChange : scenario.goldChange;
          a.price = roundRial(
            new D(base).mul(
              new D(1).add(
                new D(change)
                  .mul(index + 1)
                  .div(horizon)
                  .div(100),
              ),
            ),
          );
        }
      }
      for (const plan of scenario.plans.filter((p) => p.month === index))
        investment += buy(
          working,
          plan.assetId,
          plan.budget,
          m.end,
          scenario.feeBps,
        );
    }
    const cash = cashBalance(working, m.end);
    minimum = Math.min(minimum, cash);
    points.push({ date: m.end, cash });
    const debt = working.entries
      .filter((e) => e.kind === "installment")
      .reduce((s, e) => s + remaining(e, m.end), 0);
    const assets = goldTotals(working, m.end);
    if (assets.unknown && !warnings.includes("قیمت برخی دارایی‌ها نامعلوم است"))
      warnings.push("قیمت برخی دارایی‌ها نامعلوم است");
    months.push({
      ...m,
      opening,
      income,
      expense,
      installments,
      investment,
      cash,
      debt,
      gold: assets.goldValue,
      usd: assets.usdValue,
      netWorth: roundRial(new D(cash).add(assets.value).sub(debt)),
      earlyDebt: index === 0 ? earlyDebtSpent : 0,
      capacity: cash - Math.max(state.reserve, scenario?.reserveAmount ?? 0),
      minimum,
    });
  }
  const final = months.at(-1)!;
  return {
    months,
    points,
    minimum,
    final,
    warnings,
    holdings: goldPortfolio(working, last),
  };
}
