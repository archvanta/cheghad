import Decimal from "decimal.js";
import {
  goldTransactionSchema,
  type State,
  type GoldTransaction,
} from "./model";
const D = Decimal.clone({ precision: 40 });
export const roundRial = (n: Decimal) => {
  const value = n.toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  if (value.abs().gt(Number.MAX_SAFE_INTEGER))
    throw Error("ارزش خارج از محدوده دقت");
  return value.toNumber();
};
export function quantityInput(s: string) {
  return s
    .trim()
    .replace(/[۰-۹]/g, (c) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(c)))
    .replace(/[٠-٩]/g, (c) => String("٠١٢٣٤٥٦٧٨٩".indexOf(c)))
    .replace(/[,٬]/g, "")
    .replace("٫", ".");
}
export function tradeValue(t: GoldTransaction) {
  const gross = roundRial(new D(t.quantity).mul(t.price));
  const fees = new D(t.commission).add(t.workmanship).add(t.tax).add(t.other);
  const cash = new D(gross)[t.side === "buy" ? "add" : "sub"](fees);
  if (cash.isNegative()) throw Error("هزینه فروش بیش از عایدی است");
  return { gross, fees: roundRial(fees), cash: roundRial(cash) };
}
export function goldPortfolio(state: State, asOf = "9999-12-31") {
  return state.goldAssets.map((asset) => {
    let quantity = new D(0),
      cost = new D(0),
      realized = new D(0),
      cashDelta = new D(0);
    const transactions = state.goldTransactions
      .filter((t) => t.assetId === asset.id && t.date <= asOf)
      .sort(
        (a, b) =>
          a.date.localeCompare(b.date) ||
          a.createdAt.localeCompare(b.createdAt),
      );
    for (const t of transactions) {
      goldTransactionSchema.parse(t);
      const q = new D(t.quantity),
        v = tradeValue(t);
      if (t.side === "buy") {
        quantity = quantity.add(q);
        cost = cost.add(v.cash);
        if (!t.opening) cashDelta = cashDelta.sub(v.cash);
      } else {
        if (q.gt(quantity)) throw Error("فروش بیش از موجودی دارایی مجاز نیست");
        const soldCost = cost.mul(q).div(quantity);
        realized = realized.add(new D(v.cash).sub(soldCost));
        cost = cost.sub(soldCost);
        quantity = quantity.sub(q);
        cashDelta = cashDelta.add(v.cash);
      }
    }
    const market =
      asset.price === null ? null : roundRial(quantity.mul(asset.price));
    const liquidation =
      market === null
        ? null
        : roundRial(
            new D(market).mul(new D(10000).sub(asset.spreadBps)).div(10000),
          );
    return {
      ...asset,
      quantity: quantity.toFixed(),
      cost: roundRial(cost),
      average: quantity.isZero() ? null : roundRial(cost.div(quantity)),
      breakEven:
        quantity.isZero() || asset.spreadBps === 10000
          ? null
          : roundRial(
              cost
                .div(quantity)
                .mul(10000)
                .div(10000 - asset.spreadBps),
            ),
      market,
      liquidation,
      unrealized: market === null ? null : roundRial(new D(market).sub(cost)),
      realized: roundRial(realized),
      cashDelta: roundRial(cashDelta),
      returnPercent:
        cost.isZero() || market === null
          ? null
          : new D(market).sub(cost).div(cost).mul(100).toFixed(2),
    };
  });
}
export function goldTotals(state: State, asOf: string) {
  const rows = goldPortfolio(state, asOf);
  return {
    goldValue: roundRial(
      rows
        .filter((r) => r.kind !== "usd")
        .reduce((s, r) => s.add(r.market ?? 0), new D(0)),
    ),
    usdValue: roundRial(
      rows
        .filter((r) => r.kind === "usd")
        .reduce((s, r) => s.add(r.market ?? 0), new D(0)),
    ),
    value: roundRial(rows.reduce((s, r) => s.add(r.market ?? 0), new D(0))),
    cashDelta: roundRial(rows.reduce((s, r) => s.add(r.cashDelta), new D(0))),
    unknown: rows.filter((r) => r.market === null && r.quantity !== "0").length,
  };
}

export const assetUnitLabel = (unit: string) =>
  unit === "usd" ? "دلار" : unit === "gram" ? "گرم" : "سکه";
