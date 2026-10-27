import { useId, useMemo, useState } from "react";
import { cashflow, million, nextMonth, type Ledger } from "./finance";
import { compareStrategies } from "./strategy";

const monthName = (month: string) => {
  const [year, n] = month.split("-").map(Number);
  return `${["فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور", "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"][n - 1]} ${year}`;
};
export default function StrategyComparison({
  ledger,
  start,
}: {
  ledger: Ledger;
  start: string;
}) {
  const id = useId();
  const [retained, setRetained] = useState(10),
    [initial, setInitial] = useState(15);
  const max = Math.max(
    18,
    retained,
    ...Array.from(
      { length: 3 },
      (_, i) => cashflow(ledger, nextMonth(start, i)).income / 1e6,
    ),
  );
  const result = useMemo(() => {
    try {
      return {
        value: compareStrategies(ledger, start, initial * 1e6, retained * 1e6),
        error: "",
      };
    } catch (e) {
      return {
        value: null,
        error: e instanceof Error ? e.message : "محاسبه ممکن نشد",
      };
    }
  }, [ledger, start, initial, retained]);
  const value = result.value;
  return (
    <section
      className="panel strategy-comparison"
      aria-labelledby={id + "-title"}
    >
      <h3 id={id + "-title"}>مقایسهٔ خرید طلا یا پرداخت بدهی</h3>
      <p className="muted">
        سه ماه از {monthName(start)} · مبالغ به تومان و ارزش طلا با قیمت ثابت و
        بدون کارمزد
      </p>
      <label className="strategy-initial" htmlFor={id + "-initial"}>
        مبلغ تصمیم امروز (میلیون تومان)
        <input
          id={id + "-initial"}
          type="number"
          min="0"
          max="100000"
          step="0.5"
          value={initial}
          onChange={(e) =>
            setInitial(Math.max(0, Math.min(100000, Number(e.target.value))))
          }
        />
      </label>
      <div className="strategy-budget">
        <div>
          <label htmlFor={id + "-budget"}>
            <b>مبلغی که می‌خوای هر ماه برای خودت نگه داری</b>
          </label>
          <output htmlFor={id + "-budget"}>{million(retained * 1e6)}</output>
        </div>
        <p className="muted">
          شامل هزینه‌های زندگی و پول باقی‌مانده؛ هزینهٔ ثبت‌شده دوباره کسر
          نمی‌شود.
        </p>
        <input
          id={id + "-budget"}
          type="range"
          min="0"
          max={max}
          step="0.5"
          value={retained}
          onChange={(e) => setRetained(Number(e.target.value))}
        />
        <div className="muted">
          <span>۰ میلیون</span>
          <span>{million(max * 1e6)}</span>
        </div>
      </div>
      {result.error && (
        <p role="alert" className="notice danger">
          {result.error}
        </p>
      )}
      {value && (
        <>
          {value.startingFundingGap > 0 && (
            <p className="notice">
              نقد فعلی برای تصمیم امروز {million(value.startingFundingGap)} کم
              است؛ این کسری در نتیجه کسر شده و درآمد فرض نشده است.
            </p>
          )}
          {value.paidNow < initial * 1e6 && (
            <p className="muted">
              بدهی قابل تسویه {million(value.paidNow)} است؛ باقی مبلغ در حالت
              پرداخت بدهی، نقد می‌ماند.
            </p>
          )}
          <div className="tablewrap">
            <table className="strategy-table">
              <caption>مقدار طلایی که می‌تونی از درآمد هر ماه بخری</caption>
              <thead>
                <tr>
                  <th scope="col">ماه</th>
                  <th scope="col">{million(initial * 1e6)} طلا الآن</th>
                  <th scope="col">{million(value.paidNow)} بدهی الآن</th>
                </tr>
              </thead>
              <tbody>
                {value.gold.rows.map((row, i) => (
                  <tr key={row.month}>
                    <th scope="row">{monthName(row.month)}</th>
                    {[row, value.debt.rows[i]].map((r, col) => (
                      <td key={col}>
                        <b className={r.buy > 0 ? "green" : ""}>
                          {million(r.buy)}
                        </b>
                        {r.shortage > 0 && (
                          <small className="red">
                            کسری بودجه {million(r.shortage)}
                          </small>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row">جمع خرید از درآمد</th>
                  <td>{million(value.gold.monthlyGold)}</td>
                  <td>{million(value.debt.monthlyGold)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="muted">
            خرید اولیهٔ طلا در جدول خرید ماهانه نیست. کسری ماهانه باید از نقد،
            فروش دارایی یا منبع دیگری تأمین شود؛ کسری جبران‌نشده از نتیجهٔ نهایی
            کم می‌شود. خریدهای برنامه‌ریزی‌شدهٔ طلا و دلار در این مقایسه لحاظ
            نمی‌شوند.
          </p>
          <h4>
            ارزش خالص طلای قابل نگهداری تا پایان{" "}
            {monthName(nextMonth(start, 2))}
          </h4>
          <div className="strategy-results" aria-live="polite">
            {[
              ["خرید طلا الآن", value.gold],
              ["پرداخت بدهی الآن", value.debt],
            ].map(([title, raw]) => {
              const r = raw as typeof value.gold;
              return (
                <div key={String(title)} className="strategy-result">
                  <span>{String(title)}</span>
                  <strong className={r.netGold < 0 ? "red" : ""}>
                    {million(Math.max(0, r.netGold))}
                  </strong>
                  <small>
                    {r.netGold < 0
                      ? `کسری حل‌نشده: ${million(-r.netGold)}`
                      : "پس از کسر کسری نقد تا پایان دوره"}
                  </small>
                  <small>
                    نقد باقی‌مانده: {million(Math.max(0, r.cash))} · بدهی
                    باقی‌مانده: {million(r.remainingDebt)}
                  </small>
                  <small>
                    خالص این مقایسه با کسر بدهی: {million(r.netAssets)}
                  </small>
                </div>
              );
            })}
          </div>
          <p className="muted">
            طلای قبلی و دلار قبلی در نتیجهٔ این تصمیم وارد نمی‌شوند. مقایسه
            ماهانه است؛ زمان پرداخت حقوق و سررسید داخل ماه را در داشبورد بررسی
            کن. تسویهٔ زودهنگام فرضی است و دفتر واقعی تغییر نمی‌کند.
          </p>
        </>
      )}
    </section>
  );
}
