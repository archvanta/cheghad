import AiPanel from "./ai/AiPanel";
import EntryEditor, { kindNames } from "./EntryEditor";
import PaymentDialog from "./PaymentDialog";
import SettingsPanel from "./SettingsPanel";
import { endpointUrl } from "./ai/protocol";
import {
  entrySchema,
  ledgerSchema,
  amountAt,
  remaining,
  paid,
  portfolio,
  actualCash,
  monthOf,
  dueDate,
  today,
} from "./finance";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart,
  Bar,
  CartesianGrid,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts";
import {
  Wallet,
  CreditCard,
  Coins,
  Plane,
  MessageCircle,
  Plus,
  Download,
  Upload,
  Trash2,
  LayoutDashboard,
  Settings2,
  Send,
} from "lucide-react";
import { initial } from "./data";
import {
  cashflow,
  forecast,
  million,
  money,
  nextMonth,
  scenario,
  type Entry,
  type Kind,
  type Ledger,
} from "./finance";
import { read, save, readUndo, migrate, purge as purgeStore } from "./store";
const tabs = [
  "داشبورد",
  "درآمد و هزینه",
  "اقساط",
  "طلا و دلار",
  "شبیه‌ساز",
  "دستیار هوش مصنوعی",
  "تنظیمات",
] as const;
type Tab = (typeof tabs)[number];
const types = kindNames;
const fmtMonth = (m: string) => {
  const [y, n] = m.split("-").map(Number);
  return `${["فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور", "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"][n - 1]} ${y}`;
};
const editable = (e: Entry) => ({ ...e });
export default function App() {
  const [ledger, setLedger] = useState<Ledger>(() => structuredClone(initial)),
    [tab, setTab] = useState<Tab>("داشبورد"),
    [loaded, setLoaded] = useState(false),
    [month, setMonth] = useState(monthOf()),
    [draft, setDraft] = useState<Entry | null>(null),
    [gift, setGift] = useState(0),
    [trip, setTrip] = useState(0),
    [debt, setDebt] = useState(0),
    [gold, setGold] = useState(0),
    [monthlyGold, setMonthlyGold] = useState(0),
    [usd, setUsd] = useState(0),
    [priceChange, setPriceChange] = useState(0),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [undo, setUndo] = useState<Ledger | null>(null),
    [payment, setPayment] = useState<Entry | null>(null),
    [query, setQuery] = useState(""),
    [kindFilter, setKindFilter] = useState("all"),
    [sort, setSort] = useState("date"),
    [endpoint, setEndpointState] = useState(() => {
      try {
        const v = localStorage.getItem("cheghad-ai-endpoint");
        return v ? endpointUrl(v) : "";
      } catch {
        return "";
      }
    });
  const lock = useRef(false),
    latest = useRef(ledger);
  latest.current = ledger;
  useEffect(() => {
    read()
      .then((v) => {
        const next = v ?? structuredClone(initial);
        forecast(next, monthOf(), 12);
        setLedger(next);
        latest.current = next;
        setLoaded(true);
        void readUndo().then((v) => setUndo(v ?? null));
      })
      .catch(() =>
        setError("خواندن اطلاعات معتبر ممکن نشد؛ داده‌های قبلی حفظ شده‌اند."),
      );
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = ledger.profile.theme;
  }, [ledger.profile.theme]);
  async function update(
    fn: (l: Ledger) => Ledger,
    action = "ویرایش اطلاعات",
    isUndo = false,
  ) {
    if (lock.current) return false;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const next = ledgerSchema.parse(fn(latest.current));
      forecast(next, monthOf(), 24);
      const saved = await save(next, action, isUndo);
      latest.current = saved;
      setLedger(saved);
      setUndo((await readUndo()) ?? null);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "ذخیره نشد");
      return false;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const report = useMemo(() => forecast(ledger, month, 12), [ledger, month]);
  const current = cashflow(ledger, month),
    cash = actualCash(ledger),
    holdings = portfolio(ledger);
  const scenarioResult = useMemo(() => {
    try {
      return {
        rows: scenario(
          ledger,
          month,
          3,
          gift * 1e6,
          trip * 1e6,
          debt * 1e6,
          gold * 1e6,
          monthlyGold * 1e6,
          usd * 1e6,
          priceChange,
        ),
        error: "",
      };
    } catch (e) {
      return {
        rows: [],
        error: e instanceof Error ? e.message : "فرض‌های سناریو معتبر نیست",
      };
    }
  }, [ledger, month, gift, trip, debt, gold, monthlyGold, usd, priceChange]);
  const summary = scenarioResult.rows;
  const entries = ledger.entries
    .filter((e) =>
      tab === "اقساط"
        ? e.kind === "installment"
        : tab === "طلا و دلار"
          ? ["goldBuy", "goldSell", "usdBuy", "usdSell"].includes(e.kind)
          : tab === "درآمد و هزینه"
            ? ["income", "expense"].includes(e.kind)
            : true,
    )
    .filter(
      (e) =>
        (kindFilter === "all" || e.kind === kindFilter) &&
        e.name.includes(query),
    )
    .sort((a, b) =>
      sort === "amount"
        ? (amountAt(b, month) ?? -1) - (amountAt(a, month) ?? -1)
        : a.month.localeCompare(b.month) || a.day - b.day,
    );
  // Empty titles are valid only in the uncommitted editor draft.
  const newDraft = (kind: Kind) =>
    setDraft({
      ...entrySchema.parse({
        id: crypto.randomUUID(),
        name: "جدید",
        amount: null,
        month,
        day: 1,
        kind,
        status: "planned",
        repeat: false,
      }),
      name: "",
    });
  const backup = () => {
    const a = document.createElement("a"),
      url = URL.createObjectURL(
        new Blob([JSON.stringify(ledger, null, 2)], {
          type: "application/json",
        }),
      );
    a.href = url;
    a.download = "cheghad.private.backup.json";
    a.click();
    URL.revokeObjectURL(url);
  };
  async function importFile(file?: File) {
    if (!file) return;
    try {
      if (file.size > 2000000) throw Error("فایل بیش از دو مگابایت است");
      const obj = migrate(JSON.parse(await file.text()));
      forecast(obj, monthOf(), 24);
      if (confirm("همه اطلاعات فعلی با پشتیبان جایگزین شود؟"))
        await update(
          (l) => ({ ...obj, revision: l.revision }),
          "بازیابی پشتیبان",
        );
    } catch (e) {
      setError(e instanceof Error ? e.message : "فایل معتبر نیست");
    }
  }
  const setEndpoint = (s: string) => {
    try {
      if (s) localStorage.setItem("cheghad-ai-endpoint", s);
      else localStorage.removeItem("cheghad-ai-endpoint");
      setEndpointState(s);
    } catch {
      setError("ذخیره تنظیم آدرس ممکن نشد");
    }
  };
  if (!loaded)
    return (
      <main className="main" role="status">
        {error || "در حال خواندن دفتر مالی…"}
      </main>
    );
  const navIcons = [
    LayoutDashboard,
    Wallet,
    CreditCard,
    Coins,
    Plane,
    MessageCircle,
    Settings2,
  ];
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brandicon">چ</div>
          <div>
            <b>چقدر؟</b>
            <small>CHEGHAD FINANCE</small>
          </div>
        </div>
        <p className="navlabel">مدیریت مالی</p>
        {tabs.map((t, i) => {
          const Icon = navIcons[i];
          return (
            <button
              key={t}
              className={"nav " + (tab === t ? "active" : "")}
              onClick={() => setTab(t)}
            >
              <Icon size={19} />
              {t}
            </button>
          );
        })}
        <div className="sidefoot">همه اطلاعات به‌صورت محلی ذخیره می‌شوند</div>
      </aside>
      <main className="main">
        <header>
          <div>
            <span className="eyebrow">داشبورد شخصی / {fmtMonth(month)}</span>
            <h1>{tab}</h1>
          </div>
          <div className="headercontrols">
            <select
              aria-label="ماه مالی"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            >
              {Array.from({ length: 37 }, (_, i) =>
                nextMonth(monthOf(), i - 12),
              ).map((m) => (
                <option value={m} key={m}>
                  {fmtMonth(m)}
                </option>
              ))}
            </select>
            <button
              className="button iconbutton"
              onClick={() =>
                update(
                  (l) => ({
                    ...l,
                    profile: {
                      ...l.profile,
                      theme: l.profile.theme === "dark" ? "light" : "dark",
                    },
                  }),
                  "تغییر تم",
                )
              }
              aria-label="تغییر تم"
            >
              ◐
            </button>
          </div>
        </header>
        {error && (
          <p className="notice danger" role="alert">
            {error}
          </p>
        )}
        <div className="savebar">
          <span role="status">
            {busy ? "در حال ذخیره…" : "ذخیره محلی · نسخه " + ledger.revision}
          </span>
          {undo && (
            <button
              disabled={busy}
              className="mini"
              onClick={() =>
                update(
                  (l) => ({ ...undo, revision: l.revision }),
                  "بازگردانی آخرین تغییر",
                  true,
                )
              }
            >
              بازگردانی آخرین تغییر
            </button>
          )}
        </div>
        {tab === "داشبورد" && (
          <>
            <div className="hero">
              <span>نقشه مالی تو، همین‌جا</span>
              <h2>هر تومن رو آگاهانه خرج کن.</h2>
              <p>
                مدیریت دقیق درآمد، اقساط، هزینه و سرمایه‌گذاری در یک نگاه. تمام
                اعداد قابل‌ویرایش‌اند.
              </p>
              <button
                className="button primary"
                onClick={() => setTab("شبیه‌ساز")}
              >
                آزمایشگاه تصمیم‌های مالی ←
              </button>
            </div>
            <div className="stats">
              <Card
                name="درآمد این ماه"
                value={money(current.income)}
                hint="برنامه‌ریزی‌شده"
              />
              <Card
                name="اقساط این ماه"
                value={money(current.installments)}
                hint="جمع سررسیدها"
              />
              <Card
                name="هزینه این ماه"
                value={money(current.expenses)}
                hint="برنامه‌ریزی‌شده"
              />
              <Card
                name="موجودی نقد واقعی"
                value={money(cash)}
                hint="نقد واقعی، بدون درآمد مورد انتظار"
                accent
              />
            </div>
            <div className="stats">
              <Card
                name="پایان بازه پیش‌بینی"
                value={money(report[0].cash)}
                hint="با فرض وصول و پرداخت"
              />
              <Card
                name="ظرفیت پس از ذخیره"
                value={money(report[0].cash - ledger.profile.reserve)}
                hint="کسری با عدد منفی نمایش داده می‌شود"
              />
              {holdings.map((a) => (
                <Card
                  key={a.asset}
                  name={a.asset === "gold" ? "طلای موجود" : "دلار موجود"}
                  value={a.quantity}
                  hint={
                    a.value === null ? "قیمت نیازمند تکمیل" : money(a.value)
                  }
                />
              ))}
            </div>
            {current.unknown > 0 && (
              <p className="notice">
                برخی مبالغ نامشخص یا تأییدنشده‌اند؛ پیش‌بینی کامل نیست.
              </p>
            )}
            <div className="panel">
              <div className="panelhead">
                <h3>جریان نقد ماهانه</h3>
                <span>۱۲ ماه از بازه انتخاب‌شده</span>
              </div>
              <div className="chart">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={report.map((x) => ({
                      ...x,
                      label: fmtMonth(x.month).split(" ")[0],
                      income: x.income / 1e6,
                      cost: (x.expenses + x.installments) / 1e6,
                    }))}
                  >
                    <CartesianGrid stroke="var(--line)" vertical={false} />
                    <XAxis dataKey="label" stroke="var(--muted)" />
                    <YAxis stroke="var(--muted)" />
                    <Tooltip />
                    <Legend />
                    <Bar
                      dataKey="income"
                      name="درآمد (میلیون)"
                      fill="#9185ff"
                      radius={[4, 4, 0, 0]}
                    />
                    <Bar
                      dataKey="cost"
                      name="هزینه و اقساط"
                      fill="#5acaca"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </>
        )}
        {["درآمد و هزینه", "اقساط", "طلا و دلار"].includes(tab) && (
          <div className="panel">
            <div className="panelhead">
              <div>
                <h3>مدیریت و ویرایش اطلاعات</h3>
                <p>برای تغییر هر مبلغ روی ویرایش کلیک کن.</p>
              </div>
              <div className="actions">
                {(tab === "درآمد و هزینه"
                  ? (["income", "expense"] as Kind[])
                  : tab === "اقساط"
                    ? (["installment"] as Kind[])
                    : (["goldBuy", "goldSell", "usdBuy", "usdSell"] as Kind[])
                ).map((k) => (
                  <button
                    className="button primary"
                    key={k}
                    onClick={() => newDraft(k)}
                  >
                    <Plus size={16} />
                    {types[k]}
                  </button>
                ))}
              </div>
            </div>
            <div className="filters">
              <label>
                جست‌وجوی رکورد
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
              <label>
                فیلتر نوع
                <select
                  value={kindFilter}
                  onChange={(e) => setKindFilter(e.target.value)}
                >
                  <option value="all">همه</option>
                  {Object.entries(types).map(([k, v]) => (
                    <option value={k} key={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                مرتب‌سازی
                <select value={sort} onChange={(e) => setSort(e.target.value)}>
                  <option value="date">سررسید</option>
                  <option value="amount">بیشترین مبلغ</option>
                </select>
              </label>
            </div>
            <div
              className="tablewrap"
              tabIndex={0}
              role="region"
              aria-label="جدول مالی قابل پیمایش"
            >
              <table>
                <thead>
                  <tr>
                    <th>عنوان</th>
                    <th>نوع</th>
                    <th>ماه شروع</th>
                    <th>مبلغ</th>
                    <th>تکرار</th>
                    <th>عملیات</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e) => (
                    <tr key={e.id}>
                      <td>{e.name}</td>
                      <td>
                        <span className="tag">{types[e.kind]}</span>
                      </td>
                      <td>{fmtMonth(e.month)}</td>
                      <td>
                        {amountAt(e, e.repeat ? month : e.month) === null
                          ? "نیازمند تکمیل"
                          : money(amountAt(e, e.repeat ? month : e.month)!)}
                        <small className="record-status">
                          {e.confirmed ? "تأییدشده" : "نیازمند تأیید"} ·
                          باقی‌مانده{" "}
                          {money(
                            remaining(ledger, e, e.repeat ? month : e.month),
                          )}
                        </small>
                      </td>
                      <td>{e.repeat ? "ماهانه" : "یک‌باره"}</td>
                      <td>
                        {!e.cancelled &&
                          amountAt(e, e.repeat ? month : e.month) !== null &&
                          remaining(ledger, e, e.repeat ? month : e.month) >
                            0 && (
                            <button
                              className="mini"
                              onClick={() => setPayment(e)}
                            >
                              {e.kind === "income"
                                ? "ثبت دریافت"
                                : "ثبت پرداخت"}
                            </button>
                          )}
                        {e.kind === "installment" &&
                          !ledger.payments.some((p) => p.entryId === e.id) && (
                            <button
                              className="mini"
                              onClick={() =>
                                update(
                                  (l) => ({
                                    ...l,
                                    entries: l.entries.map((x) =>
                                      x.id === e.id
                                        ? { ...x, cancelled: !x.cancelled }
                                        : x,
                                    ),
                                  }),
                                  "تغییر وضعیت قسط",
                                )
                              }
                            >
                              {e.cancelled ? "فعال‌سازی" : "لغو قسط"}
                            </button>
                          )}
                        <button
                          className="mini"
                          onClick={() => setDraft(editable(e))}
                        >
                          ویرایش
                        </button>
                        <button
                          className="mini danger"
                          onClick={() => {
                            if (confirm("این مورد حذف شود؟"))
                              void update(
                                (v) => ({
                                  ...v,
                                  entries: v.entries.filter(
                                    (x) => x.id !== e.id,
                                  ),
                                  payments: v.payments.filter(
                                    (p) => p.entryId !== e.id,
                                  ),
                                }),
                                "حذف رکورد و برگشت اثر پرداخت‌های آن",
                              );
                          }}
                        >
                          حذف
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {tab === "شبیه‌ساز" && (
          <>
            <div className="hero small">
              <span>FINANCIAL DECISION LAB</span>
              <h2>طلا بخرم یا قسط بدم؟</h2>
              <p>
                پارامترها رو تغییر بده و نتیجه سه ماه بعد رو ببین. این فقط
                شبیه‌سازی است و داده واقعی را تغییر نمی‌دهد.
              </p>
            </div>
            <div className="twocol">
              <div className="panel">
                <h3>مقادیر سناریو</h3>
                <Range
                  title="بودجه تخصیص از نقد واقعی"
                  v={gift}
                  set={setGift}
                  min={0}
                  max={Math.max(30, cash / 1e6)}
                />
                <Range
                  title="هزینه اضافی ثبت‌نشده در سناریو"
                  v={trip}
                  set={setTrip}
                  min={0}
                  max={10}
                />
                <Range
                  title="تسویه زودتر اقساط"
                  v={debt}
                  set={setDebt}
                  min={0}
                  max={gift}
                />
                <Range
                  title="طلای فوری"
                  v={gold}
                  set={setGold}
                  min={0}
                  max={Math.max(0, gift - trip - debt)}
                />
                <Range
                  title="دلار فوری"
                  v={usd}
                  set={setUsd}
                  min={0}
                  max={gift}
                />
                <Range
                  title="تغییر فرضی قیمت طلا (درصد)"
                  v={priceChange}
                  set={setPriceChange}
                  min={-50}
                  max={100}
                  unit="٪"
                />
                <Range
                  title="خرید طلای ماهانه"
                  v={monthlyGold}
                  set={setMonthlyGold}
                  min={0}
                  max={15}
                />
                <p className="muted">
                  تسویه زودتر در این شبیه‌سازی به ترتیب از قسط‌های نخست کم
                  می‌شود؛ قبل از اقدام واقعی باید شرایط دیجی‌پی بررسی شود.
                </p>
              </div>
              <div className="panel">
                <h3>نتیجه سناریو</h3>
                {scenarioResult.error && (
                  <p className="notice danger" role="alert">
                    {scenarioResult.error}
                  </p>
                )}
                {summary.map((m) => (
                  <div className="result" key={m.month}>
                    <b>{fmtMonth(m.month)}</b>
                    <span>قسط: {million(m.installmentPaid)}</span>
                    <span>
                      طلا:{" "}
                      {m.goldValue === null
                        ? "نرخ نامعلوم"
                        : money(m.goldValue)}{" "}
                      · دلار:{" "}
                      {m.usdValue === null ? "نرخ نامعلوم" : money(m.usdValue)}
                    </span>
                    <span>
                      خالص دارایی:{" "}
                      {m.netWorth === null
                        ? "نیازمند تکمیل"
                        : money(m.netWorth)}{" "}
                      · کمینه روزانه: {money(m.minimum)}
                    </span>
                    <strong className={m.cash < 0 ? "red" : "green"}>
                      نقدینگی: {million(m.cash)}
                    </strong>
                  </div>
                ))}
                <p className="muted">
                  بودجه تخصیص، درآمد جدید نیست و به نقد اضافه نمی‌شود. هدیه را
                  فقط یک‌بار در دفتر درآمد ثبت و در صورت وصول دریافت کن. هزینه
                  اضافی سناریو باید در دفتر ثبت نشده باشد. کاهش اسمی اقساط فرضی
                  است و پرداخت واقعی نیست.
                </p>
              </div>
            </div>
          </>
        )}
        {tab === "دستیار هوش مصنوعی" && (
          <AiPanel
            ledger={ledger}
            month={month}
            endpoint={endpoint}
            commit={update}
          />
        )}
        {tab === "تنظیمات" && (
          <SettingsPanel
            ledger={ledger}
            endpoint={endpoint}
            setEndpoint={setEndpoint}
            commit={update}
            backup={backup}
            importFile={importFile}
            busy={busy}
            purge={async () => {
              try {
                const l = await purgeStore();
                latest.current = l;
                setLedger(l);
                setUndo(null);
              } catch {
                setError("حذف انجام نشد");
              }
            }}
          />
        )}
      </main>
      {draft && (
        <EntryEditor
          entry={draft}
          existing={ledger.entries.some((e) => e.id === draft.id)}
          hasPayments={ledger.payments.some((p) => p.entryId === draft.id)}
          month={month}
          busy={busy}
          close={() => setDraft(null)}
          save={(e) =>
            update(
              (l) => ({
                ...l,
                entries: l.entries.some((x) => x.id === e.id)
                  ? l.entries.map((x) => (x.id === e.id ? e : x))
                  : [...l.entries, e],
              }),
              "ذخیره رکورد: " + e.name,
            )
          }
        />
      )}
      {payment && (
        <PaymentDialog
          entry={payment}
          month={payment.repeat ? month : payment.month}
          ledger={ledger}
          busy={busy}
          close={() => setPayment(null)}
          commit={(l) => update(() => l, "ثبت رویداد واقعی: " + payment.name)}
        />
      )}
    </div>
  );
}
function Card({
  name,
  value,
  hint,
  accent = false,
}: {
  name: string;
  value: string;
  hint: string;
  accent?: boolean;
}) {
  return (
    <div className={"stat " + (accent ? "accent" : "")}>
      <p>{name}</p>
      <h2>{value}</h2>
      <small>{hint}</small>
    </div>
  );
}
function Range({
  title,
  v,
  set,
  min,
  max,
  unit = "میلیون تومان",
}: {
  title: string;
  v: number;
  set: (v: number) => void;
  min: number;
  max: number;
  unit?: string;
}) {
  return (
    <div className="range">
      <div>
        <span>{title}</span>
        <strong>
          {v} {unit}
        </strong>
      </div>
      <input
        aria-label={title}
        type="range"
        min={min}
        max={max}
        step="0.5"
        value={Math.min(max, v)}
        onChange={(e) => set(Number(e.target.value))}
      />
    </div>
  );
}
