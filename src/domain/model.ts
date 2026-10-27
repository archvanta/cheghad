import { z } from "zod";
import * as jalaali from "jalaali-js";
const money = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
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
export const entrySchema = z
  .object({
    id: z.string().uuid(),
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
        amount: money.positive(),
        date: isoDate,
      }),
    ),
  })
  .superRefine((e, ctx) => {
    if (e.payments.length && e.amount === null)
      ctx.addIssue({ code: "custom", message: "ابتدا مبلغ را مشخص کنید" });
    const sum = e.payments.reduce((s, p) => s + BigInt(p.amount), 0n);
    if (sum > BigInt(e.amount ?? 0))
      ctx.addIssue({
        code: "custom",
        message: "پرداخت بیشتر از مبلغ مجاز نیست",
      });
    if (new Set(e.payments.map((p) => p.id)).size !== e.payments.length)
      ctx.addIssue({ code: "custom", message: "پرداخت تکراری" });
  });
export const stateSchema = z
  .object({
    version: z.literal(1),
    openingBalance: money,
    reserve: money,
    theme: z.enum(["dark", "light"]),
    digits: z.enum(["fa-IR", "en-US"]),
    entries: z.array(entrySchema),
    savedAt: z.string().datetime().nullable(),
  })
  .superRefine((s, ctx) => {
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
export type Entry = z.infer<typeof entrySchema>;
export type State = z.infer<typeof stateSchema>;
export const emptyState = (): State => ({
  version: 1,
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
