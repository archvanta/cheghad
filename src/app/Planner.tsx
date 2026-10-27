import { useState, type FormEvent } from "react";
import {
  categorySchema,
  ruleSchema,
  today,
  jalaliMonth,
  type State,
  type Rule,
} from "../domain/model";
import { parseMoney } from "../domain/engine";
import { budgetReport, reviseRule } from "../domain/recurring";
type Props = {
  state: State;
  commit: (s: State, action?: string) => Promise<boolean>;
  busy: boolean;
  money: (n: number) => string;
};
export default function Planner({ state, commit, busy, money }: Props) {
  const [error, setError] = useState(""),
    [offset, setOffset] = useState(0);
  const month = jalaliMonth(today(), offset),
    report = budgetReport(state, month.start, month.end);
  const amount = (f: FormData, key: string) =>
    String(f.get(key)).trim() ? parseMoney(String(f.get(key))) : null;
  async function submit(
    e: FormEvent<HTMLFormElement>,
    fn: (f: FormData) => Promise<boolean>,
  ) {
    e.preventDefault();
    const form = e.currentTarget;
    try {
      setError("");
      if (await fn(new FormData(form))) form.reset();
    } catch {
      setError(
        "عنوان، مبلغ و تاریخ‌ها را بررسی کنید؛ تغییر مبلغ نمی‌تواند گذشته را تغییر دهد.",
      );
    }
  }
  async function revise(rule: Rule, f: FormData) {
    const updated = ruleSchema.parse(
      reviseRule(rule, String(f.get("from")), amount(f, "amount"), today()),
    );
    return commit(
      {
        ...state,
        rules: state.rules.map((r) => (r.id === rule.id ? updated : r)),
      },
      "تغییر مبلغ آینده: " + rule.title,
    );
  }
  return (
    <div className="planner">
      <h2>درآمد، هزینه و بودجه‌های تکرارشونده</h2>
      <p>
        تکرار ماهانه بر مبنای ماه شمسی است؛ روزهای ناموجود به آخر ماه منتقل
        می‌شوند. رخدادهای پیش‌بینی‌شده وجه نقد نیستند؛ دریافت یا پرداختشان را در
        دفتر مالی ثبت کن.
      </p>
      {error && (
        <p role="alert" className="negative">
          {error}
        </p>
      )}
      <div className="settings-grid">
        <section className="card">
          <h2>قاعده جدید</h2>
          <form
            onSubmit={(e) =>
              submit(e, async (f) => {
                const now = new Date().toISOString();
                const rule = ruleSchema.parse({
                  id: crypto.randomUUID(),
                  title: f.get("title"),
                  kind: f.get("kind"),
                  categoryId: String(f.get("categoryId") || "") || undefined,
                  start: f.get("start"),
                  end: String(f.get("end") || "") || null,
                  frequency: f.get("frequency"),
                  createdAt: now,
                  updatedAt: now,
                  revisions: [
                    { from: f.get("start"), amount: amount(f, "amount") },
                  ],
                });
                return commit(
                  { ...state, rules: [...state.rules, rule] },
                  "افزودن قاعده: " + rule.title,
                );
              })
            }
          >
            <label>
              عنوان تکرار
              <input name="title" required maxLength={100} />
            </label>
            <label>
              نوع تکرار
              <select name="kind" aria-label="نوع تکرار">
                <option value="income">درآمد</option>
                <option value="expense">هزینه</option>
              </select>
            </label>
            <label>
              مبلغ تکرار (تومان؛ خالی = نامشخص)
              <input name="amount" inputMode="decimal" />
            </label>
            <label>
              دوره
              <select name="frequency" aria-label="دوره">
                <option value="monthly">ماهانه شمسی</option>
                <option value="weekly">هفتگی</option>
                <option value="daily">روزانه</option>
              </select>
            </label>
            <label>
              شروع تکرار (میلادی)
              <input
                name="start"
                type="date"
                required
                defaultValue={today()}
                min="1900-01-01"
                max="2198-01-01"
              />
            </label>
            <label>
              پایان تکرار (اختیاری، میلادی)
              <input name="end" type="date" min="1900-01-01" max="2200-01-01" />
            </label>
            <label>
              دسته تکرار
              <select name="categoryId">
                <option value="">بدون دسته</option>
                {state.categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <button className="primary" disabled={busy}>
              افزودن قاعده
            </button>
          </form>
        </section>
        <section className="card">
          <h2>دسته‌بندی جدید</h2>
          <form
            onSubmit={(e) =>
              submit(e, async (f) => {
                const c = categorySchema.parse({
                  id: crypto.randomUUID(),
                  name: f.get("name"),
                  budget: amount(f, "budget"),
                });
                return commit(
                  { ...state, categories: [...state.categories, c] },
                  "افزودن دسته: " + c.name,
                );
              })
            }
          >
            <label>
              نام دسته
              <input name="name" required maxLength={60} />
            </label>
            <label>
              بودجه ماهانه (تومان؛ خالی = بدون سقف)
              <input name="budget" inputMode="decimal" />
            </label>
            <button disabled={busy}>افزودن دسته</button>
          </form>
          <p>
            بودجه سقف مقایسه است و دوباره از وجه نقد کسر نمی‌شود. مقدار صفر یعنی
            سقف صفر، نه نامشخص.
          </p>
        </section>
      </div>
      <section className="card">
        <h2>قواعد ثبت‌شده</h2>
        {!state.rules.length && <p>قاعده‌ای ثبت نشده است.</p>}
        {state.rules.map((rule) => (
          <details key={rule.id}>
            <summary>
              {rule.title} · {rule.kind === "income" ? "درآمد" : "هزینه"} ·{" "}
              {rule.frequency === "monthly"
                ? "ماهانه"
                : rule.frequency === "daily"
                  ? "روزانه"
                  : "هفتگی"}
              {rule.end ? " · پایان " + rule.end : ""}
            </summary>
            <p>
              شروع: {rule.start} · نسخه‌های مبلغ:{" "}
              {rule.revisions
                .map(
                  (v) =>
                    `${v.from}: ${v.amount === null ? "نامشخص" : money(v.amount)}`,
                )
                .join(" / ")}
            </p>
            <form onSubmit={(e) => submit(e, (f) => revise(rule, f))}>
              <label>
                مبلغ جدید (تومان؛ خالی = نامشخص)
                <input name="amount" inputMode="decimal" />
              </label>
              <label>
                اعمال از تاریخ (میلادی)
                <input
                  name="from"
                  type="date"
                  required
                  min={today() > rule.start ? today() : rule.start}
                  defaultValue={today() > rule.start ? today() : rule.start}
                />
              </label>
              <p>
                نسخه‌های مبلغ از این تاریخ به بعد جایگزین می‌شوند؛ رخدادهای ثبت
                یا پرداخت‌شده مستقل باقی می‌مانند.
              </p>
              <button disabled={busy}>ذخیره مبلغ آینده</button>
            </form>
            <form
              onSubmit={(e) =>
                submit(e, async (f) => {
                  const end = String(f.get("end"));
                  if (end < today()) throw Error();
                  return commit(
                    {
                      ...state,
                      rules: state.rules.map((r) =>
                        r.id === rule.id
                          ? ruleSchema.parse({
                              ...r,
                              end,
                              updatedAt: new Date().toISOString(),
                            })
                          : r,
                      ),
                    },
                    "توقف تکرار: " + rule.title,
                  );
                })
              }
            >
              <label>
                آخرین روز تکرار (میلادی)
                <input
                  name="end"
                  type="date"
                  required
                  min={today() > rule.start ? today() : rule.start}
                  defaultValue={today() > rule.start ? today() : rule.start}
                />
              </label>
              <button disabled={busy}>تعیین پایان تکرار</button>
            </form>
          </details>
        ))}
      </section>
      <section className="card">
        <h2>بودجه و مصرف دسته‌ها</h2>
        <div className="month-picker">
          <button
            aria-label="بودجه ماه قبل"
            onClick={() => setOffset(offset - 1)}
          >
            →
          </button>
          <strong>{month.label}</strong>
          <button
            aria-label="بودجه ماه بعد"
            onClick={() => setOffset(offset + 1)}
          >
            ←
          </button>
        </div>
        {report.map((c, index) => (
          <details key={c.id}>
            <summary>
              {c.name} · پرداخت واقعی {money(c.actual)} / سقف{" "}
              {c.budget === null ? "تعیین‌نشده" : money(c.budget)} تومان
            </summary>
            <p>
              هزینه برنامه‌ریزی‌شده: {money(c.planned)} تومان{" "}
              {c.unknown ? " · نیازمند تکمیل" : ""}
            </p>
            {c.budget !== null && (
              <p className={c.actual > c.budget ? "negative" : "positive"}>
                {c.actual > c.budget ? "اضافه‌مصرف" : "مانده بودجه"}:{" "}
                {money(Math.abs(c.budget - c.actual))} تومان
              </p>
            )}
            <form
              onSubmit={(e) =>
                submit(e, async (f) =>
                  commit(
                    {
                      ...state,
                      categories: state.categories.map((x) =>
                        x.id === c.id
                          ? categorySchema.parse({
                              ...c,
                              name: f.get("name"),
                              budget: amount(f, "budget"),
                            })
                          : x,
                      ),
                    },
                    "ویرایش دسته و بودجه: " + c.name,
                  ),
                )
              }
            >
              <label>
                نام دسته
                <input
                  name="name"
                  defaultValue={c.name}
                  required
                  maxLength={60}
                />
              </label>
              <label>
                سقف بودجه (تومان)
                <input
                  name="budget"
                  inputMode="decimal"
                  defaultValue={c.budget === null ? "" : String(c.budget / 10)}
                />
              </label>
              <button disabled={busy}>ذخیره دسته</button>
            </form>
            <div className="actions">
              <button
                disabled={busy || index === 0}
                onClick={() => {
                  const categories = [...state.categories];
                  [categories[index - 1], categories[index]] = [
                    categories[index],
                    categories[index - 1],
                  ];
                  void commit({ ...state, categories }, "جابه‌جایی دسته");
                }}
              >
                انتقال بالاتر
              </button>
              <button
                disabled={busy}
                className="danger"
                onClick={() => {
                  if (
                    confirm(
                      "دسته حذف شود؟ رکوردهای مالی باقی می‌مانند و بدون دسته می‌شوند.",
                    )
                  )
                    void commit(
                      {
                        ...state,
                        categories: state.categories.filter(
                          (x) => x.id !== c.id,
                        ),
                        entries: state.entries.map((e) =>
                          e.categoryId === c.id
                            ? { ...e, categoryId: undefined }
                            : e,
                        ),
                        rules: state.rules.map((r) =>
                          r.categoryId === c.id
                            ? { ...r, categoryId: undefined }
                            : r,
                        ),
                      },
                      "حذف دسته: " + c.name,
                    );
                }}
              >
                حذف دسته
              </button>
            </div>
          </details>
        ))}
      </section>
    </div>
  );
}
