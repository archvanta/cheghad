import Decimal from "decimal.js";
import * as jalali from "jalaali-js";
import { z } from "zod";
const D = Decimal.clone({ precision: 40 });
export const normalizeNumber = (s: string) =>
  s
    .trim()
    .replace(/[۰-۹]/g, (c) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(c)))
    .replace(/[٠-٩]/g, (c) => String("٠١٢٣٤٥٦٧٨٩".indexOf(c)))
    .replace(/[,٬]/g, "")
    .replace("٫", ".");
export const rial = (tomans: number) => {
  const n = new D(tomans).mul(10);
  if (!n.isInteger() || n.abs().gt(Number.MAX_SAFE_INTEGER))
    throw Error("مبلغ باید دقیق و در محدوده ریال صحیح باشد");
  return n.toNumber();
};
export const tomans = (rials: number) => new D(rials).div(10).toNumber();
export const parseAmount = (s: string) => {
  const v = normalizeNumber(s);
  if (!/^\d+(\.\d)?$/.test(v))
    throw Error("مبلغ معتبر با حداکثر یک رقم اعشار تومان وارد کن");
  const n = Number(v);
  rial(n);
  return n;
};
export const amountSchema = z
  .number()
  .finite()
  .nonnegative()
  .refine((n) => {
    try {
      rial(n);
      return true;
    } catch {
      return false;
    }
  }, "مبلغ معتبر به ریال صحیح نیست");
export const signedAmount = z
  .number()
  .finite()
  .refine((n) => {
    try {
      rial(n);
      return true;
    } catch {
      return false;
    }
  });
export const periodSchema = z.string().regex(/^(1[2-6]\d{2})-(0[1-9]|1[0-2])$/);
export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => {
    const d = new Date(s + "T12:00:00Z");
    return Number.isFinite(d.valueOf()) && d.toISOString().slice(0, 10) === s;
  });
export const kindSchema = z.enum([
  "income",
  "expense",
  "installment",
  "goldBuy",
  "goldSell",
  "usdBuy",
  "usdSell",
]);
export type Kind = z.infer<typeof kindSchema>;
export const entrySchema = z
  .object({
    id: z.string().min(1).max(100),
    name: z.string().trim().min(1).max(120),
    amount: amountSchema.nullable(),
    month: periodSchema,
    day: z.number().int().min(1).max(31),
    kind: kindSchema,
    status: z.enum(["planned", "done"]),
    repeat: z.boolean(),
    note: z.string().max(2000).optional(),
    category: z.string().max(80).optional(),
    confirmed: z.boolean().default(true),
    allowEarly: z.enum(["yes", "no", "unknown"]).default("unknown"),
    allowPartial: z.enum(["yes", "no", "unknown"]).default("unknown"),
    cancelled: z.boolean().default(false),
    revisions: z
      .array(z.object({ month: periodSchema, amount: amountSchema.nullable() }))
      .default([]),
    createdAt: z.string().datetime().optional(),
    updatedAt: z.string().datetime().optional(),
  })
  .superRefine((e, c) => {
    if (
      e.revisions.some(
        (r, i) =>
          r.month < e.month || (i > 0 && r.month <= e.revisions[i - 1].month),
      )
    )
      c.addIssue({
        code: "custom",
        message: "تغییرات مبلغ باید مرتب و پس از شروع باشند",
      });
  });
export type Entry = z.infer<typeof entrySchema>;
export const paymentSchema = z.object({
  id: z.string().min(1).max(100),
  entryId: z.string().min(1).max(100),
  month: periodSchema,
  amount: amountSchema,
  date: dateSchema,
  reduction: amountSchema.optional(),
  quantity: z
    .string()
    .regex(/^\d{1,9}(\.\d{1,6})?$/)
    .optional(),
  unitPrice: amountSchema.optional(),
  fee: amountSchema.optional(),
  name: z.string().max(120).optional(),
});
export type Payment = z.infer<typeof paymentSchema>;
export const profileSchema = z.object({
  cash: amountSchema,
  reserve: amountSchema,
  goldGrams: z.number().nonnegative().max(1e9),
  goldPrice: amountSchema.nullable(),
  goldFeePct: z.number().min(0).max(100),
  goldCost: amountSchema.nullable().default(null),
  usdUnits: z.number().nonnegative().max(1e9).default(0),
  usdPrice: amountSchema.nullable().default(null),
  usdCost: amountSchema.nullable().default(null),
  theme: z.enum(["dark", "light"]).default("dark"),
});
export type Profile = z.infer<typeof profileSchema>;
export const ledgerSchema = z
  .object({
    version: z.literal(2),
    revision: z.number().int().nonnegative(),
    entries: z.array(entrySchema).max(1000),
    profile: profileSchema,
    payments: z.array(paymentSchema).max(10000),
    budgets: z
      .array(
        z.object({
          id: z.string().min(1),
          name: z.string().min(1).max(80),
          limit: amountSchema.nullable(),
        }),
      )
      .max(100),
    history: z
      .array(
        z.object({ date: z.string().datetime(), action: z.string().max(500) }),
      )
      .max(100),
  })
  .superRefine((l, ctx) => {
    if (
      new Set(l.entries.map((e) => e.id)).size !== l.entries.length ||
      new Set(l.payments.map((p) => p.id)).size !== l.payments.length
    )
      ctx.addIssue({ code: "custom", message: "شناسه تکراری" });
    for (const p of l.payments) {
      const e = l.entries.find((e) => e.id === p.entryId);
      if (!e || !matches(e, p.month)) {
        ctx.addIssue({ code: "custom", message: "پرداخت بدون رویداد معتبر" });
        continue;
      }
      if (e.amount === null || e.cancelled)
        ctx.addIssue({
          code: "custom",
          message: "رویداد نامشخص/لغوشده پرداخت‌پذیر نیست",
        });
      const total = paid(l, e.id, p.month);
      const a = amountAt(e, p.month);
      if (a === null || new D(total).gt(a))
        ctx.addIssue({ code: "custom", message: "پرداخت بیش از تعهد" });
      if (p.amount === 0 && !(p.reduction && p.reduction > 0))
        ctx.addIssue({ code: "custom", message: "پرداخت صفر" });
      if (isAsset(e.kind)) {
        if (
          !p.quantity ||
          new D(p.quantity).lte(0) ||
          p.unitPrice === undefined ||
          p.unitPrice === 0 ||
          p.fee === undefined
        )
          ctx.addIssue({
            code: "custom",
            message: "مقدار، قیمت و کارمزد معامله لازم است",
          });
        else {
          const gross = round(new D(p.quantity).mul(p.unitPrice));
          const cash = round(
            new D(gross)[isBuy(e.kind) ? "add" : "sub"](p.fee),
          );
          if (cash !== p.amount)
            ctx.addIssue({
              code: "custom",
              message: "وجه معامله با مقدار، نرخ و کارمزد همخوان نیست",
            });
        }
      } else if (
        p.quantity !== undefined ||
        p.unitPrice !== undefined ||
        p.fee !== undefined
      )
        ctx.addIssue({
          code: "custom",
          message: "اطلاعات دارایی روی پرداخت غیرمعامله مجاز نیست",
        });
      if (e.kind !== "installment" && p.reduction !== undefined)
        ctx.addIssue({
          code: "custom",
          message: "کاهش اصل فقط برای قسط مجاز است",
        });
    }
    try {
      actualCash(l, "9999-12-31");
      portfolio(l, "9999-12-31");
    } catch {
      ctx.addIssue({
        code: "custom",
        message: "موجودی دارایی یا دقت محاسبات نامعتبر است",
      });
    }
  });
export type Ledger = z.infer<typeof ledgerSchema>;
export const money = (value: number) =>
  new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 1 }).format(value) +
  " تومان";
export const million = (value: number) =>
  new D(value)
    .div(1e6)
    .toNumber()
    .toLocaleString("fa-IR", { maximumFractionDigits: 2 }) + " میلیون";
export const period = (year: number, month: number) =>
  `${year}-${String(month).padStart(2, "0")}`;
export const nextMonth = (key: string, increment: number) => {
  periodSchema.parse(key);
  const [y, m] = key.split("-").map(Number);
  const n = y * 12 + m - 1 + increment;
  return period(Math.floor(n / 12), (n % 12) + 1);
};
export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function monthOf(date = today()) {
  const [y, m, d] = date.split("-").map(Number);
  const j = jalali.toJalaali(y, m, d);
  return period(j.jy, j.jm);
}
export function dueDate(month: string, day: number) {
  periodSchema.parse(month);
  const [y, m] = month.split("-").map(Number);
  const g = jalali.toGregorian(
    y,
    m,
    Math.min(day, jalali.jalaaliMonthLength(y, m)),
  );
  return dateSchema.parse(
    `${g.gy}-${String(g.gm).padStart(2, "0")}-${String(g.gd).padStart(2, "0")}`,
  );
}
export const round = (n: Decimal) => {
  const v = n.mul(10).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  if (v.abs().gt(Number.MAX_SAFE_INTEGER)) throw Error("مبلغ خارج از دقت");
  return v.div(10).toNumber();
};
const sum = (ns: number[]) => {
  const n = ns.reduce((s, v) => s.add(rial(v)), new D(0));
  if (n.abs().gt(Number.MAX_SAFE_INTEGER))
    throw Error("جمع خارج از دقت مجاز است");
  return n.div(10).toNumber();
};
export function matches(e: Entry, m: string) {
  return !e.cancelled && (e.repeat ? m >= e.month : m === e.month);
}
export function amountAt(e: Entry, m: string) {
  return (
    e.revisions.filter((r) => r.month <= m).at(-1)?.amount ??
    (e.revisions.some((r) => r.month <= m) ? null : e.amount)
  );
}
export function paid(
  l: Pick<Ledger, "payments">,
  id: string,
  m: string,
  asOf = "9999-12-31",
) {
  return sum(
    l.payments
      .filter((p) => p.entryId === id && p.month === m && p.date <= asOf)
      .map((p) => p.reduction ?? p.amount),
  );
}
export function remaining(l: Ledger, e: Entry, m: string, asOf = "9999-12-31") {
  const a = amountAt(e, m);
  return e.cancelled || a === null
    ? 0
    : round(new D(a).sub(paid(l, e.id, m, asOf)));
}
export const isAsset = (k: Kind) =>
  ["goldBuy", "goldSell", "usdBuy", "usdSell"].includes(k);
export const isBuy = (k: Kind) => k === "goldBuy" || k === "usdBuy";
export const sign = (k: Kind) =>
  k === "income" || k === "goldSell" || k === "usdSell" ? 1 : -1;
export function actualCash(l: Ledger, asOf = today()) {
  return round(
    l.payments
      .filter((p) => p.date <= asOf)
      .reduce((v, p) => {
        const e = l.entries.find((e) => e.id === p.entryId);
        if (!e) throw Error("رکورد پرداخت یافت نشد");
        return v.add(new D(p.amount).mul(sign(e.kind)));
      }, new D(l.profile.cash)),
  );
}
export function portfolio(l: Ledger, asOf = today()) {
  return (["gold", "usd"] as const).map((asset) => {
    let q = new D(asset === "gold" ? l.profile.goldGrams : l.profile.usdUnits),
      cost = new D(
        asset === "gold" ? (l.profile.goldCost ?? 0) : (l.profile.usdCost ?? 0),
      ),
      realized = new D(0);
    let unknownCost =
      q.gt(0) &&
      (asset === "gold" ? l.profile.goldCost : l.profile.usdCost) === null;
    for (const p of [...l.payments]
      .filter((p) => p.date <= asOf)
      .sort((a, b) => a.date.localeCompare(b.date))) {
      const e = l.entries.find((e) => e.id === p.entryId);
      if (!e || !e.kind.startsWith(asset)) continue;
      if (!p.quantity) throw Error("وزن/تعداد معامله نامشخص");
      const quantity = new D(p.quantity);
      if (isBuy(e.kind)) {
        q = q.add(quantity);
        cost = cost.add(p.amount);
      } else {
        if (quantity.gt(q)) throw Error("فروش بیش از موجودی");
        const basis = cost.mul(quantity).div(q);
        realized = realized.add(new D(p.amount).sub(basis));
        q = q.sub(quantity);
        cost = cost.sub(basis);
      }
    }
    const price = asset === "gold" ? l.profile.goldPrice : l.profile.usdPrice;
    const value = q.isZero() ? 0 : price === null ? null : round(q.mul(price));
    return {
      asset,
      quantity: q.toFixed(),
      cost: unknownCost ? null : round(cost),
      value,
      unrealized:
        unknownCost || value === null ? null : round(new D(value).sub(cost)),
      realized: unknownCost ? null : round(realized),
    };
  });
}
export function cashflow(l: Ledger, m: string, asOf = today()) {
  const xs = l.entries.filter((e) => matches(e, m));
  const total = (kind: Kind) =>
    sum(xs.filter((e) => e.kind === kind).map((e) => amountAt(e, m) ?? 0));
  const income = total("income"),
    expenses = total("expense"),
    installments = total("installment"),
    goldBuys = total("goldBuy"),
    goldSells = total("goldSell"),
    usdBuys = total("usdBuy"),
    usdSells = total("usdSell");
  const net = round(
    new D(income)
      .sub(expenses)
      .sub(installments)
      .sub(goldBuys)
      .add(goldSells)
      .sub(usdBuys)
      .add(usdSells),
  );
  const remainingNet = round(
    xs.reduce(
      (s, e) => s.add(new D(remaining(l, e, m, asOf)).mul(sign(e.kind))),
      new D(0),
    ),
  );
  return {
    income,
    expenses,
    installments,
    goldBuys,
    goldSells,
    usdBuys,
    usdSells,
    net,
    remainingNet,
    unknown: xs.filter((e) => amountAt(e, m) === null || !e.confirmed).length,
  };
}
export function occurrences(l: Ledger, to: string) {
  const rows: {
    entry: Entry;
    month: string;
    date: string;
    remaining: number;
  }[] = [];
  for (const e of l.entries) {
    if (e.cancelled) continue;
    for (let m = e.month; m <= monthOf(to); m = nextMonth(m, 1)) {
      const date = dueDate(m, e.day);
      if (date <= to)
        rows.push({
          entry: e,
          month: m,
          date,
          remaining: remaining(l, e, m, today()),
        });
      if (rows.length > 50000) throw Error("بازه تکرار بیش از حد بزرگ است");
      if (!e.repeat) break;
    }
  }
  return rows;
}
export function forecast(
  l: Ledger,
  startMonth: string,
  count: number,
  initialCash = actualCash(l),
  asOf = today(),
) {
  if (!Number.isInteger(count) || count < 1 || count > 24)
    throw Error("افق باید ۱ تا ۲۴ ماه باشد");
  let cash = new D(initialCash),
    minimum = initialCash;
  const end = dueDate(nextMonth(startMonth, count - 1), 31),
    all = occurrences(l, end);
  const scheduled = all.map((r) => ({
    ...r,
    remaining: remaining(l, r.entry, r.month, asOf),
    date: r.date < asOf ? asOf : r.date,
  }));
  const days = new Map<string, Decimal>();
  for (const r of scheduled) {
    if (r.date > end) continue;
    days.set(
      r.date,
      (days.get(r.date) ?? new D(0)).add(
        new D(r.remaining).mul(sign(r.entry.kind)),
      ),
    );
  }
  const daily = [{ date: asOf, cash: initialCash }];
  for (const [date, delta] of [...days].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    cash = cash.add(delta);
    const v = round(cash);
    minimum = Math.min(minimum, v);
    daily.push({ date, cash: v });
  }
  return Array.from({ length: count }, (_, i) => {
    const month = nextMonth(startMonth, i),
      last = dueDate(month, 31),
      points = daily.filter((p) => p.date <= last);
    const balance =
      last < asOf ? actualCash(l, last) : (points.at(-1)?.cash ?? initialCash);
    return {
      ...cashflow(l, month, asOf),
      month,
      cash: balance,
      minimum:
        last < asOf
          ? balance
          : Math.min(initialCash, ...points.map((p) => p.cash)),
      daily: daily.filter((p) => p.date >= dueDate(month, 1) && p.date <= last),
    };
  });
}
export function recordPayment(
  l: Ledger,
  entryId: string,
  m: string,
  amount: number,
  date: string,
  asset?: { quantity: string; unitPrice: number; fee: number },
) {
  const e = l.entries.find((e) => e.id === entryId);
  if (!e) throw Error("رکورد یافت نشد");
  dateSchema.parse(date);
  if (date > today()) throw Error("پرداخت واقعی نمی‌تواند آینده باشد");
  if (amount <= 0 || amount > remaining(l, e, m))
    throw Error("مبلغ باید مثبت و حداکثر برابر مانده باشد");
  if (e.kind === "installment") {
    if (date < dueDate(m, e.day) && e.allowEarly !== "yes")
      throw Error("مجوز پرداخت زودهنگام مشخص نیست");
    if (amount < remaining(l, e, m) && e.allowPartial !== "yes")
      throw Error("مجوز پرداخت جزئی مشخص نیست");
  }
  return ledgerSchema.parse({
    ...l,
    payments: [
      ...l.payments,
      {
        id: crypto.randomUUID(),
        entryId,
        month: m,
        amount,
        date,
        name: e.name,
        ...asset,
      },
    ],
  });
}
export function scenario(
  l: Ledger,
  start: string,
  months: number,
  available: number,
  trip: number,
  payDebt: number,
  goldNow: number,
  monthlyGold: number,
  usdNow = 0,
  priceChange = 0,
) {
  const amounts = [available, trip, payDebt, goldNow, monthlyGold, usdNow];
  amounts.forEach((v) => amountSchema.parse(v));
  if (
    !Number.isInteger(months) ||
    months < 1 ||
    months > 24 ||
    !Number.isFinite(priceChange) ||
    priceChange <= -100 ||
    priceChange > 1000
  )
    throw Error("افق یا درصد سناریو معتبر نیست");
  if (new D(trip).add(payDebt).add(goldNow).add(usdNow).gt(available))
    throw Error("مجموع تخصیص از بودجه بیشتر است");
  if (l.entries.some((e) => e.kind === "installment" && e.repeat))
    throw Error(
      "برای محاسبه مانده بدهی، اقساط باید مستقل و با پایان مشخص ثبت شوند",
    );
  const working = ledgerSchema.parse(l),
    asOf = today(),
    end = dueDate(nextMonth(start, months - 1), 31);
  if (end < asOf) throw Error("سناریو باید شامل امروز یا آینده باشد");
  if (start < monthOf()) throw Error("شروع سناریو نباید در گذشته باشد");
  const startCash = actualCash(l),
    baseGold = l.profile.goldPrice,
    baseUsd = l.profile.usdPrice;
  working.profile.cash = round(new D(working.profile.cash).sub(trip));
  const pending = occurrences(working, end).map((r) => ({
    ...r,
    date: r.date < asOf ? asOf : r.date,
  }));
  const allDebt = working.entries
    .filter((e) => e.kind === "installment" && !e.cancelled)
    .sort((a, b) =>
      dueDate(a.month, a.day).localeCompare(dueDate(b.month, b.day)),
    );
  const knownDebt = sum(
    allDebt.map((e) => remaining(working, e, e.month, asOf)),
  );
  if (allDebt.some((e) => amountAt(e, e.month) === null) && payDebt)
    throw Error("مبلغ بدهی کامل نیست");
  if (payDebt > knownDebt) throw Error("پرداخت فرضی بیش از بدهی ثبت‌شده است");
  let debtBudget = payDebt;
  for (const e of allDebt) {
    const amount = Math.min(debtBudget, remaining(working, e, e.month, asOf));
    if (amount) {
      working.payments.push({
        id: crypto.randomUUID(),
        entryId: e.id,
        month: e.month,
        amount,
        date: asOf,
      });
      debtBudget = round(new D(debtBudget).sub(amount));
    }
  }
  const fee = new D(l.profile.goldFeePct).div(100);
  let investedGold = 0,
    investedUsd = 0;
  function assetTrade(kind: Kind, budget: number, date: string) {
    const isGold = kind.startsWith("gold"),
      price = isGold ? working.profile.goldPrice : working.profile.usdPrice;
    if (!price)
      throw Error(isGold ? "قیمت طلا مشخص نیست" : "نرخ دلار مشخص نیست");
    const rate = isGold ? fee : new D(0),
      factor = isBuy(kind) ? new D(1).add(rate) : new D(1).sub(rate);
    if (factor.lte(0)) throw Error("کارمزد فروش معتبر نیست");
    let quantity = new D(budget)
      .div(price)
      .div(factor)
      .toDecimalPlaces(6, Decimal.ROUND_DOWN);
    if (quantity.lte(0)) return;
    const gross = round(quantity.mul(price)),
      cost = round(new D(gross).mul(rate)),
      amount = round(new D(gross)[isBuy(kind) ? "add" : "sub"](cost));
    if (amount > budget && isBuy(kind)) {
      quantity = quantity.sub("0.000001");
      if (quantity.lte(0)) return;
    }
    const actualGross = round(quantity.mul(price)),
      actualFee = round(new D(actualGross).mul(rate)),
      actual = round(
        new D(actualGross)[isBuy(kind) ? "add" : "sub"](actualFee),
      );
    const id = crypto.randomUUID(),
      month = monthOf(date);
    working.entries.push(
      entrySchema.parse({
        id,
        name: "معامله فرضی",
        amount: actual,
        month,
        day: 1,
        kind,
        status: "planned",
        repeat: false,
      }),
    );
    working.payments.push({
      id: crypto.randomUUID(),
      entryId: id,
      month,
      amount: actual,
      date,
      quantity: quantity.toFixed(),
      unitPrice: price,
      fee: actualFee,
    });
    portfolio(working, date);
    if (isBuy(kind)) {
      if (isGold) investedGold = round(new D(investedGold).add(actual));
      else investedUsd = round(new D(investedUsd).add(actual));
    }
  }
  if (goldNow) assetTrade("goldBuy", goldNow, asOf);
  if (usdNow) assetTrade("usdBuy", usdNow, asOf);
  let minimum = actualCash(working, asOf);
  const rows = [];
  const currentMonthKey = monthOf(asOf);
  let monthIndex = 0;
  for (let date = asOf; date <= end;) {
    const m = monthOf(date);
    const monthEnd = dueDate(m, 31);
    const priceStep = Math.max(
      0,
      Array.from({ length: months }, (_, i) => nextMonth(start, i)).indexOf(m),
    );
    working.profile.goldPrice =
      baseGold === null
        ? null
        : round(
            new D(baseGold).mul(
              new D(1).add(
                new D(priceChange).mul(priceStep).div(months).div(100),
              ),
            ),
          );
    working.profile.usdPrice = baseUsd;
    let installmentPaid = 0,
      income = 0,
      expenses = 0;
    while (date <= monthEnd && date <= end) {
      const events = pending
        .filter((r) => r.date === date)
        .sort(
          (a, b) =>
            Number(isAsset(a.entry.kind) && !isBuy(a.entry.kind)) -
            Number(isAsset(b.entry.kind) && !isBuy(b.entry.kind)),
        );
      for (const event of events) {
        const e = event.entry,
          amount = remaining(working, e, event.month, date);
        if (amount <= 0) continue;
        if (isAsset(e.kind)) {
          assetTrade(e.kind, amount, date);
          continue;
        }
        working.payments.push({
          id: crypto.randomUUID(),
          entryId: e.id,
          month: event.month,
          amount,
          date,
        });
        if (e.kind === "income") income = round(new D(income).add(amount));
        else if (e.kind === "expense")
          expenses = round(new D(expenses).add(amount));
        else installmentPaid = round(new D(installmentPaid).add(amount));
      }
      minimum = Math.min(minimum, actualCash(working, date));
      const d = new Date(date + "T12:00:00Z");
      d.setUTCDate(d.getUTCDate() + 1);
      date = d.toISOString().slice(0, 10);
    }
    if (m >= start) {
      working.profile.goldPrice =
        baseGold === null
          ? null
          : round(
              new D(baseGold).mul(
                new D(1).add(
                  new D(priceChange)
                    .mul(priceStep + 1)
                    .div(months)
                    .div(100),
                ),
              ),
            );
      if (monthlyGold) assetTrade("goldBuy", monthlyGold, monthEnd);
      const cash = actualCash(working, monthEnd),
        assets = portfolio(working, monthEnd);
      minimum = Math.min(minimum, cash);
      const debt = sum(
        allDebt.map((e) => remaining(working, e, e.month, monthEnd)),
      );
      const goldValue = assets[0].value,
        usdValue = assets[1].value;
      rows.push({
        month: m,
        cash,
        installmentPaid,
        expenses,
        income,
        goldAccumulated: investedGold,
        usdAccumulated: investedUsd,
        goldGrams: assets[0].quantity,
        usdUnits: assets[1].quantity,
        goldValue,
        usdValue,
        debt,
        netWorth: round(
          new D(cash)
            .add(goldValue ?? 0)
            .add(usdValue ?? 0)
            .sub(debt),
        ),
        minimum,
        capacity: round(new D(cash).sub(l.profile.reserve)),
        fundingGap: Math.max(0, round(new D(available).sub(startCash))),
        incomplete:
          assets.some((a) => a.value === null && a.quantity !== "0") ||
          allDebt.some((e) => e.amount === null),
      });
    }
  }
  return rows;
}
