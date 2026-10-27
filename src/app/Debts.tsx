import DateField from "./DateField";
import { useState, type FormEvent } from "react";
import {
  debtSchema,
  entrySchema,
  today,
  type State,
  type Debt,
} from "../domain/model";
import { parseMoney, remaining } from "../domain/engine";
import { importInstallments, settleDebt } from "../domain/debts";
export default function Debts({
  state,
  commit,
  busy,
  money,
  unit = "تومان",
}: {
  state: State;
  commit: (s: State, a?: string) => Promise<boolean>;
  busy: boolean;
  money: (n: number) => string;
  unit?: string;
}) {
  const [editing, setEditing] = useState<Debt | null>(null),
    [error, setError] = useState(""),
    [quote, setQuote] = useState<{
      id: string;
      cash: number;
      remaining: number;
    } | null>(null);
  async function submit(
    e: FormEvent<HTMLFormElement>,
    fn: (f: FormData) => Promise<boolean>,
  ) {
    e.preventDefault();
    const form = e.currentTarget;
    try {
      setError("");
      if (await fn(new FormData(form))) form.reset();
    } catch (e) {
      setError(e instanceof Error ? e.message : "اطلاعات معتبر نیست");
    }
  }
  const optionalMoney = (v: FormDataEntryValue | null) =>
    String(v || "").trim() ? parseMoney(String(v)) : null;
  return (
    <div className="planner">
      <h2>قراردادها و اقساط</h2>
      <p>
        ثبت قرارداد به موجودی نقد اضافه نمی‌کند. مجوزهای نامشخص، مجوز تسویه
        نیستند. این بخش اتصال خودکار به حساب اعتباردهنده ندارد.
      </p>
      {error && (
        <p role="alert" className="negative">
          {error}
        </p>
      )}
      <div className="settings-grid">
        <section className="card">
          <h2>{editing ? "ویرایش قرارداد" : "قرارداد جدید"}</h2>
          <form
            key={editing?.id ?? "new"}
            onSubmit={(e) =>
              submit(e, async (f) => {
                const now = new Date().toISOString();
                const debt = debtSchema.parse({
                  id: editing?.id ?? crypto.randomUUID(),
                  title: f.get("title"),
                  provider: f.get("provider"),
                  reference: f.get("reference"),
                  principal: optionalMoney(f.get("principal")),
                  allowEarly: f.get("early"),
                  allowPartial: f.get("partial"),
                  notes: f.get("notes"),
                  createdAt: editing?.createdAt ?? now,
                  updatedAt: now,
                });
                const ok = await commit(
                  {
                    ...state,
                    debts: [
                      ...state.debts.filter((d) => d.id !== debt.id),
                      debt,
                    ],
                  },
                  "ذخیره قرارداد: " + debt.title,
                );
                if (ok) setEditing(null);
                return ok;
              })
            }
          >
            <label>
              عنوان قرارداد
              <input
                name="title"
                required
                maxLength={100}
                defaultValue={editing?.title}
              />
            </label>
            <label>
              اعتباردهنده
              <input
                name="provider"
                maxLength={100}
                defaultValue={editing?.provider}
              />
            </label>
            <label>
              شناسه قرارداد
              <input
                name="reference"
                maxLength={100}
                defaultValue={editing?.reference}
              />
            </label>
            <label>
              اصل بدهی (تومان؛ اختیاری)
              <input
                name="principal"
                inputMode="decimal"
                defaultValue={
                  !editing || editing.principal === null
                    ? ""
                    : String(editing.principal / 10)
                }
              />
            </label>
            {[
              ["early", "پرداخت زودهنگام", editing?.allowEarly],
              ["partial", "پرداخت جزئی", editing?.allowPartial],
            ].map(([name, label, value]) => (
              <label key={name}>
                {label}
                <select name={name} defaultValue={value ?? "unknown"}>
                  <option value="unknown">نامشخص</option>
                  <option value="yes">مجاز</option>
                  <option value="no">غیرمجاز</option>
                </select>
              </label>
            ))}
            <label>
              شرایط و توضیحات
              <textarea
                name="notes"
                maxLength={2000}
                defaultValue={editing?.notes}
              />
            </label>
            <button disabled={busy} className="primary">
              ذخیره قرارداد
            </button>
            {editing && (
              <button type="button" onClick={() => setEditing(null)}>
                انصراف از ویرایش
              </button>
            )}
          </form>
        </section>
        <section className="card">
          <h2>قسط جدید</h2>
          <form
            onSubmit={(e) =>
              submit(e, async (f) => {
                const now = new Date().toISOString();
                const entry = entrySchema.parse({
                  id: crypto.randomUUID(),
                  kind: "installment",
                  debtId: f.get("debtId"),
                  title: f.get("title"),
                  amount: optionalMoney(f.get("amount")),
                  dueDate: f.get("due"),
                  confirmed: f.get("confirmed") === "on",
                  createdAt: now,
                  updatedAt: now,
                  payments: [],
                });
                return commit(
                  { ...state, entries: [...state.entries, entry] },
                  "افزودن قسط: " + entry.title,
                );
              })
            }
          >
            <label>
              قرارداد قسط
              <select name="debtId" required>
                <option value="">انتخاب قرارداد</option>
                {state.debts.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              عنوان قسط
              <input name="title" required />
            </label>
            <label>
              مبلغ قسط (تومان؛ خالی = نامشخص)
              <input name="amount" inputMode="decimal" />
            </label>
            <DateField
              name="due"
              label="سررسید قسط"
              calendar={state.calendar}
            />
            <label className="checkbox">
              <input name="confirmed" type="checkbox" />
              مبلغ و تاریخ تأیید شده‌اند
            </label>
            <button disabled={busy}>افزودن قسط</button>
          </form>
          <p>
            پرداخت، تغییر سررسید و انتقال ماه با ویرایش تاریخ در دفتر مالی انجام
            می‌شود.
          </p>
        </section>
      </div>
      {state.debts.map((debt) => {
        const entries = state.entries.filter((e) => e.debtId === debt.id);
        const balance = entries.reduce((s, e) => s + remaining(e), 0);
        return (
          <section className="card" key={debt.id}>
            <h2>
              {debt.title} · {debt.provider}
            </h2>
            <p>
              تعداد اقساط: {entries.length} · باقی‌مانده:{" "}
              {entries.filter((e) => remaining(e) > 0).length} · مانده{" "}
              {money(balance)} {unit}
            </p>
            <p>{debt.notes}</p>
            <div className="actions">
              <button onClick={() => setEditing(debt)}>ویرایش قرارداد</button>
              <button
                disabled={busy}
                onClick={() => {
                  if (entries.length) {
                    setError(
                      "ابتدا اقساط قرارداد را حذف یا به قرارداد دیگری منتقل کن.",
                    );
                    return;
                  }
                  if (confirm("قرارداد حذف شود؟"))
                    void commit(
                      {
                        ...state,
                        debts: state.debts.filter((d) => d.id !== debt.id),
                      },
                      "حذف قرارداد",
                    );
                }}
              >
                حذف قرارداد
              </button>
            </div>
            <label className="upload">
              ورود اقساط CSV یا JSON
              <input
                type="file"
                accept=".csv,.json"
                disabled={busy}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file) return;
                  try {
                    if (file.size > 1000000)
                      throw Error("فایل بیش از حد بزرگ است");
                    const imported = importInstallments(
                      await file.text(),
                      debt.id,
                    );
                    const keys = new Set(
                      state.entries.map(
                        (x) =>
                          `${x.debtId}|${x.title}|${x.amount}|${x.dueDate}`,
                      ),
                    );
                    for (const x of imported) {
                      const key = `${x.debtId}|${x.title}|${x.amount}|${x.dueDate}`;
                      if (keys.has(key))
                        throw Error("قسط تکراری در فایل یا دفتر وجود دارد");
                      keys.add(key);
                    }
                    if (
                      confirm(`${imported.length} قسط نیازمند تأیید وارد شود؟`)
                    )
                      await commit(
                        { ...state, entries: [...state.entries, ...imported] },
                        "ورود اقساط",
                      );
                  } catch (err) {
                    setError(
                      err instanceof Error ? err.message : "فایل نامعتبر",
                    );
                  }
                }}
              />
            </label>
            <p>
              CSV: سرستون دقیق <bdi>title,amountRial,dueDate</bdi>. مبلغ ریال
              صحیح و تاریخ ISO؛ متن حاوی ویرگول در CSV این قالب مجاز نیست. JSON
              آرایه‌ای از همین عنوان، amount و dueDate است.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                try {
                  const f = new FormData(e.currentTarget);
                  setQuote({
                    id: debt.id,
                    cash: parseMoney(String(f.get("cash"))),
                    remaining: balance,
                  });
                } catch {
                  setError("مبلغ معتبر وارد کنید");
                }
              }}
            >
              <label>
                مبلغ تسویه اعلام‌شده با احتساب تخفیف، کارمزد و جریمه (تومان)
                <input name="cash" inputMode="decimal" required />
              </label>
              <button disabled={busy}>محاسبه تسویه همه اقساط باقی‌مانده</button>
            </form>
            {quote?.id === debt.id && (
              <div className="warning">
                <p>
                  فرض: همه اقساط پرداخت‌نشده حذف می‌شوند. خروج نقد{" "}
                  {money(quote.cash)}؛ کاهش بدهی {money(quote.remaining)}؛ اثر
                  بر خالص دارایی {money(quote.remaining - quote.cash)} {unit}.
                  این عدد صرفه‌جویی ماهانه جدید نیست.
                </p>
                {debt.allowEarly !== "yes" ? (
                  <p>
                    فقط شبیه‌سازی؛ اجازه تسویه معلوم یا مجاز نیست. داده واقعی
                    تغییر نکرده است.
                  </p>
                ) : (
                  <button
                    disabled={busy}
                    onClick={async () => {
                      if (
                        !confirm(
                          "اعتباردهنده این مبلغ و حذف همه اقساط باقی‌مانده را تأیید کرده و وجه واقعاً پرداخت شده است؟",
                        )
                      )
                        return;
                      try {
                        if (
                          await commit(
                            settleDebt(state, debt.id, quote.cash, today()),
                            "تسویه قرارداد: " + debt.title,
                          )
                        )
                          setQuote(null);
                      } catch (err) {
                        setError(
                          err instanceof Error
                            ? err.message
                            : "تسویه انجام نشد",
                        );
                      }
                    }}
                  >
                    ثبت تسویه واقعی تأییدشده
                  </button>
                )}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
