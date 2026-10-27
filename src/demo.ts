import { initial } from "./data";
import {
  entrySchema,
  monthOf,
  nextMonth,
  type Kind,
  type Ledger,
} from "./finance";
// Public synthetic examples. These are never derived from the owner's finances.
export function demoLedger(): Ledger {
  const month = monthOf();
  const row = (
    name: string,
    kind: Kind,
    amount: number,
    offset = 0,
    repeat = false,
    day = 10,
  ) =>
    entrySchema.parse({
      id: crypto.randomUUID(),
      name,
      kind,
      amount,
      month: nextMonth(month, offset),
      repeat,
      day,
      status: "planned",
      confirmed: true,
      allowEarly: "yes",
      allowPartial: "yes",
    });
  return {
    ...structuredClone(initial),
    profile: {
      ...initial.profile,
      cash: 18000000,
      reserve: 10000000,
      goldGrams: 0.6,
      goldPrice: 9000000,
      goldCost: 5000000,
      usdUnits: 150,
      usdPrice: 95000,
      usdCost: 13500000,
    },
    entries: [
      row("درآمد نمونه", "income", 32000000, 0, true, 5),
      row("خانه نمونه", "expense", 8000000, 0, true),
      row("خرید روزمره نمونه", "expense", 2400000, 0, true, 15),
      row("رفت‌وآمد نمونه", "expense", 1200000, 0, true, 20),
      row("قسط نمونه ۱", "installment", 6000000, 1),
      row("قسط نمونه ۲", "installment", 4000000, 2),
      row("قسط نمونه ۳", "installment", 2000000, 3),
    ],
  };
}
