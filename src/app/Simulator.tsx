import { useState, type FormEvent } from "react";
import {
  scenarioSchema,
  today,
  type State,
  type Scenario,
} from "../domain/model";
import { project } from "../domain/forecast";
import { parseMoney } from "../domain/engine";
export default function Simulator({
  state,
  commit,
  busy,
  money,
}: {
  state: State;
  commit: (s: State, a?: string) => Promise<boolean>;
  busy: boolean;
  money: (n: number) => string;
}) {
  const [editing, setEditing] = useState<Scenario | null>(null),
    [error, setError] = useState(""),
    [horizon, setHorizon] = useState(state.horizon);
  const gold = state.goldAssets.filter((a) => a.kind !== "usd"),
    usd = state.goldAssets.filter((a) => a.kind === "usd");
  const results = state.scenarios.map((s) => {
    try {
      return {
        scenario: s,
        result: project(state, today(), horizon, s),
        error: "",
      };
    } catch (e) {
      return {
        scenario: s,
        result: null,
        error: e instanceof Error ? e.message : "فرض نامعتبر",
      };
    }
  });
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    try {
      const amount = (key: string) => parseMoney(String(f.get(key) || "0"));
      const now = new Date().toISOString();
      const plans = [];
      for (let i = 0; i < horizon; i++)
        for (const [key, id] of [
          ["gold", String(f.get("goldAssetId") || "")],
          ["usd", String(f.get("usdAssetId") || "")],
        ]) {
          const budget = amount(`${key}buy${i}`),
            price = String(f.get(`${key}price${i}`) || "").trim();
          if (budget || price) {
            if (!id) throw Error("برای برنامه ماهانه دارایی را انتخاب کن");
            plans.push({
              month: i,
              assetId: id,
              budget,
              price: price ? parseMoney(price) : null,
            });
          }
        }
      const s = scenarioSchema.parse({
        id: editing?.id ?? crypto.randomUUID(),
        title: f.get("title"),
        available: amount("available"),
        goldAmount: amount("goldAmount"),
        usdAmount: amount("usdAmount"),
        debtAmount: amount("debtAmount"),
        reserveAmount: amount("reserveAmount"),
        goldAssetId: String(f.get("goldAssetId") || "") || undefined,
        usdAssetId: String(f.get("usdAssetId") || "") || undefined,
        debtId: String(f.get("debtId") || "") || undefined,
        debtMode: f.get("debtMode"),
        goldChange: Number(f.get("goldChange")),
        usdChange: Number(f.get("usdChange")),
        feeBps: Number(f.get("fee")) * 100,
        plans,
        createdAt: editing?.createdAt ?? now,
        updatedAt: now,
      });
      project(state, today(), horizon, s);
      if (
        await commit(
          {
            ...state,
            scenarios: [...state.scenarios.filter((x) => x.id !== s.id), s],
          },
          "ذخیره سناریو: " + s.title,
        )
      ) {
        setEditing(null);
        form.reset();
        setError("");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "فرض‌ها معتبر نیستند");
    }
  }
  const input = (name: string, label: string, value: number = 0) => (
    <label>
      {label}
      <input
        name={name}
        required
        inputMode="decimal"
        defaultValue={value / 10}
      />
    </label>
  );
  return (
    <div className="planner">
      <h2>آزمایشگاه تصمیم مالی</h2>
      <p>
        تمام نتایج فرضی‌اند؛ درآمدهای مورد انتظار طبق تاریخ ثبت‌شده وصول و
        تعهدات در سررسید پرداخت فرض می‌شوند. خرید از نقد واقعی تأمین می‌شود؛
        مبلغ در دسترس به دارایی اضافه نمی‌شود. کسری پنهان نمی‌شود.
      </p>
      <label>
        افق مقایسه
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
      {error && (
        <p role="alert" className="negative">
          {error}
        </p>
      )}
      <section className="card">
        <h2>{editing ? "ویرایش سناریو" : "سناریوی جدید"}</h2>
        <form key={editing?.id ?? "new"} onSubmit={submit}>
          <label>
            نام سناریو
            <input name="title" required defaultValue={editing?.title} />
          </label>
          <div className="settings-grid">
            {input(
              "available",
              "بودجه تخصیص اولیه (تومان)",
              editing?.available,
            )}
            {input(
              "goldAmount",
              "خرید طلای اولیه (تومان)",
              editing?.goldAmount,
            )}
            {input("usdAmount", "خرید دلار اولیه (تومان)", editing?.usdAmount)}
            {input(
              "debtAmount",
              "پرداخت بدهی اولیه (تومان)",
              editing?.debtAmount,
            )}
            {input(
              "reserveAmount",
              "ذخیره نقدی سناریو (تومان)",
              editing?.reserveAmount,
            )}
            <label>
              دارایی طلای سناریو
              <select
                name="goldAssetId"
                defaultValue={editing?.goldAssetId ?? ""}
              >
                <option value="">انتخاب طلا</option>
                {gold.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              دارایی دلار سناریو
              <select
                name="usdAssetId"
                defaultValue={editing?.usdAssetId ?? ""}
              >
                <option value="">انتخاب دلار</option>
                {usd.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              قرارداد سناریو
              <select name="debtId" defaultValue={editing?.debtId ?? ""}>
                <option value="">انتخاب قرارداد</option>
                {state.debts.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              فرض پرداخت بدهی
              <select
                name="debtMode"
                defaultValue={editing?.debtMode ?? "face"}
              >
                <option value="face">
                  کاهش اسمی اقساط به ترتیب سررسید (فرضی)
                </option>
                <option value="quote">
                  مبلغ اعلام‌شده برای حذف همه اقساط (فرض تأیید اعتباردهنده)
                </option>
              </select>
            </label>
            <label>
              تغییر قیمت طلا در پایان افق (درصد، فرضی)
              <input
                name="goldChange"
                type="number"
                min={-90}
                max={300}
                step="0.01"
                defaultValue={editing?.goldChange ?? 0}
              />
            </label>
            <label>
              تغییر نرخ دلار در پایان افق (درصد، فرضی)
              <input
                name="usdChange"
                type="number"
                min={-90}
                max={300}
                step="0.01"
                defaultValue={editing?.usdChange ?? 0}
              />
            </label>
            <label>
              کارمزد خرید سناریو (درصد)
              <input
                name="fee"
                type="number"
                min={0}
                max={100}
                step="0.01"
                defaultValue={(editing?.feeBps ?? 0) / 100}
              />
            </label>
          </div>
          <details>
            <summary>خرید پلکانی و قیمت دلخواه هر ماه</summary>
            <p>
              مبالغ خرید در پایان ماه از نقد کسر می‌شوند، حتی اگر منفی شود. قیمت
              خالی از مسیر خطی درصد فرضی استفاده می‌کند؛ قیمت واردشده فقط همان
              ماه را جایگزین می‌کند.
            </p>
            {Array.from({ length: horizon }, (_, i) => (
              <fieldset key={i}>
                <legend>ماه {i + 1}</legend>
                {(["gold", "usd"] as const).map((key) => {
                  const id =
                    key === "gold" ? editing?.goldAssetId : editing?.usdAssetId;
                  const p = editing?.plans.find(
                    (p) => p.month === i && p.assetId === id,
                  );
                  return (
                    <div className="settings-grid" key={key}>
                      {input(
                        `${key}buy${i}`,
                        `بودجه خرید ${key === "gold" ? "طلا" : "دلار"} (تومان)`,
                        p?.budget,
                      )}
                      <label>
                        قیمت هر واحد {key === "gold" ? "طلا" : "دلار"} (تومان،
                        اختیاری)
                        <input
                          name={`${key}price${i}`}
                          inputMode="decimal"
                          defaultValue={
                            p?.price === null || p?.price === undefined
                              ? ""
                              : p.price / 10
                          }
                        />
                      </label>
                    </div>
                  );
                })}
              </fieldset>
            ))}
          </details>
          <button className="primary" disabled={busy}>
            ذخیره و محاسبه سناریو
          </button>
          {editing && (
            <button type="button" onClick={() => setEditing(null)}>
              انصراف سناریو
            </button>
          )}
        </form>
      </section>
      <div className="comparison">
        {results.map(({ scenario: s, result: r, error }) => (
          <section className="card" key={s.id}>
            <h2>{s.title}</h2>
            {r ? (
              <>
                <dl>
                  {[
                    ["نقد پایان", r.final.cash],
                    ["طلای پایان", r.final.gold],
                    ["دلار پایان", r.final.usd],
                    ["بدهی پایان", r.final.debt],
                    ["خالص دارایی", r.final.netWorth],
                    ["کمترین نقد روزانه", r.minimum],
                    ["ظرفیت پس از ذخیره", r.final.capacity],
                  ].map(([label, value]) => (
                    <div key={String(label)}>
                      <dt>{label}</dt>
                      <dd className={Number(value) < 0 ? "negative" : ""}>
                        {money(Number(value))}
                      </dd>
                    </div>
                  ))}
                </dl>
                {r.warnings.map((w) => (
                  <p className="warning" key={w}>
                    {w}
                  </p>
                ))}
                <p>
                  ارزش پایان، مرجع است و اختلاف فروش جداست؛ موجودی هر دارایی و
                  هزینه فروش را هنگام تصمیم بررسی کن.
                </p>
                <details>
                  <summary>جزئیات ماهانه و مقدار دارایی</summary>
                  {r.months.map((m) => (
                    <p key={m.start}>
                      {m.label}: نقد {money(m.cash)}، خرید {money(m.investment)}
                      ، خالص {money(m.netWorth)}
                    </p>
                  ))}
                  {r.holdings.map((a) => (
                    <p key={a.id}>
                      {a.title}: {a.quantity} · ارزش فروش{" "}
                      {a.liquidation === null
                        ? "نامعلوم"
                        : money(a.liquidation)}
                    </p>
                  ))}
                </details>
              </>
            ) : (
              <p role="alert">{error}</p>
            )}
            <div className="actions">
              <button onClick={() => setEditing(s)}>ویرایش سناریو</button>
              <button
                disabled={busy}
                onClick={() =>
                  commit(
                    {
                      ...state,
                      scenarios: [
                        ...state.scenarios,
                        {
                          ...s,
                          id: crypto.randomUUID(),
                          title: s.title + " (کپی)",
                          createdAt: new Date().toISOString(),
                          updatedAt: new Date().toISOString(),
                        },
                      ],
                    },
                    "کپی سناریو",
                  )
                }
              >
                کپی سناریو
              </button>
              <button
                disabled={busy}
                className="danger"
                onClick={() => {
                  if (confirm("سناریو حذف شود؟"))
                    void commit(
                      {
                        ...state,
                        scenarios: state.scenarios.filter((x) => x.id !== s.id),
                      },
                      "حذف سناریو",
                    );
                }}
              >
                حذف سناریو
              </button>
            </div>
          </section>
        ))}
      </div>
      {!results.length && (
        <p>
          برای مقایسه، سناریوهای نگهداری نقد، خرید طلا، دلار، پرداخت بدهی یا
          ترکیبی بساز. تعداد سناریوها به چهار محدود نیست.
        </p>
      )}
    </div>
  );
}
