import { stateSchema } from "../domain/model";
import Planner from "./Planner";
import { expandEntries } from "../domain/recurring";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Wallet,
  LayoutDashboard,
  List,
  Settings,
  Plus,
  Moon,
  Sun,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  Download,
  Upload,
} from "lucide-react";
import Decimal from "decimal.js";
import {
  emptyState,
  jalaliMonth,
  today,
  entrySchema,
  type State,
  type Entry,
} from "../domain/model";
import {
  addPayment,
  parseMoney,
  summary,
  remaining,
  paid,
  dailyForecast,
} from "../domain/engine";
import { loadState, saveState, readBackup } from "../database/store";
const labels = { income: "درآمد", expense: "هزینه", installment: "قسط" };
const dateLabel = (date: string) =>
  new Intl.DateTimeFormat("fa-IR", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(date + "T12:00:00Z"));
function Card({
  title,
  children,
  className = "",
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`card ${className}`}>
      <h2>{title}</h2>
      {children}
    </section>
  );
}
function Modal({
  title,
  children,
  close,
  error,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
  error?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog ref={ref} onCancel={close}>
      <header>
        <h2>{title}</h2>
        <button onClick={close} aria-label="بستن">
          ×
        </button>
      </header>
      {error && <p role="alert">{error}</p>}
      {children}
    </dialog>
  );
}
export default function App() {
  const [state, setState] = useState<State>(emptyState),
    [ready, setReady] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [page, setPage] = useState("dashboard"),
    [offset, setOffset] = useState(0),
    [editor, setEditor] = useState<Entry | "new" | null>(null),
    [payment, setPayment] = useState<Entry | null>(null),
    [filter, setFilter] = useState("all"),
    [query, setQuery] = useState("");
  useEffect(() => {
    loadState()
      .then((s) => {
        setState(s);
        setReady(true);
      })
      .catch(() =>
        setError(
          "خواندن اطلاعات ممکن نشد. اجازه دسترسی مرورگر به ذخیره‌سازی را بررسی کنید.",
        ),
      );
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = state.theme;
  }, [state.theme]);
  const [undo, setUndo] = useState<State | null>(null);
  async function commit(
    next: State,
    action = "ویرایش دفتر مالی",
    isUndo = false,
  ) {
    setBusy(true);
    setError("");
    try {
      stateSchema.parse({
        ...next,
        entries: expandEntries(next, jalaliMonth(today(), 24).end),
      });
      const saved = await saveState({
        ...next,
        history: [
          { date: new Date().toISOString(), action },
          ...(isUndo ? state.history : next.history),
        ].slice(0, 100),
      });
      setUndo(isUndo ? null : state);
      setState(saved);
      return true;
    } catch {
      setError("ذخیره انجام نشد. فضای مرورگر یا اعتبار داده را بررسی کنید.");
      return false;
    } finally {
      setBusy(false);
    }
  }
  const money = (n: number) =>
    new Intl.NumberFormat(state.digits, { maximumFractionDigits: 1 }).format(
      new Decimal(n).div(10).toNumber(),
    );
  const month = jalaliMonth(today(), offset),
    r = summary(state, month.start, month.end, today());
  const forecast = dailyForecast(
    state,
    today(),
    month.end < today() ? today() : month.end,
  );
  const months = Array.from({ length: 12 }, (_, i) => {
    const m = jalaliMonth(today(), i);
    return { ...m, ...summary(state, m.start, m.end, today()) };
  });
  const next = state.entries
    .filter((e) => e.kind === "installment" && remaining(e, today()) > 0)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
  const visible = expandEntries(state, jalaliMonth(today(), 12).end)
    .filter(
      (e) => (filter === "all" || e.kind === filter) && e.title.includes(query),
    )
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const amountInput = (
    name: string,
    label: string,
    value: string,
    required = true,
  ) => (
    <label>
      {label}
      <input
        name={name}
        defaultValue={value}
        inputMode="decimal"
        required={required}
        autoComplete="off"
      />
    </label>
  );
  function download() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(state, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "cheghad.private.json";
    a.click();
    URL.revokeObjectURL(url);
  }
  async function importFile(file?: File) {
    if (!file) return;
    try {
      if (file.size > 5_000_000) throw Error();
      const next = readBackup(await file.text());
      if (confirm("تمام داده‌های فعلی با فایل جایگزین شوند؟"))
        await commit(next);
    } catch {
      setError(
        "فایل نامعتبر است یا نسخه آن پشتیبانی نمی‌شود. داده‌های فعلی حفظ شدند.",
      );
    }
  }
  async function submitEntry(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const f = new FormData(ev.currentTarget);
    try {
      const existing = editor === "new" ? null : editor;
      const now = new Date().toISOString();
      const amount = String(f.get("amount")).trim();
      const e = entrySchema.parse({
        id: existing?.id ?? crypto.randomUUID(),
        ruleId: existing?.ruleId,
        categoryId: String(f.get("categoryId") || "") || undefined,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        title: f.get("title"),
        kind: f.get("kind"),
        amount: amount ? parseMoney(amount) : null,
        dueDate: f.get("date"),
        confirmed: f.get("confirmed") === "on",
        payments: existing?.payments ?? [],
      });
      if (
        await commit({
          ...state,
          entries: [...state.entries.filter((x) => x.id !== e.id), e],
        })
      )
        setEditor(null);
    } catch {
      setError(
        "عنوان، تاریخ و مبلغ را بررسی کنید. مبلغ نمی‌تواند از پرداخت‌های ثبت‌شده کمتر باشد.",
      );
    }
  }
  if (!ready)
    return (
      <main className="loading" role="status">
        {error || "در حال خواندن دفتر مالی…"}
      </main>
    );
  return (
    <div className="shell">
      <aside>
        <a
          className="brand"
          href="#dashboard"
          onClick={() => setPage("dashboard")}
        >
          <span className="brand-icon">چ</span>
          <span>
            چقدر<span className="accent">؟</span>
            <small>همراه تصمیم‌های مالی تو</small>
          </span>
        </a>
        <p className="nav-label">فضای شخصی</p>
        <nav aria-label="ناوبری اصلی">
          {[
            ["dashboard", "داشبورد", LayoutDashboard],
            ["entries", "دفتر مالی", List],
            ["planner", "برنامه و بودجه", List],
            ["settings", "تنظیمات", Settings],
          ].map(([id, label, Icon]) => (
            <button
              key={String(id)}
              className={page === id ? "active" : ""}
              onClick={() => {
                setPage(String(id));
                location.hash = String(id);
              }}
            >
              <Icon size={20} />
              {String(label)}
            </button>
          ))}
        </nav>
        <div className="privacy">
          <ShieldCheck />
          <strong>داده‌های تو، پیش خودت</strong>
          <p>
            اطلاعات فقط در مرورگر این دستگاه ذخیره می‌شوند. پشتیبان بگیر؛
            پاک‌کردن داده‌های مرورگر آن‌ها را حذف می‌کند.
          </p>
        </div>
        <small className="version">CHEGHAD / نسخهٔ پایه ۰.۱</small>
      </aside>
      <main>
        <header className="top">
          <span className="eyebrow">نمای روشن‌تری از پولت داشته باش</span>
          <div className="actions">
            <span className="save" role="status">
              {busy
                ? "در حال ذخیره…"
                : state.savedAt
                  ? "ذخیره‌شده " +
                    new Date(state.savedAt).toLocaleTimeString("fa-IR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "دفتر تازه"}
            </span>
            <button
              aria-label="تغییر تم"
              disabled={busy}
              onClick={() =>
                commit({
                  ...state,
                  theme: state.theme === "dark" ? "light" : "dark",
                })
              }
            >
              {state.theme === "dark" ? <Sun size={19} /> : <Moon size={19} />}
            </button>
          </div>
        </header>
        {undo && (
          <button
            disabled={busy}
            onClick={() => commit(undo, "بازگردانی آخرین تغییر", true)}
          >
            بازگردانی آخرین تغییر
          </button>
        )}
        {error && (
          <div className="alert" role="alert">
            {error}
            <button onClick={() => setError("")}>بستن پیام</button>
          </div>
        )}
        <div className="page-heading">
          <div>
            <p className="eyebrow">پولت کجا می‌ره؟ چقدر برات می‌مونه؟</p>
            <h1>
              {page === "dashboard"
                ? "تصویر مالی تو"
                : page === "entries"
                  ? "دفتر مالی"
                  : page === "planner"
                    ? "برنامه و بودجه"
                    : "تنظیمات و داده‌ها"}
            </h1>
          </div>
          <button
            className="primary"
            onClick={() => setEditor("new")}
            disabled={busy}
          >
            <Plus size={18} /> ثبت جدید
          </button>
        </div>
        {page === "dashboard" && (
          <>
            <div className="month-picker">
              <button
                aria-label="ماه قبل"
                disabled={offset === 0}
                onClick={() => setOffset(offset - 1)}
              >
                <ChevronRight />
              </button>
              <strong>{month.label}</strong>
              <button
                aria-label="ماه بعد"
                disabled={offset >= 23}
                onClick={() => setOffset(offset + 1)}
              >
                <ChevronLeft />
              </button>
              <span>واحد: تومان</span>
            </div>
            {!state.entries.length && !state.rules.length && (
              <div className="intro">
                <div>
                  <strong>از اولین عدد شروع کن.</strong>
                  <p>
                    موجودی افتتاحیه را در تنظیمات وارد کن و درآمد، هزینه یا قسطت
                    را ثبت کن. اینجا دادهٔ ساختگی نمایش داده نمی‌شود.
                  </p>
                </div>
                <button onClick={() => setPage("settings")}>
                  تنظیم موجودی <ChevronLeft size={16} />
                </button>
              </div>
            )}
            {r.incomplete > 0 && (
              <div className="warning">
                {new Intl.NumberFormat("fa").format(r.incomplete)} مورد نیازمند
                تکمیل یا تأیید است؛ پیش‌بینی قطعی نیست. مبالغ نامشخص در جمع لحاظ
                نشده‌اند.
              </div>
            )}
            <div className="bento">
              <Card title="موجودی نقدی واقعی · امروز" className="balance">
                <div className="card-icon">
                  <Wallet />
                </div>
                <div className="hero-number">
                  {money(r.cash)}
                  <small>تومان</small>
                </div>
                <div className="balance-footer">
                  <span>مانده پیش‌بینی‌شده تا پایان {month.label}</span>
                  <strong className={r.projected < 0 ? "negative" : ""}>
                    {money(r.projected)}
                  </strong>
                </div>
                <small>موجودی افتتاحیه + دریافت واقعی − پرداخت واقعی</small>
              </Card>
              <Card title="ظرفیت سرمایه‌گذاری">
                <span className="tag">بر مبنای تعهدات ثبت‌شده</span>
                <div
                  className={`metric ${r.capacity < 0 ? "negative" : "positive"}`}
                >
                  {money(r.capacity)}
                  <small>تومان</small>
                </div>
                <p>
                  مانده پیش‌بینی‌شده منهای ذخیره هدف {money(state.reserve)}{" "}
                  تومان. هزینه‌های ثبت‌نشده در این عدد نیستند.
                </p>
              </Card>
              <Card title="قسط بعدی">
                <span className="tag">
                  {next
                    ? next.dueDate < today()
                      ? "سررسید گذشته"
                      : "پرداخت‌نشده"
                    : "بدون تعهد ثبت‌شده"}
                </span>
                <div className="metric">
                  {next ? money(remaining(next, today())) : "—"}
                  <small>{next ? "تومان" : ""}</small>
                </div>
                <p>
                  {next
                    ? `${next.title} · ${dateLabel(next.dueDate)}`
                    : "با ثبت اقساط، موعد بعدی اینجا دیده می‌شود."}
                </p>
                {next && (
                  <button disabled={busy} onClick={() => setPayment(next)}>
                    ثبت پرداخت
                  </button>
                )}
              </Card>
              <Card title="درآمد ماه انتخاب‌شده">
                <ArrowDownLeft className="positive" />
                <div className="metric">{money(r.income)}</div>
                <p>شامل دریافتی و مورد انتظار؛ به معنی موجودی نقد نیست.</p>
              </Card>
              <Card title="هزینه و اقساط ماه">
                <ArrowUpRight className="negative" />
                <div className="metric">
                  {money(r.expense + r.installments)}
                </div>
                <p>
                  هزینه {money(r.expense)} · اقساط {money(r.installments)}
                </p>
              </Card>
              <Card title="سلامت نقدینگی">
                <div
                  className={`metric ${forecast.minimum < 0 ? "negative" : "positive"}`}
                >
                  {money(forecast.minimum)}
                </div>
                <p>
                  حداقل مانده پیش‌بینی‌شده روزانه تا پایان بازه؛ رویدادهای
                  هم‌روز با هم جمع می‌شوند و ترتیب ساعتی معلوم نیست.
                </p>
              </Card>
              <Card title="جریان مالی ۱۲ ماه آینده" className="chart-card">
                <div className="legend">
                  <span>
                    <i className="income-dot" /> درآمد
                  </span>
                  <span>
                    <i className="expense-dot" /> هزینه و قسط
                  </span>
                </div>
                <div
                  className="chart"
                  role="img"
                  aria-label="مقایسه درآمد و تعهدات ثبت‌شده در دوازده ماه آینده"
                >
                  {months.map((m) => {
                    const max = Math.max(
                      1,
                      ...months.flatMap((x) => [
                        x.income,
                        x.expense + x.installments,
                      ]),
                    );
                    return (
                      <div
                        className="chart-column"
                        key={m.start}
                        title={`${m.label}: درآمد ${money(m.income)}، خروج ${money(m.expense + m.installments)}`}
                      >
                        <div className="bars">
                          <i style={{ height: `${(m.income / max) * 100}%` }} />
                          <i
                            style={{
                              height: `${((m.expense + m.installments) / max) * 100}%`,
                            }}
                          />
                        </div>
                        <span>{m.label.replace(/[۰-۹0-9]/g, "").trim()}</span>
                      </div>
                    );
                  })}
                </div>
                <p>
                  رویدادهای ثبت‌شده و قواعد تکرار فعال؛ خرید طلا هنوز در این
                  نسخه فعال نیست.
                </p>
                <details>
                  <summary>جدول داده‌های نمودار</summary>
                  {months.map((m) => (
                    <p key={m.start}>
                      {m.label}: درآمد {money(m.income)} / تعهدات{" "}
                      {money(m.expense + m.installments)}
                    </p>
                  ))}
                </details>
              </Card>
              <Card title="تعهدات و دارایی">
                <dl>
                  <div>
                    <dt>بدهی پرداخت‌نشده</dt>
                    <dd>{money(r.debt)}</dd>
                  </div>
                  <div>
                    <dt>خالص دارایی ثبت‌شده</dt>
                    <dd>{money(r.netWorth)}</dd>
                  </div>
                </dl>
                <p>
                  خالص فعلی = نقد − بدهی. مدیریت طلا در مرحله بعد اضافه می‌شود؛
                  دارایی طلای ثبت‌نشده لحاظ نشده است.
                </p>
              </Card>
            </div>
          </>
        )}
        {page === "entries" && (
          <>
            <div className="filters">
              <label>
                جست‌وجو
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="عنوان رکورد"
                />
              </label>
              <label>
                نوع
                <select
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                >
                  <option value="all">همه</option>
                  {Object.entries(labels).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="entry-list">
              {!visible.length && (
                <p className="empty">رکوردی برای نمایش وجود ندارد.</p>
              )}
              {visible.map((e) => (
                <article className="entry card" key={e.id}>
                  <div>
                    <span className="tag">{labels[e.kind]}</span>
                    <h2>{e.title}</h2>
                    <p>
                      {dateLabel(e.dueDate)} ·{" "}
                      {!e.confirmed
                        ? "نیازمند تأیید"
                        : e.amount === null
                          ? "نیازمند تکمیل"
                          : remaining(e) === 0
                            ? "تسویه‌شده"
                            : paid(e) > 0
                              ? "پرداخت جزئی"
                              : "تسویه‌نشده"}
                    </p>
                  </div>
                  <div>
                    <strong>
                      {e.amount === null
                        ? "نامشخص"
                        : money(e.amount) + " تومان"}
                    </strong>
                    <p>
                      باقی‌مانده:{" "}
                      {e.amount === null ? "نامشخص" : money(remaining(e))}
                    </p>
                  </div>
                  <div className="actions">
                    <button onClick={() => setEditor(e)} disabled={busy}>
                      ویرایش
                    </button>
                    {e.amount !== null && remaining(e) > 0 && (
                      <button disabled={busy} onClick={() => setPayment(e)}>
                        {e.kind === "income" ? "ثبت دریافت" : "ثبت پرداخت"}
                      </button>
                    )}
                    <button
                      className="danger"
                      disabled={busy}
                      onClick={async () => {
                        if (
                          confirm(
                            "این رکورد و پرداخت‌های آن حذف شوند؟ اثر آن از موجودی نیز حذف می‌شود.",
                          )
                        )
                          await commit({
                            ...state,
                            entries: state.entries.filter((x) => x.id !== e.id),
                            excludedEntryIds: e.ruleId
                              ? [...state.excludedEntryIds, e.id]
                              : state.excludedEntryIds,
                          });
                      }}
                    >
                      حذف
                    </button>
                  </div>
                  {e.payments.length > 0 && (
                    <details>
                      <summary>تاریخچه پرداخت / دریافت</summary>
                      {e.payments.map((p) => (
                        <p key={p.id}>
                          {dateLabel(p.date)} · {money(p.amount)} تومان
                        </p>
                      ))}
                    </details>
                  )}
                </article>
              ))}
            </div>
          </>
        )}
        {page === "planner" && (
          <Planner state={state} commit={commit} busy={busy} money={money} />
        )}
        {page === "settings" && (
          <div className="settings-grid">
            <Card title="تاریخچه تغییرات">
              {state.history.map((h, i) => (
                <p key={i}>
                  {new Date(h.date).toLocaleString("fa-IR")} · {h.action}
                </p>
              ))}
            </Card>
            <Card title="پایهٔ مالی">
              <form
                onSubmit={async (ev) => {
                  ev.preventDefault();
                  try {
                    const f = new FormData(ev.currentTarget);
                    await commit({
                      ...state,
                      openingBalance: parseMoney(String(f.get("opening"))),
                      reserve: parseMoney(String(f.get("reserve"))),
                      digits: f.get("digits") as State["digits"],
                    });
                  } catch {
                    setError("مبلغ معتبر و در محدوده دقت وارد کنید.");
                  }
                }}
              >
                {amountInput(
                  "opening",
                  "موجودی افتتاحیه (تومان)",
                  String(state.openingBalance / 10),
                )}
                <p>
                  این موجودی مربوط به قبل از همهٔ دریافت‌ها و پرداخت‌های ثبت‌شده
                  است؛ مانده امروز را دوباره وارد نکن.
                </p>
                {amountInput(
                  "reserve",
                  "ذخیره نقدی هدف (تومان)",
                  String(state.reserve / 10),
                )}
                <label>
                  نمایش اعداد
                  <select name="digits" defaultValue={state.digits}>
                    <option value="fa-IR">فارسی</option>
                    <option value="en-US">لاتین</option>
                  </select>
                </label>
                <button className="primary" disabled={busy}>
                  ذخیره تنظیمات
                </button>
              </form>
            </Card>
            <Card title="مالکیت اطلاعات">
              <p>
                داده‌ها به هیچ سروری ارسال نمی‌شوند. فایل پشتیبان حاوی اطلاعات
                خصوصی است؛ آن را در مخزن عمومی قرار نده.
              </p>
              <button onClick={download}>
                <Download size={18} /> دریافت پشتیبان JSON
              </button>
              <label className="upload">
                <Upload size={18} /> بازیابی پشتیبان
                <input
                  type="file"
                  accept=".json,application/json"
                  disabled={busy}
                  onChange={(e) => {
                    void importFile(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </label>
              <button
                className="danger"
                disabled={busy}
                onClick={async () => {
                  if (confirm("همه اطلاعات محلی حذف شوند؟ ابتدا پشتیبان بگیر."))
                    await commit(emptyState());
                }}
              >
                حذف همه داده‌ها
              </button>
            </Card>
          </div>
        )}
        <footer>
          چقدر؟ · تصمیم آگاهانه با عددهای خودت{" "}
          <span>ذخیره محلی، بدون ردیابی</span>
        </footer>
      </main>
      {editor && (
        <Modal
          error={error}
          title={editor === "new" ? "ثبت رویداد مالی" : "ویرایش رویداد"}
          close={() => setEditor(null)}
        >
          <form onSubmit={submitEntry}>
            <label>
              عنوان
              <input
                name="title"
                required
                maxLength={100}
                defaultValue={editor === "new" ? "" : editor.title}
              />
            </label>
            <label>
              دسته‌بندی
              <select
                name="categoryId"
                defaultValue={editor === "new" ? "" : (editor.categoryId ?? "")}
              >
                <option value="">بدون دسته</option>
                {state.categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              نوع
              <select
                name="kind"
                aria-label="نوع"
                defaultValue={editor === "new" ? "income" : editor.kind}
                disabled={editor !== "new" && editor.payments.length > 0}
              >
                {Object.entries(labels).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            {editor !== "new" && editor.payments.length > 0 && (
              <input type="hidden" name="kind" value={editor.kind} />
            )}
            {amountInput(
              "amount",
              "مبلغ (تومان؛ خالی = نامشخص)",
              editor === "new" || editor.amount === null
                ? ""
                : String(editor.amount / 10),
              false,
            )}
            <label>
              تاریخ سررسید (میلادی، نمایش شمسی)
              <input
                name="date"
                type="date"
                required
                min="1900-01-01"
                max="2200-12-31"
                defaultValue={editor === "new" ? today() : editor.dueDate}
              />
            </label>
            <label className="checkbox">
              <input
                name="confirmed"
                type="checkbox"
                defaultChecked={editor === "new" || editor.confirmed}
              />{" "}
              اطلاعات تأیید شده است
            </label>
            <button className="primary" disabled={busy}>
              ذخیره رویداد
            </button>
          </form>
        </Modal>
      )}
      {payment && (
        <Modal
          error={error}
          title={payment.kind === "income" ? "ثبت دریافت" : "ثبت پرداخت"}
          close={() => setPayment(null)}
        >
          <form
            onSubmit={async (ev) => {
              ev.preventDefault();
              try {
                const f = new FormData(ev.currentTarget);
                const date = String(f.get("date"));
                if (date > today()) throw Error();
                const updated = addPayment(
                  payment,
                  parseMoney(String(f.get("amount"))),
                  date,
                );
                if (
                  await commit({
                    ...state,
                    entries: [
                      ...state.entries.filter((e) => e.id !== payment.id),
                      updated,
                    ],
                  })
                )
                  setPayment(null);
              } catch {
                setError(
                  "مبلغ باید مثبت و حداکثر برابر مانده باشد. تاریخ واقعی نمی‌تواند در آینده باشد.",
                );
              }
            }}
          >
            <p>
              {payment.title} · مانده {money(remaining(payment))} تومان
            </p>
            {amountInput(
              "amount",
              "مبلغ پرداخت یا دریافت (تومان)",
              String(remaining(payment) / 10),
            )}
            <label>
              تاریخ واقعی (میلادی)
              <input
                name="date"
                type="date"
                required
                max={today()}
                defaultValue={today()}
              />
            </label>
            <button className="primary" disabled={busy}>
              تأیید ثبت
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}
