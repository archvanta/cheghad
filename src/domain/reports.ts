import { tradeValue } from "./gold";
import { type State, jalaliMonth } from "./model";
export function calendarMonth(
  date: string,
  offset: number,
  calendar: State["calendar"],
) {
  if (calendar === "persian") return jalaliMonth(date, offset);
  const [y, m] = date.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1 + offset, 1, 12));
  const end = new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0, 12),
  );
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
    label: new Intl.DateTimeFormat("fa-IR-u-ca-gregory", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(start),
  };
}
export function calendarDays(start: string, end: string) {
  const result = [];
  for (
    let d = new Date(start + "T12:00:00Z");
    d.toISOString().slice(0, 10) <= end;
    d.setUTCDate(d.getUTCDate() + 1)
  )
    result.push(d.toISOString().slice(0, 10));
  return result;
}
export function csv(rows: (string | number)[][]) {
  return (
    "\uFEFF" +
    rows
      .map((row) =>
        row
          .map((value) => {
            let s = String(value);
            if (typeof value === "string" && /^[\s]*[=+@-]/.test(s))
              s = "'" + s;
            return '"' + s.replaceAll('"', '""') + '"';
          })
          .join(","),
      )
      .join("\r\n")
  );
}
export function reportRows(state: State, from: string, to: string) {
  const headers = [
    "نوع",
    "عنوان",
    "تاریخ",
    "مبلغ واقعی ریال",
    "کاهش اصل بدهی ریال",
    "دسته / دارایی",
  ];
  const rows: (string | number)[][] = [headers];
  for (const e of state.entries)
    for (const p of e.payments.filter((p) => p.date >= from && p.date <= to))
      rows.push([
        e.kind === "income" ? "درآمد" : e.kind === "expense" ? "هزینه" : "قسط",
        e.title,
        p.date,
        p.amount,
        p.reduction ?? p.amount,
        state.categories.find((c) => c.id === e.categoryId)?.name ?? "",
      ]);
  for (const t of state.goldTransactions.filter(
    (t) => t.date >= from && t.date <= to,
  ))
    rows.push([
      t.side === "buy" ? "خرید دارایی" : "فروش دارایی",
      state.goldAssets.find((a) => a.id === t.assetId)?.title ?? "",
      t.date,
      t.opening ? 0 : tradeValue(t).cash,
      0,
      `${t.quantity} واحد؛ قیمت هر واحد ریال؛ هزینه‌ها ${t.commission + t.workmanship + t.tax + t.other}؛ موجودی اولیه ${t.opening}`,
    ]);
  return rows;
}
export function downloadCsv(rows: (string | number)[][], name: string) {
  const url = URL.createObjectURL(
    new Blob([csv(rows)], { type: "text/csv;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
