import Decimal from "decimal.js";
import {
  actualCash,
  amountAt,
  dueDate,
  isBuy,
  monthOf,
  nextMonth,
  occurrences,
  portfolio,
  remaining,
  round,
  sign,
  today,
  type Ledger,
} from "./finance";

export function dashboardSnapshot(ledger: Ledger, date = today()) {
  const cash = actualCash(ledger, date),
    assets = portfolio(ledger, date);
  const debts = ledger.entries.filter(
    (e) => e.kind === "installment" && !e.cancelled,
  );
  const debtUnknown = debts.some(
    (e) => e.repeat || amountAt(e, e.month) === null,
  );
  const debt = round(
    debts.reduce(
      (sum, e) => sum.add(remaining(ledger, e, e.month, date)),
      new Decimal(0),
    ),
  );
  const incomplete = debtUnknown || assets.some((a) => a.value === null);
  const total = round(
    new Decimal(cash).add(assets[0].value ?? 0).add(assets[1].value ?? 0),
  );
  const netWorth = incomplete ? null : round(new Decimal(total).sub(debt));
  const costUnknown = assets.some(
    (a) => a.cost === null || a.unrealized === null,
  );
  const cost = round(new Decimal(assets[0].cost ?? 0).add(assets[1].cost ?? 0));
  const gain = costUnknown
    ? null
    : round(
        new Decimal(assets[0].unrealized ?? 0).add(assets[1].unrealized ?? 0),
      );
  return {
    cash,
    assets,
    debt: debtUnknown ? null : debt,
    netWorth,
    total: assets.some((a) => a.value === null) ? null : total,
    gain,
    gainPct:
      gain === null || cost <= 0
        ? null
        : new Decimal(gain).div(cost).mul(100).toNumber(),
  };
}

export function dashboardHistory(ledger: Ledger, months: number) {
  return Array.from({ length: months }, (_, i) => {
    const month = nextMonth(monthOf(), i - months + 1);
    const date = i === months - 1 ? today() : dueDate(month, 31);
    const snapshot = dashboardSnapshot(ledger, date);
    let incoming = new Decimal(0),
      outgoing = new Decimal(0),
      usdTrade = new Decimal(0);
    for (const payment of ledger.payments.filter(
      (p) => p.date <= date && monthOf(p.date) === month,
    )) {
      const entry = ledger.entries.find((e) => e.id === payment.entryId)!;
      if (sign(entry.kind) > 0) incoming = incoming.add(payment.amount);
      else outgoing = outgoing.add(payment.amount);
      if (entry.kind === "usdBuy" || entry.kind === "usdSell")
        usdTrade = usdTrade.add(
          new Decimal(payment.amount).mul(isBuy(entry.kind) ? 1 : -1),
        );
    }
    return {
      month,
      ...snapshot,
      cashArea: Math.max(0, snapshot.cash) / 1e6,
      gold:
        snapshot.assets[0].value === null
          ? null
          : snapshot.assets[0].value / 1e6,
      usd:
        snapshot.assets[1].value === null
          ? null
          : snapshot.assets[1].value / 1e6,
      incoming: round(incoming) / 1e6,
      outgoing: round(outgoing) / 1e6,
      usdTrade: round(usdTrade) / 1e6,
    };
  });
}

export function upcomingPayments(ledger: Ledger) {
  return occurrences(ledger, dueDate(nextMonth(monthOf(), 1), 31))
    .filter(
      (r) =>
        ["expense", "installment"].includes(r.entry.kind) &&
        (r.remaining > 0 || amountAt(r.entry, r.month) === null),
    )
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 3);
}
