import { z } from "zod";
import {
  amountSchema,
  signedAmount,
  periodSchema,
  entrySchema,
  ledgerSchema,
  type Ledger,
  type Entry,
  monthOf,
  cashflow,
  actualCash,
  amountAt,
  forecast,
  monthOf as currentMonth,
} from "../finance";
const contextEntry = z.object({
  id: entrySchema.shape.id,
  name: entrySchema.shape.name,
  amount: entrySchema.shape.amount,
  month: entrySchema.shape.month,
  day: entrySchema.shape.day,
  kind: entrySchema.shape.kind,
  repeat: entrySchema.shape.repeat,
  confirmed: entrySchema.shape.confirmed,
  category: entrySchema.shape.category,
  note: entrySchema.shape.note,
});
export const contextSchema = z
  .object({
    revision: z.number().int().nonnegative(),
    month: periodSchema,
    entries: z.array(contextEntry).max(200),
    summary: z.object({
      cash: signedAmount,
      income: amountSchema,
      expenses: amountSchema,
      installments: amountSchema,
      endCash: signedAmount,
      minimum: signedAmount,
      unknown: z.number().int().nonnegative(),
    }),
  })
  .strict();
export type AiContext = z.infer<typeof contextSchema>;
export function buildContext(
  l: Ledger,
  month: string,
  includeNotes = false,
  selectedIds?: string[],
): AiContext {
  const report = cashflow(l, month),
    future = forecast(l, month, 1);
  return contextSchema.parse({
    revision: l.revision,
    month,
    entries: l.entries
      .filter(
        (e) => !e.cancelled && (!selectedIds || selectedIds.includes(e.id)),
      )
      .map((e) => ({ ...e, note: includeNotes ? e.note : undefined })),
    summary: {
      cash: actualCash(l),
      income: report.income,
      expenses: report.expenses,
      installments: report.installments,
      endCash: future[0].cash,
      minimum: future[0].minimum,
      unknown: report.unknown,
    },
  });
}
const changesSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    amount: amountSchema.nullable().optional(),
    note: z.string().max(2000).optional(),
    category: z.string().max(80).optional(),
  })
  .strict()
  .refine((c) => Object.keys(c).length > 0, "تغییری پیشنهاد نشده");
const plannedEntry = z
  .object({
    name: z.string().trim().min(1).max(120),
    amount: amountSchema.nullable(),
    month: periodSchema,
    day: z.number().int().min(1).max(31),
    kind: z.enum(["income", "expense", "installment"]),
    repeat: z.boolean(),
    note: z.string().max(2000).optional(),
    category: z.string().max(80).optional(),
  })
  .strict();
export const operationSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("update_entry"),
      entryId: z.string().min(1).max(100),
      fromMonth: periodSchema,
      changes: changesSchema,
    })
    .strict(),
  z.object({ action: z.literal("add_entry"), entry: plannedEntry }).strict(),
]);
export type Operation = z.infer<typeof operationSchema>;
export const proposalSchema = z
  .object({
    id: z.string().uuid(),
    operation: operationSchema,
    revision: z.number().int().nonnegative(),
    contextHash: z.string().regex(/^[a-f0-9]{64}$/),
    expiresAt: z.number().int().positive(),
  })
  .strict();
export type Proposal = z.infer<typeof proposalSchema>;
export const aiResponseSchema = z
  .object({ reply: z.string().max(10000), proposal: proposalSchema.nullable() })
  .strict();
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value !== null && typeof value === "object")
    return (
      "{" +
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => JSON.stringify(k) + ":" + canonical(v))
        .join(",") +
      "}"
    );
  return JSON.stringify(value);
}
export async function hashContext(context: AiContext) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonical(contextSchema.parse(context))),
  );
  return [...new Uint8Array(digest)]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
export function validateOperation(op: Operation, context: AiContext) {
  if (op.action === "update_entry") {
    const e = context.entries.find((e) => e.id === op.entryId);
    if (!e) throw Error("مدل رکوردی خارج از اطلاعات ارسال‌شده انتخاب کرده است");
    if (op.fromMonth < currentMonth() || op.fromMonth < e.month)
      throw Error("هوش مصنوعی مجاز به تغییر گذشته نیست");
  } else if (op.entry.month < currentMonth())
    throw Error("افزودن پیش‌بینی به گذشته مجاز نیست");
  return op;
}
export function applyApproved(l: Ledger, proposal: Proposal): Ledger {
  if (l.revision !== proposal.revision)
    throw Error("اطلاعات از زمان پیشنهاد تغییر کرده است");
  if (Date.now() > proposal.expiresAt) throw Error("پیشنهاد منقضی شده است");
  const op = proposal.operation;
  validateOperation(
    op,
    buildContext(
      l,
      monthOf(),
      false,
      op.action === "update_entry" ? [op.entryId] : [],
    ),
  );
  let entries: Entry[];
  if (op.action === "update_entry")
    entries = l.entries.map((e) => {
      if (e.id !== op.entryId) return e;
      const { amount, ...metadata } = op.changes;
      return {
        ...e,
        ...metadata,
        ...("amount" in op.changes
          ? {
              revisions: [
                ...e.revisions.filter((r) => r.month < op.fromMonth),
                { month: op.fromMonth, amount: amount ?? null },
              ],
            }
          : {}),
        updatedAt: new Date().toISOString(),
      };
    });
  else {
    const now = new Date().toISOString();
    entries = [
      ...l.entries,
      entrySchema.parse({
        ...op.entry,
        id: crypto.randomUUID(),
        status: "planned",
        confirmed: false,
        createdAt: now,
        updatedAt: now,
      }),
    ];
  }
  if (
    op.action === "update_entry" &&
    !l.entries.some((e) => e.id === op.entryId)
  )
    throw Error("رکورد دیگر وجود ندارد");
  return ledgerSchema.parse({ ...l, entries });
}
export function endpointUrl(value: string) {
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash)
    throw Error("نشانی بک‌اند نباید رمز، توکن یا پارامتر داشته باشد");
  if (
    url.protocol !== "https:" &&
    !(
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    )
  )
    throw Error("بک‌اند باید HTTPS باشد");
  return url.toString().replace(/\/$/, "");
}
