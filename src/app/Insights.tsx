import { useEffect, useState } from "react";
import { type State, today } from "../domain/model";
import { project } from "../domain/forecast";
import {
  calendarMonth,
  calendarDays,
  downloadCsv,
  reportRows,
} from "../domain/reports";
import { expandEntries, budgetReport } from "../domain/recurring";
import { remaining } from "../domain/engine";
import { tradeValue } from "../domain/gold";
export default function Insights({
  state,
  mode,
  money,
}: {
  state: State;
  mode: "calendar" | "forecast" | "reports";
  money: (n: number) => string;
}) {
  const [offset, setOffset] = useState(0),
    [day, setDay] = useState(today()),
    [selected, setSelected] = useState(""),
    [horizon, setHorizon] = useState(state.horizon),
    [from, setFrom] = useState(calendarMonth(today(), 0, state.calendar).start),
    [to, setTo] = useState(calendarMonth(today(), 0, state.calendar).end);
  const m = calendarMonth(today(), offset, state.calendar),
    entries = expandEntries(state, m.end).filter(
      (e) => !e.cancelled && e.dueDate >= m.start && e.dueDate <= m.end,
    );
  useEffect(() => {
    if (day < m.start || day > m.end) setDay(m.start);
  }, [m.start, m.end]);
  const dateLabel = (date: string) =>
    new Intl.DateTimeFormat("fa-IR", {
      dateStyle: "medium",
      calendar: state.calendar,
      timeZone: "UTC",
    }).format(new Date(date + "T12:00:00Z"));
  if (mode === "calendar") {
    const days = calendarDays(m.start, m.end),
      padding = (new Date(m.start + "T12:00:00Z").getUTCDay() + 1) % 7;
    const events = entries.filter((e) => e.dueDate === day);
    const trades = state.goldTransactions.filter((t) => t.date === day);
    return (
      <div className="planner">
        <h2>تقویم مالی</h2>
        <div className="month-picker">
          <button
            aria-label="تقویم ماه قبل"
            onClick={() => setOffset(offset - 1)}
          >
            →
          </button>
          <strong>{m.label}</strong>
          <button
            aria-label="تقویم ماه بعد"
            onClick={() => setOffset(offset + 1)}
          >
            ←
          </button>
        </div>
        <section className="card">
          <div className="calendar-grid">
            {["ش", "ی", "د", "س", "چ", "پ", "ج"].map((name, i) => (
              <strong key={i}>{name}</strong>
            ))}
            {Array.from({ length: padding }, (_, i) => (
              <span key={"pad" + i} />
            ))}
            {days.map((date) => {
              const rows = entries.filter((e) => e.dueDate === date);
              const asset = state.goldTransactions.some((t) => t.date === date);
              return (
                <button
                  className={date === day ? "selected-day" : ""}
                  key={date}
                  aria-label={dateLabel(date)}
                  onClick={() => setDay(date)}
                >
                  <span>
                    {new Intl.DateTimeFormat(state.digits, {
                      day: "numeric",
                      calendar: state.calendar,
                      timeZone: "UTC",
                    }).format(new Date(date + "T12:00:00Z"))}
                  </span>
                  <div className="event-dots">
                    {rows.some((e) => e.kind === "income") && (
                      <i className="income-dot" />
                    )}
                    {rows.some((e) => e.kind === "expense") && (
                      <i className="expense-dot" />
                    )}
                    {rows.some((e) => e.kind === "installment") && (
                      <i className="debt-dot" />
                    )}
                    {asset && <i className="asset-dot" />}
                  </div>
                </button>
              );
            })}
          </div>
          <p>
            سبز: درآمد · بنفش: هزینه · نارنجی: قسط · آبی: خرید/فروش دارایی.
            نشانهٔ سررسید است، نه الزاماً تاریخ پرداخت واقعی.
          </p>
        </section>
        <section className="card">
          <h2>{dateLabel(day)}</h2>
          {!events.length && !trades.length && (
            <p>رویدادی در این روز ثبت نشده است.</p>
          )}
          {events.map((e) => (
            <p key={e.id}>
              {e.title} · {e.amount === null ? "مبلغ نامعلوم" : money(e.amount)}{" "}
              · مانده {money(remaining(e))}
            </p>
          ))}
          {trades.map((t) => (
            <p key={t.id}>
              {t.side === "buy" ? "خرید" : "فروش"}{" "}
              {state.goldAssets.find((a) => a.id === t.assetId)?.title} ·{" "}
              {t.quantity} واحد · {money(tradeValue(t).cash)}
            </p>
          ))}
        </section>
      </div>
    );
  }
  if (mode === "reports") {
    const selectedRows = state.entries.flatMap((e) =>
      e.payments
        .filter((p) => p.date >= from && p.date <= to)
        .map((p) => ({ ...p, kind: e.kind })),
    );
    const income = selectedRows
        .filter((p) => p.kind === "income")
        .reduce((s, p) => s + p.amount, 0),
      expense = selectedRows
        .filter((p) => p.kind === "expense")
        .reduce((s, p) => s + p.amount, 0),
      debt = selectedRows
        .filter((p) => p.kind === "installment")
        .reduce((s, p) => s + p.amount, 0);
    const buckets = budgetReport(state, from, to);
    return (
      <div className="planner">
        <h2>گزارش واقعی و بودجه</h2>
        <p>
          بازه بر مبنای تاریخ واقعی پرداخت/دریافت است. ارزش‌گذاری تاریخی دارایی
          با نرخ دستی فعلی جایگزین نمی‌شود؛ معاملات با قیمت ثبت‌شده گزارش
          می‌شوند.
        </p>
        <div className="filters">
          <label>
            از تاریخ (میلادی)
            <input
              type="date"
              value={from}
              max={to}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label>
            تا تاریخ (میلادی)
            <input
              type="date"
              value={to}
              min={from}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
        </div>
        <div className="bento">
          {[
            ["درآمد دریافت‌شده", income],
            ["هزینه پرداخت‌شده", expense],
            ["اقساط پرداخت‌شده", debt],
          ].map(([label, value]) => (
            <section className="card" key={String(label)}>
              <h2>{label}</h2>
              <div className="metric">{money(Number(value))}</div>
            </section>
          ))}
        </div>
        <section className="card">
          <h2>دسته‌ها در بازه</h2>
          <p>
            بودجه هر دسته، سقف یک ماه است؛ برای بازه‌های چندماهه سقف را در
            ماه‌های مربوط بررسی کن.
          </p>
          {buckets.map((c) => (
            <p key={c.id}>
              {c.name}: واقعی {money(c.actual)} · برنامه {money(c.planned)} ·
              سقف ماهانه {c.budget === null ? "نامعلوم" : money(c.budget)}
            </p>
          ))}
          <div className="actions">
            <button
              onClick={() =>
                downloadCsv(
                  reportRows(state, from, to),
                  `cheghad-${from}-${to}.csv`,
                )
              }
            >
              خروجی CSV واقعی
            </button>
            <button onClick={() => window.print()}>چاپ / PDF</button>
          </div>
        </section>
        <section className="card">
          <h2>مقایسه سه ماه اخیر</h2>
          {[-2, -1, 0].map((i) => {
            const month = calendarMonth(today(), i, state.calendar);
            const rows = state.entries.flatMap((e) =>
              e.payments
                .filter((p) => p.date >= month.start && p.date <= month.end)
                .map((p) => ({ ...p, kind: e.kind })),
            );
            return (
              <p key={i}>
                {month.label}: دریافت{" "}
                {money(
                  rows
                    .filter((p) => p.kind === "income")
                    .reduce((s, p) => s + p.amount, 0),
                )}{" "}
                · خروج{" "}
                {money(
                  rows
                    .filter((p) => p.kind !== "income")
                    .reduce((s, p) => s + p.amount, 0),
                )}
              </p>
            );
          })}
        </section>
      </div>
    );
  }
  let result;
  try {
    result = project(
      state,
      today(),
      horizon,
      state.scenarios.find((s) => s.id === selected),
    );
  } catch (err) {
    return (
      <p role="alert">
        {err instanceof Error ? err.message : "پیش‌بینی ممکن نیست"}
        <button onClick={() => setSelected("")}>پیش‌بینی پایه</button>
      </p>
    );
  }
  const values = result.points.map((p) => p.cash),
    min = Math.min(...values),
    max = Math.max(...values),
    path = result.points
      .map(
        (p, i) =>
          `${i === 0 ? "M" : "L"}${(i / Math.max(1, result.points.length - 1)) * 600},${170 - ((p.cash - min) / Math.max(1, max - min)) * 150}`,
      )
      .join(" ");
  return (
    <div className="planner">
      <h2>پیش‌بینی جریان نقد</h2>
      <p>
        درآمدهای مورد انتظار در موعد وصول و تعهدات در سررسید پرداخت فرض شده‌اند.
        موارد عقب‌افتاده در امروز لحاظ می‌شوند. رویدادهای هم‌روز با هم جمع
        می‌شوند؛ ترتیب ساعتی مشخص نیست. ارزش آینده دارایی بر مبنای نرخ فعلی یا
        فرض سناریو است.
      </p>
      <div className="filters">
        <label>
          افق پیش‌بینی
          <select
            value={horizon}
            onChange={(e) =>
              setHorizon(Number(e.target.value) as State["horizon"])
            }
          >
            {[3, 6, 12, 18, 24].map((n) => (
              <option key={n} value={n}>
                {n} ماه
              </option>
            ))}
          </select>
        </label>
        <label>
          سناریوی پیش‌بینی
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            <option value="">پایه بدون تصمیم جدید</option>
            {state.scenarios.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
        </label>
      </div>
      {result.warnings.map((w) => (
        <p className="warning" key={w}>
          {w}
        </p>
      ))}
      <section className="card">
        <h2>مانده روزانه · کمینه {money(result.minimum)}</h2>
        <svg
          className="cash-chart"
          viewBox="0 0 600 190"
          role="img"
          aria-label="روند مانده روزانه براساس پیش‌بینی"
        >
          <path d={path} fill="none" stroke="var(--accent)" strokeWidth="3" />
        </svg>
        <p>
          بازه {dateLabel(today())} تا {dateLabel(result.final.end)} · بالاترین{" "}
          {money(max)} · کمترین {money(min)}
        </p>
        <details>
          <summary>جدول روزانه</summary>
          <div className="daily-list">
            {result.points.map((p, i) => (
              <p key={i}>
                {dateLabel(p.date)} · {money(p.cash)}
              </p>
            ))}
          </div>
        </details>
      </section>
      <div className="table-scroll">
        <table>
          <caption>
            پیش‌بینی ماه‌های شمسی از امروز؛ تمام مبالغ براساس واحد نمایش
            انتخاب‌شده
          </caption>
          <thead>
            <tr>
              {[
                "ماه",
                "ابتدای بازه",
                "درآمد باقی‌مانده",
                "هزینه باقی‌مانده",
                "اقساط باقی‌مانده",
                "تسویه اولیه",
                "خرید دارایی",
                "نقد پایان",
                "بدهی",
                "طلا",
                "دلار",
                "خالص دارایی",
              ].map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.months.map((m) => (
              <tr key={m.start}>
                <th>{m.label}</th>
                {[
                  m.opening,
                  m.income,
                  m.expense,
                  m.installments,
                  m.earlyDebt,
                  m.investment,
                  m.cash,
                  m.debt,
                  m.gold,
                  m.usd,
                  m.netWorth,
                ].map((n, i) => (
                  <td className={n < 0 ? "negative" : ""} key={i}>
                    {money(n)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button
        onClick={() =>
          downloadCsv(
            [
              [
                "ماه",
                "موجودی ابتدا ریال",
                "درآمد ریال",
                "هزینه ریال",
                "اقساط ریال",
                "تسویه ریال",
                "خرید ریال",
                "نقد ریال",
                "بدهی ریال",
                "طلا ریال",
                "دلار ریال",
                "خالص ریال",
              ],
              ...result.months.map((m) => [
                m.label,
                m.opening,
                m.income,
                m.expense,
                m.installments,
                m.earlyDebt,
                m.investment,
                m.cash,
                m.debt,
                m.gold,
                m.usd,
                m.netWorth,
              ]),
            ],
            "cheghad-forecast.csv",
          )
        }
      >
        خروجی CSV پیش‌بینی
      </button>
    </div>
  );
}
