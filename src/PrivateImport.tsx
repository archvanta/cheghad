import { useEffect, useState } from "react";
import { Modal } from "./EntryEditor";
import { money, type Ledger } from "./finance";
import { migrate } from "./store";
export function mergePrivateImport(current: Ledger, incoming: Ledger): Ledger {
  const existing = new Set(current.entries.map((e) => e.id));
  const entries = incoming.entries.filter((e) => !existing.has(e.id));
  const paymentIds = new Set(current.payments.map((p) => p.id));
  return {
    ...current,
    profile:
      current.entries.length === 0 &&
      current.payments.length === 0 &&
      current.revision === 0
        ? incoming.profile
        : current.profile,
    entries: [...current.entries, ...entries],
    payments: [
      ...current.payments,
      ...incoming.payments.filter(
        (p) => !paymentIds.has(p.id) && !existing.has(p.entryId),
      ),
    ],
  };
}
export default function PrivateImport({
  ledger,
  commit,
}: {
  ledger: Ledger;
  commit: (fn: (l: Ledger) => Ledger, action: string) => Promise<boolean>;
}) {
  const [incoming, setIncoming] = useState<Ledger | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    const prefix = "#cheghad-import=";
    if (!location.hash.startsWith(prefix)) return;
    const encoded = location.hash.slice(prefix.length);
    history.replaceState(null, "", location.pathname + location.search);
    try {
      if (encoded.length > 150000) throw Error();
      const json = new TextDecoder().decode(
        Uint8Array.from(
          atob(encoded.replace(/-/g, "+").replace(/_/g, "/")),
          (c) => c.charCodeAt(0),
        ),
      );
      setIncoming(migrate(JSON.parse(json)));
    } catch {
      setError("فایل انتقال خصوصی معتبر نیست؛ دفتر فعلی تغییر نکرد.");
    }
  }, []);
  if (error && !incoming)
    return (
      <p className="notice danger" role="alert">
        {error}
      </p>
    );
  if (!incoming) return null;
  const existing = new Set(ledger.entries.map((e) => e.id));
  const fresh = incoming.entries.filter((e) => !existing.has(e.id));
  return (
    <Modal title="ورود خصوصی اطلاعات دفتر" close={() => setIncoming(null)}>
      <p>
        این اطلاعات فقط پس از انتخاب «واردکردن» در دفتر فعلی ذخیره می‌شود؛ در
        نسخهٔ عمومی سایت قرار ندارد.
      </p>
      <p className="muted">
        درآمدهای مورد انتظار، دریافت‌شده نیستند. اقساط و هزینه‌ها هم تا ثبت
        پرداخت، برنامه‌اند.
      </p>
      <p>
        {fresh.length.toLocaleString("fa-IR")} ردیف جدید · نقد افتتاحیه{" "}
        {money(incoming.profile.cash)}
      </p>
      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th>عنوان</th>
              <th>ماه شروع</th>
              <th>مبلغ</th>
              <th>وضعیت</th>
            </tr>
          </thead>
          <tbody>
            {fresh.map((e) => (
              <tr key={e.id}>
                <td>{e.name}</td>
                <td>
                  {e.month}
                  {e.repeat ? " و ماه‌های بعد" : ""}
                </td>
                <td>{e.amount === null ? "نامشخص" : money(e.amount)}</td>
                <td>{e.confirmed ? "برنامه" : "نیازمند تأیید"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {ledger.revision > 0 && (
        <p className="muted">
          تنظیمات و ردیف‌های فعلی حفظ می‌شوند؛ ردیف تکراری دوباره افزوده
          نمی‌شود.
        </p>
      )}
      {error && (
        <p className="notice danger" role="alert">
          {error}
        </p>
      )}
      <button
        className="button primary"
        disabled={busy || fresh.length === 0}
        onClick={async () => {
          setBusy(true);
          if (
            await commit(
              (l) => mergePrivateImport(l, incoming),
              "ورود خصوصی اطلاعات تأییدشده مالک دفتر",
            )
          )
            setIncoming(null);
          else setError("ورود اطلاعات انجام نشد؛ نسخه قبلی محفوظ است.");
          setBusy(false);
        }}
      >
        واردکردن اطلاعات در دفتر من
      </button>
    </Modal>
  );
}
