import { useState } from "react";
import {
  profileSchema,
  parseAmount,
  normalizeNumber,
  money,
  type Ledger,
} from "./finance";
import { endpointUrl } from "./ai/protocol";
export default function SettingsPanel({
  ledger,
  endpoint,
  setEndpoint,
  commit,
  backup,
  importFile,
  purge,
  busy,
}: {
  ledger: Ledger;
  endpoint: string;
  setEndpoint: (s: string) => void;
  commit: (fn: (l: Ledger) => Ledger, action: string) => Promise<boolean>;
  backup: () => void;
  importFile: (f?: File) => Promise<void>;
  purge: () => Promise<void>;
  busy: boolean;
}) {
  const [error, setError] = useState("");
  const fields = [
    ["cash", "نقد افتتاحیه، قبل از همه پرداخت‌ها", ledger.profile.cash],
    ["reserve", "ذخیره نقدی هدف", ledger.profile.reserve],
    ["goldPrice", "قیمت دستی هر گرم طلا", ledger.profile.goldPrice],
    ["goldCost", "بهای تمام‌شده طلای اولیه", ledger.profile.goldCost],
    ["usdPrice", "نرخ دستی هر دلار", ledger.profile.usdPrice],
    ["usdCost", "بهای تمام‌شده دلار اولیه", ledger.profile.usdCost],
  ] as const;
  return (
    <div className="settings">
      <section className="panel">
        <h2>تنظیمات مالی</h2>
        {error && (
          <p role="alert" className="danger">
            {error}
          </p>
        )}
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            try {
              const values = Object.fromEntries(
                fields.map(([name]) => {
                  const s = String(f.get(name) || "").trim();
                  return [
                    name,
                    s
                      ? parseAmount(s)
                      : ["cash", "reserve"].includes(name)
                        ? 0
                        : null,
                  ];
                }),
              );
              const profile = profileSchema.parse({
                ...ledger.profile,
                ...values,
                goldGrams: Number(normalizeNumber(String(f.get("goldGrams")))),
                usdUnits: Number(normalizeNumber(String(f.get("usdUnits")))),
                goldFeePct: Number(
                  normalizeNumber(String(f.get("goldFeePct"))),
                ),
              });
              if (
                !/^\d+(\.\d{1,6})?$/.test(
                  normalizeNumber(String(f.get("goldGrams"))),
                ) ||
                !/^\d+(\.\d{1,6})?$/.test(
                  normalizeNumber(String(f.get("usdUnits"))),
                )
              )
                throw Error("مقدار دارایی حداکثر شش رقم اعشار دارد");
              await commit((l) => ({ ...l, profile }), "ویرایش تنظیمات مالی");
            } catch {
              setError(
                "مبالغ، مقدارها و درصد کارمزد را بررسی کن؛ قیمت نامعلوم را خالی بگذار.",
              );
            }
          }}
        >
          <div className="twocol">
            {fields.map(([name, label, value]) => (
              <label key={name}>
                {label} (تومان)
                <input
                  name={name}
                  inputMode="decimal"
                  defaultValue={value ?? ""}
                />
              </label>
            ))}
            <label>
              طلای اولیه پیش از افتتاح دفتر (گرم)
              <input
                name="goldGrams"
                inputMode="decimal"
                defaultValue={ledger.profile.goldGrams}
                required
              />
            </label>
            <label>
              دلار اولیه پیش از افتتاح دفتر
              <input
                name="usdUnits"
                inputMode="decimal"
                defaultValue={ledger.profile.usdUnits}
                required
              />
            </label>
            <label>
              کارمزد فرضی خرید طلا (درصد)
              <input
                name="goldFeePct"
                inputMode="decimal"
                defaultValue={ledger.profile.goldFeePct}
                required
              />
            </label>
          </div>
          <p className="muted">
            طلا و دلار اولیه دوباره از نقد کسر نمی‌شوند. خرید/فروش جدید را با
            معامله واقعی ثبت کن. نرخ‌ها دستی‌اند؛ خالی یعنی نامشخص.
          </p>
          <button className="button primary" disabled={busy}>
            ذخیره تنظیمات مالی
          </button>
        </form>
      </section>
      <section className="panel">
        <h2>اتصال اختیاری هوش مصنوعی</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            try {
              const f = new FormData(e.currentTarget),
                value = String(f.get("endpoint")).trim();
              setEndpoint(value ? endpointUrl(value) : "");
              setError("");
            } catch {
              setError(
                "نشانی HTTPS بک‌اند لازم است؛ رمز، کلید و پارامتر توکن در URL مجاز نیست.",
              );
            }
          }}
        >
          <label>
            نشانی پایه بک‌اند امن Gemini
            <input
              name="endpoint"
              type="url"
              defaultValue={endpoint}
              placeholder="https://api.example.com/api/ai"
            />
          </label>
          <p className="muted">
            کلید Gemini فقط Secret سرور است؛ اینجا جای کلید یا توکن نیست. ورود
            از کوکی امن Cloudflare Access انجام می‌شود. بدون پیکربندی احراز
            هویت، سرور درخواست را رد می‌کند.
          </p>
          <button className="button">ذخیره نشانی بک‌اند</button>
        </form>
      </section>
      <section className="panel">
        <h2>بودجه دسته‌ها</h2>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget,
              f = new FormData(form);
            try {
              const name = String(f.get("name")).trim();
              if (!name || ledger.budgets.some((b) => b.name === name))
                throw Error();
              const s = String(f.get("limit")).trim();
              if (
                await commit(
                  (l) => ({
                    ...l,
                    budgets: [
                      ...l.budgets,
                      {
                        id: crypto.randomUUID(),
                        name,
                        limit: s ? parseAmount(s) : null,
                      },
                    ],
                  }),
                  "افزودن بودجه",
                )
              )
                form.reset();
            } catch {
              setError("نام دسته یکتا و مبلغ معتبر لازم است");
            }
          }}
        >
          <label>
            نام دسته بودجه
            <input name="name" required maxLength={80} />
          </label>
          <label>
            سقف ماهانه بودجه (تومان؛ خالی = نامعلوم)
            <input name="limit" inputMode="decimal" />
          </label>
          <button className="button" disabled={busy}>
            افزودن بودجه
          </button>
        </form>
        {ledger.budgets.map((b) => (
          <div className="budget-row" key={b.id}>
            <span>
              {b.name} · {b.limit === null ? "نامشخص" : money(b.limit)}
            </span>
            <button
              className="mini danger"
              disabled={busy}
              onClick={() => {
                if (confirm("بودجه دسته حذف شود؟ رکوردهای هزینه حذف نمی‌شوند."))
                  void commit(
                    (l) => ({
                      ...l,
                      budgets: l.budgets.filter((x) => x.id !== b.id),
                    }),
                    "حذف بودجه",
                  );
              }}
            >
              حذف بودجه
            </button>
            <button
              className="mini"
              disabled={busy}
              onClick={() => {
                const answer = prompt(
                  "سقف جدید بودجه به تومان؛ خالی برای نامعلوم",
                  String(b.limit ?? ""),
                );
                if (answer === null) return;
                try {
                  const value = answer.trim() ? parseAmount(answer) : null;
                  void commit(
                    (l) => ({
                      ...l,
                      budgets: l.budgets.map((x) =>
                        x.id === b.id ? { ...x, limit: value } : x,
                      ),
                    }),
                    "ویرایش بودجه",
                  );
                } catch {
                  setError("سقف معتبر نیست");
                }
              }}
            >
              ویرایش سقف
            </button>
          </div>
        ))}
      </section>
      <section className="panel">
        <h2>مالکیت و پشتیبان داده</h2>
        <p>
          داده‌ها در IndexedDB همین مرورگر می‌مانند. ارسال به Gemini فقط با
          رضایت جداگانه در پنل AI است. حذف داده مرورگر باعث از دست رفتن اطلاعات
          می‌شود؛ پشتیبان خصوصی بگیر.
        </p>
        <div className="actions">
          <button className="button" onClick={backup}>
            خروجی JSON خصوصی
          </button>
          <label className="button">
            بازیابی JSON
            <input
              type="file"
              accept="application/json,.json"
              onChange={(e) => {
                void importFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
          <button
            className="button danger"
            disabled={busy}
            onClick={() => {
              if (confirm("همه داده‌های محلی و Undo حذف شوند؟")) void purge();
            }}
          >
            حذف همه اطلاعات
          </button>
        </div>
        <details>
          <summary>تاریخچه تغییرات</summary>
          {ledger.history.map((h, i) => (
            <p key={i}>
              {new Date(h.date).toLocaleString("fa-IR")} · {h.action}
            </p>
          ))}
        </details>
      </section>
    </div>
  );
}
