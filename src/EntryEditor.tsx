import { useEffect, useRef, useState } from "react";
import {
  entrySchema,
  amountAt,
  parseAmount,
  normalizeNumber,
  monthOf,
  type Entry,
  type Kind,
} from "./finance";
export const kindNames: Record<Kind, string> = {
  income: "درآمد",
  expense: "هزینه",
  installment: "قسط",
  goldBuy: "خرید طلا",
  goldSell: "فروش طلا",
  usdBuy: "خرید دلار",
  usdSell: "فروش دلار",
};
export function Modal({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
    return () => ref.current?.close();
  }, []);
  return (
    <dialog ref={ref} className="dialog" aria-label={title} onCancel={close}>
      <div className="panelhead">
        <h2>{title}</h2>
        <button className="mini" onClick={close} aria-label="بستن پنجره">
          ×
        </button>
      </div>
      {children}
    </dialog>
  );
}
export default function EntryEditor({
  entry,
  existing,
  hasPayments,
  month,
  busy,
  save,
  close,
}: {
  entry: Entry;
  existing: boolean;
  hasPayments: boolean;
  month: string;
  busy: boolean;
  save: (e: Entry) => Promise<boolean>;
  close: () => void;
}) {
  const [error, setError] = useState("");
  const effective = month < monthOf() ? monthOf() : month;
  return (
    <Modal title={existing ? "ویرایش اطلاعات" : "افزودن اطلاعات"} close={close}>
      {error && (
        <p role="alert" className="danger">
          {error}
        </p>
      )}
      <form
        onSubmit={async (ev) => {
          ev.preventDefault();
          const f = new FormData(ev.currentTarget);
          try {
            const amount = String(f.get("amount")).trim()
              ? parseAmount(String(f.get("amount")))
              : null;
            const from = normalizeNumber(String(f.get("from") || effective));
            if (existing && entry.repeat && from < monthOf())
              throw Error(
                "تغییر مبلغ تکرارشونده فقط از امروز یا آینده مجاز است",
              );
            let e = entrySchema.parse({
              ...entry,
              name: f.get("name"),
              kind: f.get("kind"),
              month: normalizeNumber(String(f.get("month"))),
              day: Number(normalizeNumber(String(f.get("day")))),
              repeat: f.get("repeat") === "on",
              note: f.get("note"),
              category: f.get("category"),
              amount: existing && entry.repeat ? entry.amount : amount,
              revisions:
                existing && entry.repeat
                  ? [
                      ...entry.revisions.filter((r) => r.month < from),
                      { month: from, amount },
                    ]
                  : [],
              allowEarly: f.get("early"),
              allowPartial: f.get("partial"),
              confirmed: f.get("confirmed") === "on",
              createdAt: entry.createdAt ?? new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            });
            if (
              hasPayments &&
              (e.kind !== entry.kind || e.month !== entry.month)
            )
              throw Error("نوع یا ماه شروع رکورد دارای پرداخت را تغییر نده");
            if (await save(e)) close();
          } catch (err) {
            setError(err instanceof Error ? err.message : "اطلاعات معتبر نیست");
          }
        }}
      >
        <label>
          عنوان
          <input
            name="name"
            defaultValue={entry.name}
            required
            maxLength={120}
          />
        </label>
        <label>
          نوع
          <select name="kind" defaultValue={entry.kind} disabled={hasPayments}>
            {Object.entries(kindNames).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        {hasPayments && <input type="hidden" name="kind" value={entry.kind} />}
        <label>
          مبلغ به تومان (خالی = نامشخص)
          <input
            name="amount"
            inputMode="decimal"
            defaultValue={amountAt(entry, effective) ?? ""}
          />
        </label>
        <label>
          ماه شروع شمسی (YYYY-MM)
          <input
            name="month"
            defaultValue={entry.month}
            required
            readOnly={hasPayments}
          />
        </label>
        <label>
          روز سررسید ماه
          <input
            name="day"
            inputMode="numeric"
            defaultValue={entry.day}
            required
          />
        </label>
        <p className="muted">در ماه کوتاه، سررسید به آخر ماه منتقل می‌شود.</p>
        <label className="check">
          <input name="repeat" type="checkbox" defaultChecked={entry.repeat} />
          تکرار ماهانه
        </label>
        {existing && entry.repeat && (
          <label>
            تغییر مبلغ از ماه شمسی
            <input name="from" defaultValue={effective} required />
          </label>
        )}
        <label>
          دسته
          <input
            name="category"
            defaultValue={entry.category ?? ""}
            maxLength={80}
          />
        </label>
        <label>
          یادداشت
          <textarea
            name="note"
            defaultValue={entry.note ?? ""}
            maxLength={2000}
          />
        </label>
        <label className="check">
          <input
            name="confirmed"
            type="checkbox"
            defaultChecked={entry.confirmed}
          />
          اطلاعات بررسی و تأیید شده است
        </label>
        <details>
          <summary>مجوزهای قرارداد برای اقساط</summary>
          {[
            ["early", "پرداخت زودهنگام", entry.allowEarly],
            ["partial", "پرداخت جزئی", entry.allowPartial],
          ].map(([name, label, value]) => (
            <label key={name}>
              {label}
              <select name={name} defaultValue={value}>
                <option value="unknown">نامشخص</option>
                <option value="yes">مجاز</option>
                <option value="no">غیرمجاز</option>
              </select>
            </label>
          ))}
        </details>
        <div className="actions">
          <button className="button primary" disabled={busy}>
            ذخیره
          </button>
          <button className="button" type="button" onClick={close}>
            انصراف
          </button>
        </div>
      </form>
    </Modal>
  );
}
