import { useState, type FormEvent } from "react";
import {
  goldAssetSchema,
  goldTransactionSchema,
  today,
  type State,
  type GoldAsset,
  type GoldTransaction,
} from "../domain/model";
import { goldPortfolio, tradeValue, quantityInput } from "../domain/gold";
import { parseMoney } from "../domain/engine";
const names = {
  "18k": "طلای ۱۸ عیار",
  "24k": "طلای ۲۴ عیار",
  melted: "آب‌شده",
  digital: "دیجیتال",
  coin: "سکه",
};
export default function Gold({
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
  const [asset, setAsset] = useState<GoldAsset | null>(null),
    [trade, setTrade] = useState<GoldTransaction | null>(null),
    [error, setError] = useState("");
  const portfolio = goldPortfolio(state, today());
  async function submit(
    e: FormEvent<HTMLFormElement>,
    fn: (f: FormData) => Promise<boolean>,
  ) {
    e.preventDefault();
    const form = e.currentTarget;
    setError("");
    try {
      if (await fn(new FormData(form))) form.reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : "اطلاعات نامعتبر است");
    }
  }
  return (
    <div className="planner">
      <h2>دارایی طلا</h2>
      <p>
        قیمت‌ها دستی‌اند و قیمت زنده نیستند. وزن تا شش رقم اعشار ذخیره می‌شود؛
        ارزش هر معامله با روش نیم‌به‌بالا به ریال گرد می‌شود. بهای فروش از
        میانگین موزون محاسبه می‌شود.
      </p>
      {error && (
        <p className="negative" role="alert">
          {error}
        </p>
      )}
      <div className="settings-grid">
        <section className="card">
          <h2>{asset ? "ویرایش دارایی و قیمت" : "دارایی جدید"}</h2>
          <form
            key={asset?.id ?? "new"}
            onSubmit={(e) =>
              submit(e, async (f) => {
                const now = new Date().toISOString();
                const kind = String(f.get("kind"));
                const a = goldAssetSchema.parse({
                  id: asset?.id ?? crypto.randomUUID(),
                  title: f.get("title"),
                  kind,
                  unit: kind === "coin" ? "coin" : "gram",
                  price: String(f.get("price")).trim()
                    ? parseMoney(String(f.get("price")))
                    : null,
                  priceDate: String(f.get("price")).trim()
                    ? f.get("priceDate")
                    : null,
                  spreadBps:
                    Number(quantityInput(String(f.get("spread")))) * 100,
                  createdAt: asset?.createdAt ?? now,
                  updatedAt: now,
                });
                if (
                  asset &&
                  state.goldTransactions.some((t) => t.assetId === asset.id) &&
                  asset.kind !== a.kind
                )
                  throw Error(
                    "نوع دارایی دارای معامله را تغییر نده؛ دارایی جدید بساز",
                  );
                const ok = await commit(
                  {
                    ...state,
                    goldAssets: [
                      ...state.goldAssets.filter((x) => x.id !== a.id),
                      a,
                    ],
                  },
                  "ذخیره دارایی و قیمت طلا: " + a.title,
                );
                if (ok) setAsset(null);
                return ok;
              })
            }
          >
            <label>
              عنوان دارایی
              <input name="title" required defaultValue={asset?.title} />
            </label>
            <label>
              نوع طلا
              <select name="kind" defaultValue={asset?.kind ?? "18k"}>
                {Object.entries(names).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label>
              قیمت دستی هر گرم / سکه (تومان؛ خالی = نامعلوم)
              <input
                name="price"
                inputMode="decimal"
                defaultValue={
                  asset?.price === null ? "" : String((asset?.price ?? 0) / 10)
                }
              />
            </label>
            <label>
              تاریخ قیمت
              <input
                name="priceDate"
                type="date"
                max={today()}
                required
                defaultValue={asset?.priceDate ?? today()}
              />
            </label>
            <label>
              اختلاف فروش با قیمت مرجع (درصد)
              <input
                name="spread"
                inputMode="decimal"
                defaultValue={(asset?.spreadBps ?? 0) / 100}
                required
              />
            </label>
            <button disabled={busy} className="primary">
              ذخیره دارایی
            </button>
            {asset && (
              <button type="button" onClick={() => setAsset(null)}>
                انصراف دارایی
              </button>
            )}
          </form>
        </section>
        <section className="card">
          <h2>{trade ? "ویرایش معامله" : "ثبت خرید یا فروش"}</h2>
          <form
            key={trade?.id ?? "new"}
            onSubmit={(e) =>
              submit(e, async (f) => {
                const now = new Date().toISOString();
                const t = goldTransactionSchema.parse({
                  id: trade?.id ?? crypto.randomUUID(),
                  assetId: f.get("assetId"),
                  side: f.get("side"),
                  quantity: quantityInput(String(f.get("quantity"))),
                  price: parseMoney(String(f.get("price"))),
                  commission: parseMoney(String(f.get("commission")) || "0"),
                  workmanship: parseMoney(String(f.get("workmanship")) || "0"),
                  tax: parseMoney(String(f.get("tax")) || "0"),
                  other: parseMoney(String(f.get("other")) || "0"),
                  date: f.get("date"),
                  opening: f.get("opening") === "on",
                  notes: f.get("notes"),
                  createdAt: trade?.createdAt ?? now,
                  updatedAt: now,
                });
                if (t.date > today())
                  throw Error("معامله واقعی نمی‌تواند در آینده باشد");
                const next = {
                  ...state,
                  goldTransactions: [
                    ...state.goldTransactions.filter((x) => x.id !== t.id),
                    t,
                  ],
                };
                goldPortfolio(next);
                const ok = await commit(next, "ثبت معامله طلا");
                if (ok) setTrade(null);
                return ok;
              })
            }
          >
            <label>
              دارایی معامله
              <select
                name="assetId"
                required
                defaultValue={trade?.assetId ?? ""}
              >
                <option value="">انتخاب دارایی</option>
                {state.goldAssets.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.title} · {a.unit === "gram" ? "گرم" : "سکه"}
                  </option>
                ))}
              </select>
            </label>
            <label>
              جهت معامله
              <select name="side" defaultValue={trade?.side ?? "buy"}>
                <option value="buy">خرید</option>
                <option value="sell">فروش</option>
              </select>
            </label>
            <label>
              مقدار (گرم یا تعداد سکه)
              <input
                name="quantity"
                required
                inputMode="decimal"
                defaultValue={trade?.quantity}
              />
            </label>
            <label>
              قیمت معامله هر واحد (تومان)
              <input
                name="price"
                required
                inputMode="decimal"
                defaultValue={trade ? trade.price / 10 : ""}
              />
            </label>
            {[
              ["commission", "کارمزد"],
              ["workmanship", "اجرت"],
              ["tax", "مالیات"],
              ["other", "سایر هزینه‌ها"],
            ].map(([name, label]) => (
              <label key={name}>
                {label} (تومان)
                <input
                  name={name}
                  inputMode="decimal"
                  defaultValue={trade ? trade[name as "commission"] / 10 : 0}
                />
              </label>
            ))}
            <label>
              تاریخ معامله
              <input
                name="date"
                type="date"
                required
                max={today()}
                defaultValue={trade?.date ?? today()}
              />
            </label>
            <label>
              یادداشت معامله
              <textarea name="notes" defaultValue={trade?.notes} />
            </label>
            <label className="checkbox">
              <input
                name="opening"
                type="checkbox"
                defaultChecked={trade?.opening}
              />
              موجودی اولیه پیش از افتتاح دفتر؛ بدون کسر مجدد نقد (فقط خرید)
            </label>
            <button disabled={busy} className="primary">
              ذخیره معامله
            </button>
            {trade && (
              <button type="button" onClick={() => setTrade(null)}>
                انصراف معامله
              </button>
            )}
          </form>
        </section>
      </div>
      <div className="bento">
        {portfolio.map((a) => (
          <section className="card" key={a.id}>
            <h2>{a.title}</h2>
            <p>
              {names[a.kind]} · {a.quantity} {a.unit === "gram" ? "گرم" : "سکه"}
            </p>
            <dl>
              <div>
                <dt>ارزش مرجع</dt>
                <dd>{a.market === null ? "نیازمند قیمت" : money(a.market)}</dd>
              </div>
              <div>
                <dt>ارزش پس از اختلاف فروش</dt>
                <dd>
                  {a.liquidation === null ? "نامعلوم" : money(a.liquidation)}
                </dd>
              </div>
            </dl>
            <p>
              بهای مانده {money(a.cost)}؛ میانگین{" "}
              {a.average === null ? "—" : money(a.average)}؛ سود محقق‌نشده{" "}
              {a.unrealized === null ? "نامعلوم" : money(a.unrealized)}؛ سود
              فروش {money(a.realized)} تومان؛ بازده مانده{" "}
              {a.returnPercent ?? "—"}٪
            </p>
            <p>قیمت دستی · تاریخ {a.priceDate ?? "تعیین نشده"}</p>
            <button
              onClick={() =>
                setAsset(state.goldAssets.find((x) => x.id === a.id)!)
              }
            >
              ویرایش قیمت و دارایی
            </button>
            <button
              disabled={busy}
              className="danger"
              onClick={() => {
                if (state.goldTransactions.some((t) => t.assetId === a.id)) {
                  setError(
                    "دارایی دارای سابقه معامله است؛ ابتدا معاملاتش را بررسی کن.",
                  );
                  return;
                }
                if (confirm("دارایی حذف شود؟"))
                  void commit(
                    {
                      ...state,
                      goldAssets: state.goldAssets.filter((x) => x.id !== a.id),
                    },
                    "حذف دارایی طلا",
                  );
              }}
            >
              حذف دارایی
            </button>
          </section>
        ))}
      </div>
      <section className="card">
        <h2>تاریخچه معاملات</h2>
        {state.goldTransactions.map((t) => (
          <article className="entry" key={t.id}>
            <div>
              <strong>
                {t.side === "buy" ? "خرید" : "فروش"} ·{" "}
                {state.goldAssets.find((a) => a.id === t.assetId)?.title}
              </strong>
              <p>
                {t.date} · {t.quantity} واحد · مبلغ خالص{" "}
                {money(tradeValue(t).cash)} تومان{" "}
                {t.opening ? " · موجودی اولیه" : ""}
              </p>
              <p>{t.notes}</p>
            </div>
            <button onClick={() => setTrade(t)}>ویرایش معامله</button>
            <button
              className="danger"
              disabled={busy}
              onClick={async () => {
                if (
                  !confirm(
                    "معامله حذف شود؟ تمام محاسبات پس از آن دوباره بررسی می‌شوند.",
                  )
                )
                  return;
                try {
                  const next = {
                    ...state,
                    goldTransactions: state.goldTransactions.filter(
                      (x) => x.id !== t.id,
                    ),
                  };
                  goldPortfolio(next);
                  await commit(next, "حذف معامله طلا");
                } catch (err) {
                  setError(
                    err instanceof Error ? err.message : "حذف مجاز نیست",
                  );
                }
              }}
            >
              حذف معامله
            </button>
          </article>
        ))}
      </section>
    </div>
  );
}
