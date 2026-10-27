// Layout and gradient palette adapted from the user's Finance Bento reference.
// All figures are derived from the local ledger; no demo returns or market rates.
import { useId, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from "recharts";
import {
  amountAt,
  cashflow,
  million,
  money,
  today,
  type Ledger,
} from "../../finance";
import {
  dashboardHistory,
  dashboardSnapshot,
  upcomingPayments,
} from "../../dashboard";
import "./finance-bento.css";

type Destination =
  "درآمد و هزینه" | "اقساط" | "طلا و دلار" | "تنظیمات" | "شبیه‌ساز";
interface FinanceBentoProps {
  ledger: Ledger;
  month: string;
  onNavigate: (destination: Destination) => void;
}
const months = [
  "فروردین",
  "اردیبهشت",
  "خرداد",
  "تیر",
  "مرداد",
  "شهریور",
  "مهر",
  "آبان",
  "آذر",
  "دی",
  "بهمن",
  "اسفند",
];
const monthLabel = (month: string) => months[Number(month.split("-")[1]) - 1];
const number = (value: number | string) =>
  Number(value).toLocaleString("fa-IR", { maximumFractionDigits: 6 });
const maybeMoney = (value: number | null) =>
  value === null ? "نیازمند تکمیل" : million(value);
const tooltipStyle = {
  background: "#141416",
  border: "1px solid #555",
  borderRadius: 16,
  color: "#fff",
  direction: "rtl" as const,
};

function Meter({ value }: { value: number }) {
  return (
    <div
      className="fb-meter"
      role="meter"
      aria-label="پیشرفت ذخیره نقدی"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value * 100)}
    >
      {Array.from({ length: 36 }, (_, i) => (
        <i key={i} className={i / 36 < value ? "on" : ""} />
      ))}
    </div>
  );
}
function Gauge({ share, unknown }: { share: number; unknown: boolean }) {
  return (
    <div className="fb-gauge">
      <svg
        viewBox="0 0 320 185"
        role="img"
        aria-label={
          unknown
            ? "نرخ دارایی نامشخص"
            : `${number(share * 100)} درصد از دارایی مثبت به طلا و دلار اختصاص دارد`
        }
      >
        {Array.from({ length: 65 }, (_, i) => {
          const angle = Math.PI + (i / 64) * Math.PI;
          return (
            <line
              key={i}
              x1={160 + Math.cos(angle) * 125}
              y1={155 + Math.sin(angle) * 125}
              x2={160 + Math.cos(angle) * 143}
              y2={155 + Math.sin(angle) * 143}
              stroke={
                unknown || i / 64 >= share
                  ? "#5b5b62"
                  : i / 64 < share * 0.68
                    ? "#b2b4ff"
                    : "#ffb37a"
              }
              strokeWidth="3.2"
              strokeLinecap="round"
            />
          );
        })}
      </svg>
      <div>
        <strong>
          {unknown ? "—" : number(Math.round(share * 100))}
          <small>٪</small>
        </strong>
        <span>سهم طلا و دلار</span>
      </div>
    </div>
  );
}
export function FinanceBento({ ledger, month, onNavigate }: FinanceBentoProps) {
  const [period, setPeriod] = useState(12);
  const gradient = useId().replace(/:/g, "");
  const current = useMemo(() => dashboardSnapshot(ledger), [ledger]);
  const history = useMemo(
    () => dashboardHistory(ledger, period),
    [ledger, period],
  );
  const flow = useMemo(() => dashboardHistory(ledger, 6), [ledger]);
  const upcoming = useMemo(() => upcomingPayments(ledger), [ledger]);
  const plan = cashflow(ledger, month),
    [gold, usd] = current.assets;
  const positiveTotal =
    Math.max(0, current.cash) + (gold.value ?? 0) + (usd.value ?? 0);
  const share =
    positiveTotal > 0
      ? ((gold.value ?? 0) + (usd.value ?? 0)) / positiveTotal
      : 0;
  const reserveProgress =
    ledger.profile.reserve > 0
      ? Math.max(0, Math.min(1, current.cash / ledger.profile.reserve))
      : 0;
  const actualFlow = flow.at(-1)!;
  return (
    <div className="finance-bento">
      <div className="fb-toolbar">
        <p>
          نمای کلی دارایی‌های واقعی <span>· نرخ‌ها دستی‌اند</span>
        </p>
        <div
          role="group"
          aria-label="بازه نمودار دارایی"
          className="fb-segment"
        >
          {[1, 3, 12].map((n) => (
            <button
              key={n}
              aria-pressed={period === n}
              onClick={() => setPeriod(n)}
            >
              {n === 12 ? "یک سال" : `${number(n)} ماه`}
            </button>
          ))}
        </div>
      </div>
      {ledger.entries.length === 0 && (
        <div className="fb-empty">
          <span>دفترت آماده است؛ اولین درآمد یا هزینه را ثبت کن.</span>
          <button onClick={() => onNavigate("درآمد و هزینه")}>
            شروع ثبت اطلاعات ←
          </button>
        </div>
      )}
      <div className="fb-grid">
        <section
          className="fb-card fb-blue fb-networth"
          aria-label="دارایی خالص"
        >
          <div className="fb-row">
            <h2>دارایی خالص</h2>
            <div className="fb-legend">
              <span>
                <i className="cash-dot" />
                نقد
              </span>
              <span>
                <i className="gold-dot" />
                طلا
              </span>
              <span>
                <i className="usd-dot" />
                دلار
              </span>
            </div>
          </div>
          <div className="fb-netnumber">
            {current.netWorth === null ? (
              <strong>نیازمند تکمیل</strong>
            ) : (
              <strong>
                {number(current.netWorth / 1e6)}
                <small>میلیون تومان</small>
              </strong>
            )}
          </div>
          <p className="fb-note">
            نقد و دارایی با نرخ فعلی، پس از کسر بدهی {maybeMoney(current.debt)}
          </p>
          <div className="fb-stream" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={history}
                stackOffset="silhouette"
                margin={{ top: 16, right: 0, bottom: 0, left: 0 }}
              >
                <defs>
                  <linearGradient id={gradient} x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#fff" stopOpacity=".1" />
                    <stop offset="45%" stopColor="#fff" stopOpacity="1" />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="month"
                  tickFormatter={monthLabel}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#ffffffb3", fontSize: 11 }}
                  minTickGap={20}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelFormatter={(label) => monthLabel(String(label))}
                  formatter={(v, name) => [
                    v == null ? "نامشخص" : `${number(Number(v))} میلیون تومان`,
                    name,
                  ]}
                />
                <Area
                  type="monotone"
                  dataKey="cashArea"
                  name="نقد مثبت"
                  stackId="assets"
                  stroke="none"
                  fill={`url(#${gradient})`}
                  isAnimationActive={false}
                />
                <Area
                  type="monotone"
                  dataKey="gold"
                  name="طلا"
                  stackId="assets"
                  stroke="none"
                  fill="#b2b4ff"
                  isAnimationActive={false}
                />
                <Area
                  type="monotone"
                  dataKey="usd"
                  name="دلار"
                  stackId="assets"
                  stroke="none"
                  fill="#ffb37a"
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <small className="fb-chart-note">
            ترکیب دارایی ثبت‌شده با نرخ دستی امروز؛ نمودار، بازده تاریخی قیمت
            نیست.
          </small>
        </section>
        <section
          className="fb-card fb-graph fb-allocation"
          aria-label="ترکیب دارایی"
        >
          <div className="fb-row">
            <h2>ترکیب دارایی</h2>
            <span className="fb-chip">طلا · دلار · نقد</span>
          </div>
          <Gauge
            share={share}
            unknown={gold.value === null || usd.value === null}
          />
          <div className="fb-asset-list">
            {[
              ["طلا", gold.value, "gold-dot"],
              ["دلار", usd.value, "usd-dot"],
              ["نقد", current.cash, "cash-dot"],
            ].map(([name, value, color]) => (
              <div key={String(name)}>
                <span>
                  <i className={String(color)} />
                  {name}
                </span>
                <b>{maybeMoney(value as number | null)}</b>
              </div>
            ))}
          </div>
          {current.cash < 0 && (
            <small className="fb-note">
              کسری نقد در درصد سهم لحاظ نمی‌شود؛ در دارایی خالص کسر شده است.
            </small>
          )}
        </section>
        <section className="fb-card fb-lime fb-kpi" aria-label="سود دارایی‌ها">
          <span className="fb-cap">سود تحقق‌نیافتهٔ دارایی‌ها</span>
          <strong className="fb-value">
            {current.gainPct === null
              ? "—"
              : `${current.gainPct >= 0 ? "↑" : "↓"} ${number(Math.abs(current.gainPct).toFixed(1))}٪`}
          </strong>
          <span>{maybeMoney(current.gain)}</span>
          <small className="fb-note">طلا و دلار · نسبت به بهای موجودی</small>
        </section>
        <section className="fb-card fb-glass fb-kpi" aria-label="نقد آزاد">
          <span className="fb-cap">نقد آزاد پس از ذخیره</span>
          <strong className="fb-value">
            {million(current.cash - ledger.profile.reserve)}
          </strong>
          <Meter value={reserveProgress} />
          <small className="fb-note">
            نقد واقعی {million(current.cash)}؛ درآمد مورد انتظار، نقد نیست.
          </small>
        </section>
        <section
          className="fb-card fb-glass fb-kpi fb-payments"
          aria-label="پرداخت‌های پیش رو"
        >
          <span className="fb-cap">پرداخت‌های پیش رو</span>
          {upcoming.length === 0 ? (
            <p className="fb-note">پرداخت بازی تا پایان ماه آینده ثبت نشده.</p>
          ) : (
            upcoming.map((r) => (
              <button
                key={r.entry.id + r.month}
                onClick={() =>
                  onNavigate(
                    r.entry.kind === "installment" ? "اقساط" : "درآمد و هزینه",
                  )
                }
              >
                <span className="fb-payment-icon">
                  {r.entry.kind === "installment" ? "ق" : "ه"}
                </span>
                <span>{r.entry.name}</span>
                <small>
                  {r.date < today()
                    ? "معوق"
                    : `${monthLabel(r.month)} ${number(r.entry.day)}`}
                </small>
                <b>
                  {amountAt(r.entry, r.month) === null
                    ? "نامشخص"
                    : million(r.remaining)}
                </b>
              </button>
            ))
          )}
        </section>
        <section
          className="fb-card fb-glass fb-kpi"
          aria-label="هدف ذخیره نقدی"
        >
          <div className="fb-row">
            <span className="fb-cap">هدف ذخیره نقدی</span>
            <b>{number(Math.round(reserveProgress * 100))}٪</b>
          </div>
          <p>
            {ledger.profile.reserve > 0
              ? money(ledger.profile.reserve)
              : "هنوز هدفی تعیین نکردی"}
          </p>
          <Meter value={reserveProgress} />
          <button className="fb-link" onClick={() => onNavigate("تنظیمات")}>
            تنظیم هدف و نرخ‌ها ←
          </button>
        </section>
        <section
          className="fb-card fb-pink fb-flow"
          aria-label="جریان نقد واقعی"
        >
          <div className="fb-row">
            <h2>جریان نقد واقعی</h2>
            <span className="fb-note">۶ ماه</span>
          </div>
          <p className="fb-note">
            خالص این ماه{" "}
            <b>{million((actualFlow.incoming - actualFlow.outgoing) * 1e6)}</b>{" "}
            · فقط دریافت‌ها و پرداخت‌های ثبت‌شده
          </p>
          <div className="fb-flowchart" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={flow}
                margin={{ top: 12, right: 10, left: 10, bottom: 0 }}
              >
                <CartesianGrid vertical={false} stroke="#ffffff22" />
                <XAxis
                  dataKey="month"
                  tickFormatter={monthLabel}
                  tick={{ fill: "#ffffffb3", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelFormatter={(label) => monthLabel(String(label))}
                  formatter={(v, name) => [
                    `${number(Number(v))} میلیون تومان`,
                    name,
                  ]}
                />
                <Area
                  type="monotone"
                  dataKey="incoming"
                  name="ورودی"
                  stroke="#fff"
                  strokeWidth={2}
                  fill="#ffffff12"
                  isAnimationActive={false}
                />
                <Area
                  type="monotone"
                  dataKey="outgoing"
                  name="خروجی"
                  stroke="#ffd0e6"
                  strokeWidth={2}
                  fill="#ffb3d61a"
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="fb-legend">
            <span>
              <i className="cash-dot" />
              ورودی
            </span>
            <span>
              <i className="flow-dot" />
              خروجی
            </span>
          </div>
        </section>
        <section className="fb-card fb-copper fb-gold" aria-label="دارایی طلا">
          <div className="fb-row">
            <h2>طلا</h2>
            <span className="fb-chip">نرخ دستی</span>
          </div>
          <strong className="fb-value">{maybeMoney(gold.value)}</strong>
          <p className="fb-note">{number(gold.quantity)} گرم طلای ثبت‌شده</p>
          <div className="fb-asset-list">
            <div>
              <span>قیمت هر گرم</span>
              <b>
                {ledger.profile.goldPrice === null
                  ? "نامشخص"
                  : money(ledger.profile.goldPrice)}
              </b>
            </div>
            <div>
              <span>بهای موجودی</span>
              <b>{maybeMoney(gold.cost)}</b>
            </div>
            <div>
              <span>سود محقق‌شده</span>
              <b>{maybeMoney(gold.realized)}</b>
            </div>
          </div>
          <button className="fb-link" onClick={() => onNavigate("طلا و دلار")}>
            ثبت خرید یا فروش طلا ←
          </button>
        </section>
        <section className="fb-card fb-green fb-usd" aria-label="دارایی دلار">
          <div className="fb-row">
            <h2>دلار</h2>
            <span className="fb-chip">USD</span>
          </div>
          <strong className="fb-value">{maybeMoney(usd.value)}</strong>
          <p className="fb-note">
            {number(usd.quantity)} دلار · نرخ{" "}
            {ledger.profile.usdPrice === null
              ? "نامشخص"
              : money(ledger.profile.usdPrice)}
          </p>
          <div className="fb-usdchart" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={flow.slice(-5)}>
                <XAxis
                  dataKey="month"
                  tickFormatter={monthLabel}
                  tick={{ fill: "#ffffffb3", fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelFormatter={(label) => monthLabel(String(label))}
                  formatter={(v) => [
                    `${number(Number(v))} میلیون تومان`,
                    "خرید منهای فروش",
                  ]}
                />
                <Bar
                  dataKey="usdTrade"
                  fill="#e8ff1f"
                  radius={12}
                  maxBarSize={24}
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <button className="fb-link" onClick={() => onNavigate("طلا و دلار")}>
            خرید و فروش دلار · ۵ ماه اخیر ←
          </button>
        </section>
      </div>
      <div className="fb-plan">
        <span>
          {monthLabel(month)} · برنامهٔ درآمد {million(plan.income)} · هزینه{" "}
          {million(plan.expenses)} · اقساط {million(plan.installments)}
        </span>
        <button onClick={() => onNavigate("شبیه‌ساز")}>
          طلا بخرم یا بدهی بدهم؟ ←
        </button>
      </div>
      {plan.unknown > 0 && (
        <p className="notice">
          بعضی مبالغ برنامه نامعلوم یا تأییدنشده‌اند؛ برای پیش‌بینی کامل، آن‌ها
          را تکمیل کن.
        </p>
      )}
    </div>
  );
}
export default FinanceBento;
