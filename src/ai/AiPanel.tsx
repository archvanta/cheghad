import { useEffect, useRef, useState } from "react";
import { Send, MessageCircle } from "lucide-react";
import { z } from "zod";
import {
  aiResponseSchema,
  proposalSchema,
  buildContext,
  hashContext,
  canonical,
  applyApproved,
  endpointUrl,
  type Proposal,
} from "./protocol";
import { money, type Ledger } from "../finance";
type Props = {
  ledger: Ledger;
  month: string;
  endpoint: string;
  commit: (fn: (l: Ledger) => Ledger, action: string) => Promise<boolean>;
};
const fieldNames: Record<string, string> = {
  name: "عنوان",
  amount: "مبلغ (تومان)",
  category: "دسته",
  note: "یادداشت",
};
export default function AiPanel({ ledger, month, endpoint, commit }: Props) {
  const [chat, setChat] = useState<
      { role: "user" | "assistant"; text: string }[]
    >([]),
    [prompt, setPrompt] = useState(""),
    [loading, setLoading] = useState(false),
    [pending, setPending] = useState<Proposal | null>(null),
    [consent, setConsent] = useState(false),
    [approved, setApproved] = useState(false),
    [includeNotes, setIncludeNotes] = useState(false),
    [selected, setSelected] = useState<string[]>(
      ledger.entries.slice(0, 200).map((e) => e.id),
    ),
    [error, setError] = useState("");
  const abort = useRef<AbortController | null>(null);
  useEffect(() => {
    abort.current?.abort();
    setConsent(false);
    setPending(null);
    setApproved(false);
    return () => abort.current?.abort();
  }, [endpoint]);
  useEffect(() => {
    setPending(null);
    setApproved(false);
    setConsent(false);
  }, [ledger.revision, month, includeNotes, selected]);
  const getContext = () => buildContext(ledger, month, includeNotes, selected);
  let preview: ReturnType<typeof buildContext> | null = null;
  try {
    preview = getContext();
  } catch {}
  async function request(path: string, body: unknown) {
    const base = endpointUrl(endpoint);
    const response = await fetch(base + path, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", "X-Cheghad-Request": "1" },
      body: JSON.stringify(body),
      signal: abort.current?.signal,
    });
    if (!response.ok) {
      if (response.status === 401)
        throw Error("ابتدا با پیوند ورود امن، به بک‌اند خودت وارد شو");
      const result = (await response
        .json()
        .catch(() => ({ error: "سرور پاسخ JSON معتبر نداد" }))) as {
        error?: string;
      };
      throw Error(result.error ?? `خطای سرور ${response.status}`);
    }
    if (!response.headers.get("Content-Type")?.includes("application/json"))
      throw Error("بک‌اند پاسخ ورود یا HTML داد؛ ابتدا ورود امن را کامل کن");
    return response.json() as Promise<unknown>;
  }
  async function send() {
    if (!prompt.trim() || loading || !consent || !preview) return;
    const message = prompt.trim();
    setError("");
    setPrompt("");
    setPending(null);
    setApproved(false);
    setLoading(true);
    abort.current = new AbortController();
    const timeout = setTimeout(() => abort.current?.abort(), 45000);
    try {
      const context = getContext();
      setChat((v) => [...v, { role: "user", text: message }]);
      const result = aiResponseSchema.parse(
        await request("/chat", { message, context, consent: true }),
      );
      if (
        result.proposal &&
        (result.proposal.contextHash !== (await hashContext(context)) ||
          result.proposal.revision !== ledger.revision)
      )
        throw Error("پیشنهاد به داده ارسال‌شده تعلق ندارد");
      setChat((v) => [...v, { role: "assistant", text: result.reply }]);
      setPending(result.proposal);
    } catch (e) {
      setError(e instanceof Error ? e.message : "پاسخ معتبر دریافت نشد");
    } finally {
      clearTimeout(timeout);
      setLoading(false);
    }
  }
  async function approve() {
    if (!pending || !approved || loading) return;
    setLoading(true);
    setError("");
    abort.current = new AbortController();
    const timeout = setTimeout(() => abort.current?.abort(), 30000);
    try {
      const current = getContext(),
        hash = await hashContext(current);
      if (current.revision !== pending.revision || hash !== pending.contextHash)
        throw Error(
          "داده‌ها از زمان پیشنهاد تغییر کرده‌اند؛ دوباره درخواست بده",
        );
      const result = z
        .object({ proposal: proposalSchema })
        .strict()
        .parse(
          await request("/approve", {
            id: pending.id,
            contextHash: hash,
            revision: current.revision,
            confirmed: true,
          }),
        );
      if (canonical(result.proposal) !== canonical(pending))
        throw Error("پیشنهاد سرور هنگام تأیید تغییر کرده است");
      const ok = await commit(
        (l) => applyApproved(l, result.proposal),
        "تأیید پیشنهاد Gemini",
      );
      setPending(null);
      setApproved(false);
      if (!ok)
        throw Error(
          "تأیید سرور دریافت شد ولی ذخیره محلی انجام نشد؛ پس از رفع مشکل پیشنهاد تازه بگیر",
        );
      setChat((v) => [
        ...v,
        {
          role: "assistant",
          text: "تغییر تأییدشده در مرورگر ذخیره شد؛ جدول و گزارش دوباره محاسبه شدند.",
        },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "تغییر انجام نشد");
    } finally {
      clearTimeout(timeout);
      setLoading(false);
    }
  }
  const op = pending?.operation;
  const before =
    op?.action === "update_entry"
      ? preview?.entries.find((e) => e.id === op.entryId)
      : null;
  return (
    <section className="panel chatpanel">
      <div className="panelhead">
        <div>
          <h2>دستیار هوش مصنوعی Gemini</h2>
          <p>
            فقط پیشنهاد؛ هر تغییر مالی نیازمند بررسی، تأیید سرور و ذخیره محلی
            است.
          </p>
        </div>
        <span className="tag">
          {endpoint ? "نیازمند ورود امن" : "آفلاین؛ بک‌اند تنظیم نشده"}
        </span>
      </div>
      {!endpoint && (
        <p className="notice">
          برنامه مالی بدون AI کاملاً آفلاین کار می‌کند. برای فعال‌کردن AI، نشانی
          بک‌اند امن خودت را در تنظیمات وارد کن؛ کلید AI Studio را در مرورگر
          ننویس.
        </p>
      )}
      {endpoint && (
        <a
          className="button"
          href={endpointUrl(endpoint) + "/session"}
          target="_blank"
          rel="noopener noreferrer"
        >
          ورود امن به بک‌اند
        </a>
      )}
      <details>
        <summary>انتخاب رکوردها و بررسی دقیق اطلاعات ارسالی</summary>
        <p>
          حداکثر ۲۰۰ رکورد در هر درخواست. جمع‌های رسمی از کل دفتر محاسبه
          شده‌اند؛ فقط رکوردهای انتخاب‌شده قابل پیشنهاد تغییرند.
        </p>
        <div className="ai-selection">
          {ledger.entries.map((e) => (
            <label className="check" key={e.id}>
              <input
                type="checkbox"
                checked={selected.includes(e.id)}
                disabled={!selected.includes(e.id) && selected.length >= 200}
                onChange={(event) =>
                  setSelected((ids) =>
                    event.target.checked
                      ? [...ids, e.id]
                      : ids.filter((id) => id !== e.id),
                  )
                }
              />
              {e.name}
            </label>
          ))}
        </div>
        <label className="check">
          <input
            type="checkbox"
            checked={includeNotes}
            onChange={(e) => {
              setIncludeNotes(e.target.checked);
              setConsent(false);
            }}
          />
          یادداشت‌های خصوصی هم ارسال شوند
        </label>
        <pre>
          {preview
            ? JSON.stringify(preview, null, 2)
            : "اطلاعات برای ارسال آماده نیست"}
        </pre>
      </details>
      <label className="check consent">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
        />
        اجازه می‌دهم اطلاعات نمایش‌داده‌شده به بک‌اند خودم و Google Gemini ارسال
        شود
      </label>
      {error && (
        <p className="notice danger" role="alert">
          {error}
        </p>
      )}
      <div className="messages" aria-live="polite">
        {!chat.length && (
          <div className="empty">
            <MessageCircle />
            <h3>از عددهای خودت بپرس</h3>
            <p>
              مثلاً مبلغ یک هزینه را تغییر بده؛ قبل از ذخیره تفاوت را می‌بینی.
            </p>
          </div>
        )}
        {chat.map((m, i) => (
          <div className={"bubble " + m.role} key={i}>
            {m.text}
          </div>
        ))}
        {loading && <p role="status">در حال بررسی…</p>}
      </div>
      <p className="muted">
        متن Gemini ممکن است خطا داشته باشد؛ محاسبات رسمی برنامه از موتور مالی
        مستقل می‌آیند. AI مجاز به ثبت پرداخت یا تغییر موجودی نقد نیست.
      </p>
      {pending && (
        <section className="proposal" aria-label="پیشنهاد نیازمند تأیید">
          <h3>بررسی تغییر پیشنهادی</h3>
          {pending.operation.action === "update_entry" ? (
            <>
              <p>
                رکورد: {before?.name} · از ماه {pending.operation.fromMonth}
              </p>
              <dl>
                {Object.entries(pending.operation.changes).map(
                  ([key, value]) => (
                    <div key={key}>
                      <dt>{fieldNames[key]}</dt>
                      <dd>
                        <del>
                          {key === "amount"
                            ? before?.amount === null
                              ? "نامشخص"
                              : money(before?.amount ?? 0)
                            : String(before?.[key as "name"] ?? "—")}
                        </del>{" "}
                        ←{" "}
                        <strong>
                          {key === "amount"
                            ? value === null
                              ? "نامشخص"
                              : money(Number(value))
                            : String(value)}
                        </strong>
                      </dd>
                    </div>
                  ),
                )}
              </dl>
            </>
          ) : (
            <>
              <p>
                افزودن رکورد برنامه‌ریزی‌شده و نیازمند تأیید؛ دریافت یا پرداخت
                ثبت نمی‌شود.
              </p>
              <pre>{JSON.stringify(pending.operation.entry, null, 2)}</pre>
            </>
          )}
          <label className="check">
            <input
              type="checkbox"
              checked={approved}
              onChange={(e) => setApproved(e.target.checked)}
            />
            تغییر نمایش‌داده‌شده را بررسی کردم و می‌پذیرم
          </label>
          <div className="actions">
            <button
              className="button primary"
              disabled={!approved || loading}
              onClick={approve}
            >
              تأیید و ذخیره تغییر
            </button>
            <button
              className="button"
              disabled={loading}
              onClick={() => {
                setPending(null);
                setApproved(false);
              }}
            >
              لغو پیشنهاد
            </button>
          </div>
        </section>
      )}
      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <label className="sr-only" htmlFor="ai-message">
          درخواست از Gemini
        </label>
        <input
          id="ai-message"
          value={prompt}
          maxLength={2000}
          placeholder="مثلاً مبلغ هزینه انتخاب‌شده را تغییر بده…"
          onChange={(e) => setPrompt(e.target.value)}
        />
        <button
          className="button primary"
          aria-label="ارسال درخواست به Gemini"
          disabled={
            loading || !consent || !endpoint || !preview || !prompt.trim()
          }
        >
          <Send size={18} />
        </button>
      </form>
    </section>
  );
}
