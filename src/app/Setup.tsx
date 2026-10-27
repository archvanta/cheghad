import { useState, type FormEvent } from "react";
import {
  entrySchema,
  ruleSchema,
  goldAssetSchema,
  goldTransactionSchema,
  today,
  type State,
} from "../domain/model";
import { parseMoney, summary } from "../domain/engine";
import { quantityInput } from "../domain/gold";
import { readBackup } from "../database/store";
import DateField from "./DateField";
export default function Setup({
  state,
  commit,
  busy,
}: {
  state: State;
  commit: (s: State, a?: string) => Promise<boolean>;
  busy: boolean;
}) {
  const [step, setStep] = useState(state.setupStep),
    [error, setError] = useState("");
  const titles = [
    "ترجیحات و بازیابی",
    "درآمدها",
    "هزینه‌های ماهانه",
    "اقساط",
    "نقد و دارایی اولیه",
    "مرور و شروع",
  ];
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget,
      f = new FormData(form),
      now = new Date().toISOString();
    try {
      setError("");
      let next = { ...state };
      const value = (key: string) =>
        String(f.get(key) || "").trim() ? parseMoney(String(f.get(key))) : null;
      if (step === 0)
        next = {
          ...next,
          theme: f.get("theme") as State["theme"],
          calendar: f.get("calendar") as State["calendar"],
          displayUnit: f.get("unit") as State["displayUnit"],
        };
      if (step === 1 || step === 2) {
        const start = String(f.get("start"));
        const rule = ruleSchema.parse({
          id: crypto.randomUUID(),
          title: f.get("title"),
          kind: step === 1 ? "income" : "expense",
          source: step === 1 ? "حقوق" : "",
          certainty: "expected",
          start,
          end: null,
          frequency: "monthly",
          createdAt: now,
          updatedAt: now,
          revisions: [{ from: start, amount: value("amount") }],
        });
        next.rules = [...next.rules, rule];
      }
      if (step === 3) {
        const entry = entrySchema.parse({
          id: crypto.randomUUID(),
          title: f.get("title"),
          kind: "installment",
          amount: value("amount"),
          dueDate: f.get("due"),
          confirmed: f.get("confirmed") === "on",
          createdAt: now,
          updatedAt: now,
          payments: [],
        });
        next.entries = [...next.entries, entry];
      }
      if (step === 4) {
        next.openingBalance = value("cash") ?? 0;
        next.reserve = value("reserve") ?? 0;
        const q = String(f.get("quantity") || "").trim();
        if (q) {
          const kind = String(f.get("assetKind"));
          const asset = goldAssetSchema.parse({
            id: crypto.randomUUID(),
            title: kind === "usd" ? "دلار اولیه" : "طلای اولیه",
            kind,
            unit: kind === "usd" ? "usd" : "gram",
            price: value("price"),
            priceDate: today(),
            spreadBps: 0,
            createdAt: now,
            updatedAt: now,
          });
          const trade = goldTransactionSchema.parse({
            id: crypto.randomUUID(),
            assetId: asset.id,
            side: "buy",
            quantity: quantityInput(q),
            price: value("basis"),
            commission: 0,
            workmanship: 0,
            tax: 0,
            other: 0,
            date: today(),
            opening: true,
            notes: "موجودی قبل از افتتاح دفتر",
            createdAt: now,
            updatedAt: now,
          });
          next.goldAssets = [...next.goldAssets, asset];
          next.goldTransactions = [...next.goldTransactions, trade];
        }
      }
      if (step === 5) next.onboarded = true;
      next.setupStep = Math.min(5, step + 1);
      if (await commit(next, "راه‌اندازی خصوصی: " + titles[step])) {
        if (step < 5) setStep(step + 1);
        form.reset();
      }
    } catch {
      setError(
        "اطلاعات معتبر وارد کن؛ مبلغ نامعلوم را خالی بگذار و برای دارایی اولیه، بهای هر واحد را مشخص کن.",
      );
    }
  }
  return (
    <section className="card setup" aria-label="راه‌اندازی خصوصی">
      <h2>شروع شخصی، بدون دادهٔ از پیش ذخیره‌شده</h2>
      <p>
        مرحله {step + 1} از ۶ · {titles[step]}. اطلاعات فقط در مرورگر همین
        دستگاه می‌مانند و بعداً از بخش‌های مربوط قابل ویرایش‌اند.
      </p>
      {error && (
        <p className="negative" role="alert">
          {error}
        </p>
      )}
      <form key={step} onSubmit={submit}>
        {step === 0 && (
          <>
            <div className="settings-grid">
              <label>
                تم راه‌اندازی
                <select name="theme" defaultValue={state.theme}>
                  <option value="dark">تیره</option>
                  <option value="light">روشن</option>
                </select>
              </label>
              <label>
                تقویم راه‌اندازی
                <select name="calendar" defaultValue={state.calendar}>
                  <option value="persian">شمسی</option>
                  <option value="gregory">میلادی</option>
                </select>
              </label>
              <label>
                واحد نمایش راه‌اندازی
                <select name="unit" defaultValue={state.displayUnit}>
                  <option value="toman">تومان</option>
                  <option value="rial">ریال</option>
                </select>
              </label>
            </div>
            <label>
              بازیابی پشتیبان خصوصی
              <input
                type="file"
                accept=".json,application/json"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file) return;
                  try {
                    if (file.size > 5000000) throw Error();
                    const data = readBackup(await file.text());
                    if (confirm("داده‌های فعلی با پشتیبان جایگزین شوند؟"))
                      await commit(
                        { ...data, onboarded: true },
                        "بازیابی در راه‌اندازی",
                      );
                  } catch {
                    setError("فایل معتبر نیست؛ اطلاعات فعلی حفظ شد.");
                  }
                }}
              />
            </label>
          </>
        )}
        {(step === 1 || step === 2) && (
          <>
            <label>
              {step === 1 ? "عنوان درآمد راه‌اندازی" : "عنوان هزینه راه‌اندازی"}
              <input name="title" required maxLength={100} />
            </label>
            <label>
              مبلغ ماهانه راه‌اندازی (تومان؛ خالی = نامشخص)
              <input name="amount" inputMode="decimal" />
            </label>
            <DateField
              name="start"
              label={step === 1 ? "اولین موعد حقوق" : "اولین موعد هزینه"}
              calendar={state.calendar}
            />
            <p>
              ماهانه شمسی تکرار می‌شود؛ درآمد پیش‌بینی‌شده است و دریافت واقعی را
              باید در دفتر ثبت کنی. هر تعداد درآمد یا هزینه دیگر را بعداً در
              برنامه و بودجه اضافه کن.
            </p>
          </>
        )}
        {step === 3 && (
          <>
            <label>
              عنوان قسط راه‌اندازی
              <input name="title" required />
            </label>
            <label>
              مبلغ قسط راه‌اندازی (تومان؛ خالی = نامعلوم)
              <input name="amount" inputMode="decimal" />
            </label>
            <DateField
              name="due"
              label="سررسید اولیه"
              calendar={state.calendar}
            />
            <label className="checkbox">
              <input name="confirmed" type="checkbox" />
              اطلاعات قسط تأیید شده است
            </label>
            <p>
              قرارداد، مجوز پرداخت جزئی و اقساط دیگر را در بخش بدهی‌ها تنظیم کن.
            </p>
          </>
        )}
        {step === 4 && (
          <>
            <label>
              نقد افتتاحیه راه‌اندازی (تومان)
              <input
                name="cash"
                required
                inputMode="decimal"
                defaultValue={state.openingBalance / 10}
              />
            </label>
            <label>
              ذخیره هدف راه‌اندازی (تومان)
              <input
                name="reserve"
                required
                inputMode="decimal"
                defaultValue={state.reserve / 10}
              />
            </label>
            <p>
              این نقد متعلق به قبل از همه پرداخت‌های ثبت‌شده است. دارایی اولیه،
              دوباره از آن کم نمی‌شود.
            </p>
            <details>
              <summary>ثبت اختیاری دارایی اولیه طلا یا دلار</summary>
              <label>
                نوع دارایی اولیه
                <select name="assetKind">
                  <option value="18k">طلای ۱۸ عیار</option>
                  <option value="24k">طلای ۲۴ عیار</option>
                  <option value="usd">دلار آمریکا</option>
                </select>
              </label>
              <label>
                مقدار دارایی اولیه
                <input name="quantity" inputMode="decimal" />
              </label>
              <label>
                بهای هر واحد اولیه (تومان)
                <input name="basis" inputMode="decimal" />
              </label>
              <label>
                قیمت دستی امروز هر واحد (تومان)
                <input name="price" inputMode="decimal" />
              </label>
            </details>
          </>
        )}
        {step === 5 && (
          <p>
            اطلاعات ثبت شد؛ داشبورد زیر پیش‌بینی اولیه را نشان می‌دهد. همهٔ
            اعداد از دفتر مالی، برنامه و بودجه و بخش طلا و دلار قابل اصلاح‌اند.
            برای جلوگیری از حذف ناخواسته داده‌ها، از تنظیمات پشتیبان JSON بگیر.
          </p>
        )}
        <div className="actions">
          <button className="primary" disabled={busy}>
            {step === 5 ? "پایان راه‌اندازی" : "ذخیره و ادامه"}
          </button>
          {step > 0 && step < 5 && (
            <button
              type="button"
              onClick={async () => {
                if (
                  await commit(
                    { ...state, setupStep: step + 1 },
                    "رد مرحله اختیاری راه‌اندازی",
                  )
                )
                  setStep(step + 1);
              }}
            >
              رد کردن این مرحله
            </button>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              commit({ ...state, onboarded: true }, "ادامه بدون راهنما")
            }
          >
            ادامه بدون راهنما
          </button>
        </div>
      </form>
    </section>
  );
}
