import { z } from "zod";
import { ledgerSchema } from "../src/finance";
import { initial } from "../src/data";
import { digest, equal, verifier } from "./crypto";
import { AccountError, GitHubLedger, type DataEnv, type StoredAccount } from "./github";

export interface AccountEnv extends DataEnv { AUTH_PEPPER: string; ASSETS?: { fetch(request: Request): Promise<Response> }; UPSTREAM?: typeof fetch; }
const username = z.string().regex(/^[a-z0-9_]{3,32}$/);
const credentials = z.object({ username, credential: z.string().regex(/^[A-Za-z0-9_-]{43}$/), version: z.literal(1) }).strict();
const SESSION_MS = 7 * 86400000, COOKIE = "__Host-cheghad";
const attempts = new Map<string, { count: number; until: number }>();
export function resetAttemptsForTest() { attempts.clear(); }
export const response = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...headers } });
async function limitedBody(req: Request, limit: number) {
  if (!req.headers.get("content-type")?.startsWith("application/json")) throw new AccountError(415, "درخواست JSON لازم است");
  if (Number(req.headers.get("content-length")) > limit) throw new AccountError(413, "حجم درخواست زیاد است");
  const text = await req.text(); if (!text || text.length > limit) throw new AccountError(413, "حجم درخواست زیاد است");
  try { return JSON.parse(text); } catch { throw new AccountError(400, "درخواست معتبر نیست"); }
}
function url64(value: string) { return value.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
function fromUrl64(value: string) { return value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - value.length % 4) % 4); }
async function sessionToken(account: StoredAccount, pepper: string) {
  const payload = url64(btoa(JSON.stringify({ u: account.username, i: account.id, e: Date.now() + SESSION_MS })));
  return `${payload}.${url64(await digest(`${pepper}:${payload}`))}`;
}
async function sessionCookie(req: Request, pepper: string) {
  const value = req.headers.get("cookie")?.split(";").map((s) => s.trim()).find((s) => s.startsWith(COOKIE + "="))?.slice(COOKIE.length + 1);
  if (!value) return null;
  const [payload, signature, extra] = value.split(".");
  if (!payload || !signature || extra || !/^[A-Za-z0-9_-]+$/.test(payload) || !/^[A-Za-z0-9_-]+$/.test(signature)) return null;
  if (!equal(url64(await digest(`${pepper}:${payload}`)), signature)) return null;
  try { const data = z.object({ u: username, i: z.string().uuid(), e: z.number().int().positive() }).parse(JSON.parse(atob(fromUrl64(payload)))); return data.e > Date.now() ? { username: data.u, id: data.i } : null; } catch { return null; }
}
const cookie = (token: string, age: number) => `${COOKIE}=${token}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${age}`;
async function limit(key: string, max: number, window: number) {
  const now = Date.now(), old = attempts.get(key), next = old && old.until > now ? { ...old, count: old.count + 1 } : { until: now + window, count: 1 };
  attempts.set(key, next); if (next.count > max) throw new AccountError(429, "تعداد تلاش‌ها زیاد است؛ چند دقیقه بعد دوباره امتحان کن");
}
export default { async fetch(req: Request, env: AccountEnv): Promise<Response> {
  const url = new URL(req.url), path = url.pathname;
  if (!path.startsWith("/api/")) return env.ASSETS ? env.ASSETS.fetch(req) : new Response("Not found", { status: 404 });
  try {
    if (!env.AUTH_PEPPER || env.AUTH_PEPPER.length < 32 || !env.LEDGER_ENCRYPTION_KEY || !env.GITHUB_DATA_TOKEN || !env.GITHUB_DATA_REPO) throw new AccountError(503, "حساب و ذخیره خصوصی هنوز فعال نشده است");
    if (url.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(url.hostname)) throw new AccountError(400, "ارتباط امن لازم است");
    if (req.method !== "GET" && (req.headers.get("Origin") !== url.origin || req.headers.get("X-Cheghad-Request") !== "1")) throw new AccountError(403, "مبدأ درخواست مجاز نیست");
    if (req.headers.get("Origin") && req.headers.get("Origin") !== url.origin) throw new AccountError(403, "مبدأ درخواست مجاز نیست");
    const github = new GitHubLedger(env, env.UPSTREAM || fetch.bind(globalThis));
    if (req.method === "POST" && ["/api/accounts/signup", "/api/accounts/login"].includes(path)) {
      const input = credentials.safeParse(await limitedBody(req, 2048)); if (!input.success) throw new AccountError(400, "نام کاربری یا اطلاعات ورود معتبر نیست");
      await limit(await digest(`${env.AUTH_PEPPER}:${req.headers.get("CF-Connecting-IP") || "development"}`), 10, 15 * 60000);
      let account = await github.account(input.data.username);
      if (path.endsWith("signup")) {
        if (account) throw new AccountError(409, "این نام کاربری قابل استفاده نیست");
        const salt = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(24))));
        account = { id: crypto.randomUUID(), username: input.data.username, salt, verifier: await verifier(input.data.credential, salt, env.AUTH_PEPPER), createdAt: new Date().toISOString() };
        await github.createAccount(account);
      } else { const hash = await verifier(input.data.credential, account?.salt || btoa("000000000000000000000000"), env.AUTH_PEPPER); if (!account || !equal(hash, account.verifier)) throw new AccountError(401, "نام کاربری یا رمز نادرست است"); }
      return response({ username: account.username }, 200, { "Set-Cookie": cookie(await sessionToken(account, env.AUTH_PEPPER), SESSION_MS / 1000) });
    }
    const session = await sessionCookie(req, env.AUTH_PEPPER); if (!session) throw new AccountError(401, "ابتدا وارد حساب خودت شو");
    if (path === "/api/accounts/session" && req.method === "GET") return response({ username: session.username });
    if (path === "/api/accounts/logout" && req.method === "POST") return response({ ok: true }, 200, { "Set-Cookie": cookie("", 0) });
    if (path === "/api/ledger" && req.method === "GET") return response((await github.read(session.id)).document);
    if (path === "/api/ledger" && req.method === "PUT") { const input = z.object({ ledger: ledgerSchema, action: z.string().trim().min(1).max(200) }).safeParse(await limitedBody(req, 2000000)); if (!input.success) throw new AccountError(400, "دفتر یا نسخه اطلاعات معتبر نیست"); return response(await github.save(session.id, input.data.ledger, input.data.action)); }
    if (["/api/ledger/undo", "/api/ledger/purge"].includes(path) && req.method === "POST") { const body = z.object({ revision: z.number().int().nonnegative() }).strict().safeParse(await limitedBody(req, 1024)); if (!body.success) throw new AccountError(400, "نسخه معتبر لازم است"); const undo = path.endsWith("undo"); return response(await github.save(session.id, { ...initial, revision: body.data.revision }, undo ? "بازگردانی آخرین تغییر" : "پاک کردن دفتر فعلی", undo ? "undo" : "purge")); }
    throw new AccountError(404, "مسیر وجود ندارد");
  } catch (e) { return response({ error: e instanceof AccountError ? e.message : "عملیات انجام نشد؛ دوباره تلاش کن" }, e instanceof AccountError ? e.status : 500); }
} };
