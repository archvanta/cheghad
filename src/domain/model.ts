import { z } from "zod";
import * as jalaali from "jalaali-js";
export const money = z
  .number()
  .int()
  .nonnegative()
  .max(Number.MAX_SAFE_INTEGER);
export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => {
    const d = new Date(s + "T12:00:00Z");
    return (
      !Number.isNaN(d.valueOf()) &&
      d.toISOString().slice(0, 10) === s &&
      +s.slice(0, 4) >= 1900 &&
      +s.slice(0, 4) <= 2200
    );
  }, "تاریخ معتبر نیست");
const metadata = {
  source: z.string().max(100).optional(),
  notes: z.string().max(2000).optional(),
  certainty: z.enum(["expected", "committed"]).optional(),
  incomeType: z.string().max(60).optional(),
};
export const categorySchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(60),
  budget: money.nullable(),
});
export const ruleSchema = z
  .object({
    id: z.string().uuid(),
    title: z.string().trim().min(1).max(100),
    ...metadata,
    kind: z.enum(["income", "expense"]),
    categoryId: z.string().uuid().optional(),
    start: isoDate,
    end: isoDate.nullable(),
    frequency: z.enum(["daily", "weekly", "monthly"]),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    revisions: z
      .array(z.object({ from: isoDate, amount: money.nullable() }))
      .min(1),
  })
  .refine((r) => !r.end || r.end >= r.start, "پایان قبل از شروع است")
  .refine(
    (r) =>
      r.revisions[0].from === r.start &&
      r.revisions.every((v, i) => i === 0 || v.from > r.revisions[i - 1].from),
    "نسخه‌های مبلغ باید مرتب و یکتا باشند",
  );
export const debtSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(1).max(100),
  provider: z.string().max(100),
  reference: z.string().max(100),
  principal: money.nullable(),
  allowEarly: z.enum(["yes", "no", "unknown"]),
  allowPartial: z.enum(["yes", "no", "unknown"]),
  notes: z.string().max(2000),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export const entrySchema = z
  .object({
    id: z.string().uuid(),
    ...metadata,
    debtId: z.string().uuid().optional(),
    cancelled: z.boolean().optional(),
    ruleId: z.string().uuid().optional(),
    categoryId: z.string().uuid().optional(),
    title: z.string().trim().min(1).max(100),
    kind: z.enum(["income", "expense", "installment"]),
    amount: money.nullable(),
    dueDate: isoDate,
    confirmed: z.boolean(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    payments: z.array(
      z.object({
        id: z.string().uuid(),
        amount: money,
        reduction: money.optional(),
        date: isoDate,
      }),
    ),
  })
  .superRefine((e, ctx) => {
    if (e.payments.length && e.amount === null)
      ctx.addIssue({ code: "custom", message: "ابتدا مبلغ را مشخص کنید" });
    const sum = e.payments.reduce(
      (s, p) => s + BigInt(p.reduction ?? p.amount),
      0n,
    );
    if (e.payments.some((p) => p.amount === 0 && !p.reduction))
      ctx.addIssue({ code: "custom", message: "پرداخت صفر مجاز نیست" });
    if (e.cancelled && e.payments.length)
      ctx.addIssue({
        code: "custom",
        message: "قسط دارای پرداخت قابل لغو نیست",
      });
    if (
      e.kind !== "installment" &&
      e.payments.some((p) => p.reduction !== undefined)
    )
      ctx.addIssue({ code: "custom", message: "تخفیف فقط برای بدهی مجاز است" });
    if (sum > BigInt(e.amount ?? 0))
      ctx.addIssue({
        code: "custom",
        message: "پرداخت بیشتر از مبلغ مجاز نیست",
      });
    if (new Set(e.payments.map((p) => p.id)).size !== e.payments.length)
      ctx.addIssue({ code: "custom", message: "پرداخت تکراری" });
  });
export const goldAssetSchema = z
  .object({
    id: z.string().uuid(),
    title: z.string().trim().min(1).max(100),
    kind: z.enum(["18k", "24k", "melted", "digital", "coin", "usd"]),
    unit: z.enum(["gram", "coin", "usd"]),
    price: money.nullable(),
    priceDate: isoDate.nullable(),
    spreadBps: z.number().int().min(0).max(10000),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .refine(
    (a) =>
      a.kind === "usd"
        ? a.unit === "usd"
        : a.kind === "coin"
          ? a.unit === "coin"
          : a.unit === "gram",
    "واحد دارایی با نوع آن سازگار نیست",
  );
export const goldTransactionSchema = z
  .object({
    id: z.string().uuid(),
    assetId: z.string().uuid(),
    side: z.enum(["buy", "sell"]),
    quantity: z
      .string()
      .regex(/^\d{1,9}(\.\d{1,6})?$/)
      .refine((s) => /[1-9]/.test(s), "مقدار باید مثبت باشد"),
    price: money.positive(),
    commission: money,
    workmanship: money,
    tax: money,
    other: money,
    date: isoDate,
    opening: z.boolean(),
    notes: z.string().max(2000),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .refine(
    (t) => !t.opening || t.side === "buy",
    "فقط خرید می‌تواند موجودی اولیه باشد",
  );
export const scenarioSchema = z
  .object({
    id: z.string().uuid(),
    title: z.string().trim().min(1).max(100),
    available: money,
    goldAmount: money,
    usdAmount: money,
    debtAmount: money,
    reserveAmount: money,
    goldAssetId: z.string().uuid().optional(),
    usdAssetId: z.string().uuid().optional(),
    debtId: z.string().uuid().optional(),
    debtMode: z.enum(["face", "quote"]),
    goldChange: z.number().min(-90).max(300),
    usdChange: z.number().min(-90).max(300),
    feeBps: z.number().int().min(0).max(10000),
    plans: z.array(
      z.object({
        month: z.number().int().min(0).max(23),
        assetId: z.string().uuid(),
        budget: money,
        price: money.nullable(),
      }),
    ),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .refine(
    (s) =>
      BigInt(s.goldAmount) +
        BigInt(s.usdAmount) +
        BigInt(s.debtAmount) +
        BigInt(s.reserveAmount) <=
      BigInt(s.available),
    "تخصیص از مبلغ در دسترس بیشتر است",
  );
export const stateSchema = z
  .object({
    version: z.literal(5),
    scenarios: z.array(scenarioSchema),
    horizon: z.union([
      z.literal(3),
      z.literal(6),
      z.literal(12),
      z.literal(18),
      z.literal(24),
    ]),
    calendar: z.enum(["persian", "gregory"]),
    displayUnit: z.enum(["toman", "rial"]),
    onboarded: z.boolean(),
    goldAssets: z.array(goldAssetSchema),
    goldTransactions: z.array(goldTransactionSchema),
    debts: z.array(debtSchema),
    categories: z.array(categorySchema),
    rules: z.array(ruleSchema),
    excludedEntryIds: z.array(z.string().uuid()),
    history: z
      .array(z.object({ date: z.string().datetime(), action: z.string() }))
      .max(100),
    openingBalance: money,
    reserve: money,
    theme: z.enum(["dark", "light"]),
    digits: z.enum(["fa-IR", "en-US"]),
    entries: z.array(entrySchema),
    savedAt: z.string().datetime().nullable(),
  })
  .superRefine((s, ctx) => {
    for (const list of [
      s.categories,
      s.rules,
      s.debts,
      s.goldAssets,
      s.goldTransactions,
    ])
      if (new Set(list.map((x) => x.id)).size !== list.length)
        ctx.addIssue({ code: "custom", message: "شناسه تکراری" });
    for (const item of [...s.entries, ...s.rules])
      if (
        item.categoryId &&
        !s.categories.some((c) => c.id === item.categoryId)
      )
        ctx.addIssue({ code: "custom", message: "دسته نامعتبر" });
    for (const e of s.entries)
      if (
        e.debtId &&
        (e.kind !== "installment" || !s.debts.some((d) => d.id === e.debtId))
      )
        ctx.addIssue({ code: "custom", message: "قرارداد قسط نامعتبر است" });
    for (const t of s.goldTransactions)
      if (!s.goldAssets.some((a) => a.id === t.assetId))
        ctx.addIssue({
          code: "custom",
          message: "دارایی تراکنش طلا نامعتبر است",
        });
    const total = s.entries.reduce(
      (sum, e) => sum + BigInt(e.amount ?? 0),
      BigInt(s.openingBalance) + BigInt(s.reserve),
    );
    if (total > BigInt(Number.MAX_SAFE_INTEGER))
      ctx.addIssue({
        code: "custom",
        message: "مجموع مبالغ خارج از محدوده دقت است",
      });
    if (new Set(s.entries.map((e) => e.id)).size !== s.entries.length)
      ctx.addIssue({ code: "custom", message: "شناسه رکورد تکراری" });
  });
export type Scenario = z.infer<typeof scenarioSchema>;
export type GoldAsset = z.infer<typeof goldAssetSchema>;
export type GoldTransaction = z.infer<typeof goldTransactionSchema>;
export type Debt = z.infer<typeof debtSchema>;
export type Rule = z.infer<typeof ruleSchema>;
export type Entry = z.infer<typeof entrySchema>;
export type State = z.infer<typeof stateSchema>;
export const emptyState = (): State => ({
  version: 5,
  scenarios: [],
  horizon: 12,
  calendar: "persian",
  displayUnit: "toman",
  onboarded: false,
  goldAssets: [],
  goldTransactions: [],
  debts: [],
  categories: [],
  rules: [],
  excludedEntryIds: [],
  history: [],
  openingBalance: 0,
  reserve: 0,
  theme: "dark",
  digits: "fa-IR",
  entries: [],
  savedAt: null,
});
export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function jalaliMonth(date: string, offset = 0) {
  const [y, m, d] = date.split("-").map(Number);
  const j = jalaali.toJalaali(y, m, d);
  const n = j.jy * 12 + j.jm - 1 + offset;
  const jy = Math.floor(n / 12),
    jm = (n % 12) + 1;
  const iso = (day: number) => {
    const g = jalaali.toGregorian(jy, jm, day);
    return `${g.gy}-${String(g.gm).padStart(2, "0")}-${String(g.gd).padStart(2, "0")}`;
  };
  return {
    start: iso(1),
    end: iso(jalaali.jalaaliMonthLength(jy, jm)),
    label: new Intl.DateTimeFormat("fa-IR", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(iso(1) + "T12:00:00Z")),
  };
}
