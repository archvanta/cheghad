import * as j from "jalaali-js";
import {
  type State,
  type Entry,
  type Rule,
  jalaliMonth,
  isoDate,
  today,
} from "./model";
const dayAfter = (s: string, days: number) => {
  const d = new Date(s + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
export function occurrenceId(rule: Rule, date: string) {
  return rule.id.slice(0, 24) + date.replaceAll("-", "").padStart(12, "0");
}
export function expandEntries(state: State, until: string): Entry[] {
  isoDate.parse(until);
  const entries = new Map(state.entries.map((e) => [e.id, e]));
  let count = 0;
  for (const rule of state.rules) {
    const [y, m, d] = rule.start.split("-").map(Number),
      anchor = j.toJalaali(y, m, d);
    let date = rule.start,
      index = 0;
    while (date <= until && (!rule.end || date <= rule.end)) {
      if (++count > 50000)
        throw new Error(
          "تعداد رخدادها بیش از محدوده است؛ تاریخ شروع را بررسی کنید",
        );
      const id = occurrenceId(rule, date);
      if (!entries.has(id) && !state.excludedEntryIds.includes(id)) {
        const revision = rule.revisions.filter((r) => r.from <= date).at(-1)!;
        entries.set(id, {
          id,
          ruleId: rule.id,
          source: rule.source,
          notes: rule.notes,
          certainty: rule.certainty,
          incomeType: rule.incomeType,
          categoryId: rule.categoryId,
          title: rule.title,
          kind: rule.kind,
          amount: revision.amount,
          dueDate: date,
          confirmed: true,
          payments: [],
          createdAt: rule.createdAt,
          updatedAt: rule.updatedAt,
        });
      }
      index++;
      if (rule.frequency === "monthly") {
        const month = jalaliMonth(rule.start, index);
        const [gy, gm, gd] = month.start.split("-").map(Number);
        const a = j.toJalaali(gy, gm, gd);
        const g = j.toGregorian(
          a.jy,
          a.jm,
          Math.min(anchor.jd, j.jalaaliMonthLength(a.jy, a.jm)),
        );
        date = `${g.gy}-${String(g.gm).padStart(2, "0")}-${String(g.gd).padStart(2, "0")}`;
      } else
        date = dayAfter(
          rule.start,
          index * (rule.frequency === "daily" ? 1 : 7),
        );
    }
  }
  return [...entries.values()];
}
export function reviseRule(
  rule: Rule,
  from: string,
  amount: number | null,
  asOf: string,
): Rule {
  isoDate.parse(from);
  if (from < asOf || from < rule.start)
    throw new Error("تغییر مبلغ فقط از امروز یا آینده مجاز است");
  return {
    ...rule,
    updatedAt: new Date().toISOString(),
    revisions: [
      ...rule.revisions.filter((r) => r.from < from),
      { from, amount },
    ],
  };
}
export function budgetReport(state: State, start: string, end: string) {
  const entries = expandEntries(state, end).filter(
    (e) => e.kind === "expense" && e.dueDate >= start && e.dueDate <= end,
  );
  return state.categories.map((c) => {
    const rows = entries.filter((e) => e.categoryId === c.id);
    const planned = rows.reduce((s, e) => s + BigInt(e.amount ?? 0), 0n);
    const actual = state.entries
      .filter((e) => e.kind === "expense" && e.categoryId === c.id)
      .flatMap((e) => e.payments)
      .filter((p) => p.date >= start && p.date <= end)
      .reduce((s, p) => s + BigInt(p.amount), 0n);
    return {
      ...c,
      planned: Number(planned),
      actual: Number(actual),
      unknown: rows.some((e) => e.amount === null),
    };
  });
}

/** Preserve every earlier occurrence before replacing a schedule from today onward. */
export function replaceSchedule(state: State, rule: Rule, from: string): State {
  isoDate.parse(from);
  if (from < today()) throw new Error("برنامه گذشته قابل بازنویسی نیست");
  const old = state.rules.find((r) => r.id === rule.id);
  if (!old) throw new Error("قاعده پیدا نشد");
  const previous = expandEntries({ ...state, rules: [old] }, from).filter(
    (e) => e.ruleId === old.id && e.dueDate < from,
  );
  const entries = new Map(state.entries.map((e) => [e.id, e]));
  for (const e of previous) if (!entries.has(e.id)) entries.set(e.id, e);
  return {
    ...state,
    entries: [...entries.values()],
    rules: state.rules.map((r) => (r.id === rule.id ? rule : r)),
  };
}
