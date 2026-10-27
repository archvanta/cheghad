import { useState } from "react";
import Decimal from "decimal.js";
import { Modal } from "./EntryEditor";
import {
  isAsset,
  isBuy,
  remaining,
  recordPayment,
  parseAmount,
  normalizeNumber,
  today,
  round,
  money,
  type Entry,
  type Ledger,
} from "./finance";
export default function PaymentDialog({
  entry,
  month,
  ledger,
  commit,
  close,
  busy,
}: {
  entry: Entry;
  month: string;
  ledger: Ledger;
  commit: (l: Ledger) => Promise<boolean>;
  close: () => void;
  busy: boolean;
}) {
  const [error, setError] = useState(""),
    [q, setQ] = useState(""),
    [price, setPrice] = useState(
      String(
        (entry.kind.startsWith("gold")
          ? ledger.profile.goldPrice
          : ledger.profile.usdPrice) ?? "",
      ),
    ),
    [fee, setFee] = useState("0");
  let total: number | null = null;
  try {
    if (q && price)
      total = round(
        new Decimal(normalizeNumber(q))
          .mul(parseAmount(price))
          [isBuy(entry.kind) ? "add" : "sub"](parseAmount(fee)),
      );
  } catch {}
  return (
    <Modal
      title={entry.kind === "income" ? "ثبت دریافت واقعی" : "ثبت پرداخت واقعی"}
      close={close}
    >
      <p>
        {entry.name} · مانده تعهد {money(remaining(ledger, entry, month))}
      </p>
      {error && (
        <p className="danger" role="alert">
          {error}
        </p>
      )}
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            const f = new FormData(e.currentTarget),
              amount = isAsset(entry.kind)
                ? total
                : parseAmount(String(f.get("amount")));
            if (amount === null) throw Error("مشخصات معامله کامل نیست");
            const asset = isAsset(entry.kind)
              ? {
                  quantity: normalizeNumber(q),
                  unitPrice: parseAmount(price),
                  fee: parseAmount(fee),
                }
              : undefined;
            const next = recordPayment(
              ledger,
              entry.id,
              month,
              amount,
              String(f.get("date")),
              asset,
            );
            if (await commit(next)) close();
          } catch (err) {
            setError(err instanceof Error ? err.message : "پرداخت نامعتبر است");
          }
        }}
      >
        {isAsset(entry.kind) ? (
          <>
            <label>
              مقدار واقعی (گرم یا دلار)
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                required
                inputMode="decimal"
              />
            </label>
            <label>
              قیمت واقعی هر واحد (تومان)
              <input
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                required
                inputMode="decimal"
              />
            </label>
            <label>
              جمع کارمزد و هزینه معامله (تومان)
              <input
                value={fee}
                onChange={(e) => setFee(e.target.value)}
                required
                inputMode="decimal"
              />
            </label>
            <p>وجه واقعی: {total === null ? "نامشخص" : money(total)}</p>
          </>
        ) : (
          <label>
            مبلغ واقعی به تومان
            <input
              name="amount"
              inputMode="decimal"
              required
              defaultValue={remaining(ledger, entry, month)}
            />
          </label>
        )}
        <label>
          تاریخ واقعی پرداخت / دریافت (میلادی)
          <input
            name="date"
            type="date"
            required
            defaultValue={today()}
            max={today()}
          />
        </label>
        <p className="muted">
          ثبت این رویداد موجودی نقد واقعی را تغییر می‌دهد. رزرو یا برنامه‌ریزی
          را پرداخت ثبت نکن.
        </p>
        <button className="button primary" disabled={busy}>
          تأیید ثبت واقعی
        </button>
      </form>
    </Modal>
  );
}
