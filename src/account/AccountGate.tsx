import { isDemoMode, setDemoMode } from "./mode";
import { demoLedger } from "../demo";
import { purge, save } from "../store";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import Brand from "../Brand";
import {
  accountRequest,
  cloudEnabled,
  passwordCredential,
  resetAccountCache,
} from "./api";
const AccountContext = createContext<{
  username: string;
  logout: () => Promise<void>;
} | null>(null);
export function AccountBar() {
  const account = useContext(AccountContext);
  return account ? (
    <div className="account-bar">
      <span>
        {isDemoMode()
          ? "حالت دمو · داده‌های نمونه و جدا از دفتر واقعی"
          : "حساب " + account.username + " · ذخیره خصوصی"}
      </span>
      <button className="mini" onClick={() => void account.logout()}>
        {isDemoMode() ? "بازگشت به ورود" : "خروج از حساب"}
      </button>
    </div>
  ) : null;
}
export default function AccountGate({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<string | null>(null),
    [loading, setLoading] = useState(cloudEnabled),
    [signup, setSignup] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    if (!cloudEnabled) return;
    let active = true;
    accountRequest("/accounts/session")
      .then((v) => {
        if (active) setUser(v.username);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });
    const expired = () => {
      resetAccountCache();
      setUser(null);
    };
    window.addEventListener("cheghad-session-expired", expired);
    return () => {
      active = false;
      window.removeEventListener("cheghad-session-expired", expired);
    };
  }, []);
  if (loading)
    return (
      <main className="account-screen" role="status">
        در حال بررسی حساب…
      </main>
    );
  const logout = async () => {
    if (isDemoMode()) {
      setDemoMode(false);
      resetAccountCache();
      setUser(null);
      return;
    }
    try {
      await accountRequest("/accounts/logout", "POST", {});
      resetAccountCache();
      setUser(null);
      setError("");
    } catch {
      setError("خروج از حساب انجام نشد؛ دوباره تلاش کن");
    }
  };
  if (user)
    return (
      <AccountContext.Provider value={{ username: user, logout }}>
        {error && <p role="alert">{error}</p>}
        {children}
      </AccountContext.Provider>
    );
  return (
    <main className="account-screen">
      <section className="panel account-panel">
        <Brand />
        <h1>{signup ? "حساب خودت را بساز" : "به چقدر خوش آمدی"}</h1>
        <p className="muted">
          با نام کاربری و رمز وارد شو؛ ایمیل یا حساب گوگل لازم نیست. دفتر هر
          حساب خصوصی و جداست.
        </p>
        {!cloudEnabled && (
          <p className="notice" role="status">
            ورود و ثبت‌نام حساب هنوز روی این آدرس فعال نشده است. فعلاً می‌توانی
            دمو را ببینی؛ اطلاعات شخصی در دمو قرار ندارد.
          </p>
        )}
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!cloudEnabled) {
              setError(
                "ورود حساب هنوز روی این آدرس فعال نشده است؛ می‌توانی داشبورد نمونه را در حالت دمو ببینی.",
              );
              return;
            }
            if (busy) return;
            const form = e.currentTarget,
              f = new FormData(form),
              username = String(f.get("username")).trim().toLowerCase(),
              password = String(f.get("password"));
            if (
              !/^[a-z0-9_]{3,32}$/.test(username) ||
              password.length < 12 ||
              password.length > 128
            ) {
              setError(
                "نام کاربری انگلیسی ۳ تا ۳۲ کاراکتر و رمز ۱۲ تا ۱۲۸ کاراکتر لازم است",
              );
              return;
            }
            if (signup && password !== f.get("confirm")) {
              setError("تکرار رمز یکسان نیست");
              return;
            }
            setBusy(true);
            setError("");
            try {
              const credential = await passwordCredential(username, password);
              const result = await accountRequest(
                "/accounts/" + (signup ? "signup" : "login"),
                "POST",
                { username, credential, version: 1 },
              );
              form.reset();
              setDemoMode(false);
              resetAccountCache();
              setUser(result.username);
            } catch (e) {
              setError(e instanceof Error ? e.message : "ورود انجام نشد");
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            نام کاربری
            <input
              name="username"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              dir="ltr"
              required
              pattern="[A-Za-z0-9_]{3,32}"
              defaultValue={
                new URLSearchParams(location.search).get("username") || ""
              }
            />
          </label>
          <label>
            رمز عبور
            <input
              name="password"
              type="password"
              autoComplete={signup ? "new-password" : "current-password"}
              minLength={12}
              maxLength={128}
              dir="ltr"
              required
            />
          </label>
          {signup && (
            <label>
              تکرار رمز عبور
              <input
                name="confirm"
                type="password"
                autoComplete="new-password"
                minLength={12}
                maxLength={128}
                dir="ltr"
                required
              />
            </label>
          )}
          {error && (
            <p role="alert" className="notice danger">
              {error}
            </p>
          )}
          <button className="button primary" disabled={busy}>
            {busy ? "در حال انجام…" : signup ? "ساخت حساب" : "ورود"}
          </button>
        </form>
        <button
          className="mini"
          disabled={busy}
          onClick={() => {
            setSignup(!signup);
            setError("");
          }}
        >
          {signup ? "حساب دارم؛ وارد می‌شوم" : "حساب ندارم؛ ثبت‌نام می‌کنم"}
        </button>
        <button
          className="button demo-button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              setDemoMode(true);
              resetAccountCache();
              await purge();
              await save(demoLedger(), "شروع دموی نمونه");
              setUser("demo");
            } catch {
              setDemoMode(false);
              setError("دمو باز نشد؛ ذخیره‌سازی مرورگر را بررسی کن.");
            } finally {
              setBusy(false);
            }
          }}
        >
          مشاهده دمو
        </button>
        <p className="muted">
          رمز را در جای امن نگه دار؛ بازیابی با ایمیل وجود ندارد.
        </p>
      </section>
    </main>
  );
}
