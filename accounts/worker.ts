import { z } from "zod";
import { ledgerSchema } from "../src/finance";
import { initial } from "../src/data";
import type { ObjectState, Namespace } from "../server/quota";
import { digest, equal, randomToken, verifier } from "./crypto";
import { AccountError, GitHubLedger, type DataEnv } from "./github";
export interface AccountEnv extends DataEnv {
  AUTH_PEPPER: string;
  ACCOUNTS: Namespace;
  ASSETS?: { fetch(request: Request): Promise<Response> };
}
const username = z.string().regex(/^[a-z0-9_]{3,32}$/);
const credentials = z
  .object({
    username,
    credential: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    version: z.literal(1),
  })
  .strict();
const SESSION_MS = 7 * 86400000;
const COOKIE = "__Host-cheghad";
export const response = (
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...headers,
    },
  });
async function limitedBody(req: Request, limit: number) {
  if (!req.headers.get("content-type")?.startsWith("application/json"))
    throw new AccountError(415, "درخواست JSON لازم است");
  if (Number(req.headers.get("content-length")) > limit)
    throw new AccountError(413, "حجم درخواست زیاد است");
  if (!req.body) throw new AccountError(400, "درخواست خالی است");
  const reader = req.body.getReader();
  let count = 0;
  const parts: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    count += value.byteLength;
    if (count > limit) {
      await reader.cancel();
      throw new AccountError(413, "حجم درخواست زیاد است");
    }
    parts.push(value);
  }
  const all = new Uint8Array(count);
  let offset = 0;
  for (const part of parts) {
    all.set(part, offset);
    offset += part.length;
  }
  try {
    return JSON.parse(new TextDecoder().decode(all));
  } catch {
    throw new AccountError(400, "درخواست معتبر نیست");
  }
}
function sessionCookie(req: Request) {
  const value = req.headers
    .get("cookie")
    ?.split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(COOKIE + "="))
    ?.slice(COOKIE.length + 1);
  if (!value) return null;
  const [name, token] = value.split(".");
  return username.safeParse(name).success &&
    /^[A-Za-z0-9_-]{43}$/.test(token || "")
    ? { username: name, token }
    : null;
}
const cookie = (name: string, token: string, age: number) =>
  `${COOKIE}=${name}.${token}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${age}`;
interface Account {
  id: string;
  username: string;
  salt: string;
  verifier: string;
  createdAt: string;
}
export class AccountVault {
  private tail: Promise<unknown> = Promise.resolve();
  constructor(
    private state: ObjectState,
    private env: AccountEnv,
    private upstream: typeof fetch = fetch.bind(globalThis),
  ) {}
  fetch(req: Request): Promise<Response> {
    const task = this.tail
      .then(() => this.handle(req))
      .catch((e) =>
        response(
          {
            error:
              e instanceof AccountError
                ? e.message
                : "عملیات انجام نشد؛ دوباره تلاش کن",
          },
          e instanceof AccountError ? e.status : 500,
        ),
      );
    this.tail = task.then(() => {});
    return task;
  }
  private async limit(key: string, max: number, window: number) {
    const now = Date.now();
    const record = await this.state.storage.get<{
      until: number;
      count: number;
    }>(key);
    const next =
      record && record.until > now
        ? { ...record, count: record.count + 1 }
        : { until: now + window, count: 1 };
    await this.state.storage.put(key, next);
    if (next.count > max)
      throw new AccountError(
        429,
        "تعداد تلاش‌ها زیاد است؛ چند دقیقه بعد دوباره امتحان کن",
      );
  }
  private async handle(req: Request) {
    const path = new URL(req.url).pathname;
    const body = (await req.json()) as Record<string, unknown>;
    if (path === "/limit") {
      await this.limit("requests", 20, 15 * 60000);
      if (body.signup) await this.limit("signups", 5, 86400000);
      return response({ ok: true });
    }
    if (path === "/signup" || path === "/login") {
      const input = credentials.safeParse(body);
      if (!input.success)
        throw new AccountError(400, "نام کاربری یا اطلاعات ورود معتبر نیست");
      await this.limit("login-attempts", 10, 15 * 60000);
      const existing = await this.state.storage.get<Account>("account");
      let account = existing;
      if (path === "/signup") {
        if (existing)
          throw new AccountError(409, "این نام کاربری قابل استفاده نیست");
        await new GitHubLedger(this.env, this.upstream).checkPrivate();
        const salt = btoa(
          String.fromCharCode(...crypto.getRandomValues(new Uint8Array(24))),
        );
        account = {
          id: crypto.randomUUID(),
          username: input.data.username,
          salt,
          verifier: await verifier(
            input.data.credential,
            salt,
            this.env.AUTH_PEPPER,
          ),
          createdAt: new Date().toISOString(),
        };
        await this.state.storage.put("account", account);
      } else {
        const hash = await verifier(
          input.data.credential,
          existing?.salt || btoa("000000000000000000000000"),
          this.env.AUTH_PEPPER,
        );
        if (!existing || !equal(hash, existing.verifier))
          throw new AccountError(401, "نام کاربری یا رمز نادرست است");
      }
      const token = randomToken();
      const sessions = await this.state.storage.list<number>({
        prefix: "session:",
      });
      for (const [key, expires] of sessions)
        if (expires <= Date.now()) await this.state.storage.delete(key);
      const active = [...sessions]
        .filter(([, exp]) => exp > Date.now())
        .sort((a, b) => a[1] - b[1]);
      while (active.length >= 10)
        await this.state.storage.delete(active.shift()![0]);
      await this.state.storage.put(
        "session:" + (await digest(token)),
        Date.now() + SESSION_MS,
      );
      return response({ username: account!.username }, 200, {
        "Set-Cookie": cookie(account!.username, token, SESSION_MS / 1000),
      });
    }
    const token = String(body.token || "");
    const account = await this.state.storage.get<Account>("account");
    const sessionKey = "session:" + (await digest(token)),
      expires = await this.state.storage.get<number>(sessionKey);
    if (!account || !expires || expires <= Date.now()) {
      if (expires) await this.state.storage.delete(sessionKey);
      throw new AccountError(401, "نشست منقضی شده؛ دوباره وارد شو");
    }
    if (path === "/session") return response({ username: account.username });
    if (path === "/logout") {
      await this.state.storage.delete(sessionKey);
      return response({ ok: true }, 200, { "Set-Cookie": cookie("", "", 0) });
    }
    const github = new GitHubLedger(this.env, this.upstream);
    if (path === "/read")
      return response((await github.read(account.id)).document);
    if (["/save", "/undo", "/purge"].includes(path)) {
      const input = z
        .object({
          ledger: ledgerSchema,
          action: z.string().trim().min(1).max(200),
        })
        .safeParse(body);
      if (!input.success)
        throw new AccountError(400, "دفتر یا نسخه اطلاعات معتبر نیست");
      return response(
        await github.save(
          account.id,
          input.data.ledger,
          input.data.action,
          path.slice(1) as "save" | "undo" | "purge",
        ),
      );
    }
    throw new AccountError(404, "مسیر وجود ندارد");
  }
}
async function call(
  env: AccountEnv,
  name: string,
  path: string,
  body: unknown,
) {
  return env.ACCOUNTS.get(env.ACCOUNTS.idFromName(name)).fetch(
    new Request("https://internal" + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}
export default {
  async fetch(req: Request, env: AccountEnv): Promise<Response> {
    const url = new URL(req.url),
      path = url.pathname;
    if (!path.startsWith("/api/"))
      return env.ASSETS
        ? env.ASSETS.fetch(req)
        : new Response("Not found", { status: 404 });
    try {
      if (
        !env.AUTH_PEPPER ||
        env.AUTH_PEPPER.length < 32 ||
        !env.LEDGER_ENCRYPTION_KEY ||
        !env.GITHUB_DATA_TOKEN ||
        !env.GITHUB_DATA_REPO ||
        !env.ACCOUNTS
      )
        throw new AccountError(503, "حساب و ذخیره خصوصی هنوز فعال نشده است");
      if (
        url.protocol !== "https:" &&
        url.hostname !== "localhost" &&
        url.hostname !== "127.0.0.1"
      )
        throw new AccountError(400, "ارتباط امن لازم است");
      if (
        req.method !== "GET" &&
        (req.headers.get("Origin") !== url.origin ||
          req.headers.get("X-Cheghad-Request") !== "1")
      )
        throw new AccountError(403, "مبدأ درخواست مجاز نیست");
      if (req.headers.get("Origin") && req.headers.get("Origin") !== url.origin)
        throw new AccountError(403, "مبدأ درخواست مجاز نیست");
      if (
        req.method === "POST" &&
        ["/api/accounts/signup", "/api/accounts/login"].includes(path)
      ) {
        const input = credentials.safeParse(await limitedBody(req, 2048));
        if (!input.success)
          throw new AccountError(400, "نام کاربری یا اطلاعات ورود معتبر نیست");
        const ip = req.headers.get("CF-Connecting-IP") || "development";
        const limited = await call(
          env,
          "limit:" + (await digest(env.AUTH_PEPPER + ":" + ip)),
          "/limit",
          { signup: path.endsWith("signup") },
        );
        if (!limited.ok) return limited;
        return call(
          env,
          "account:" + input.data.username,
          path.endsWith("signup") ? "/signup" : "/login",
          input.data,
        );
      }
      const session = sessionCookie(req);
      if (!session) throw new AccountError(401, "ابتدا وارد حساب خودت شو");
      const name = "account:" + session.username;
      if (path === "/api/accounts/session" && req.method === "GET")
        return call(env, name, "/session", { token: session.token });
      if (path === "/api/accounts/logout" && req.method === "POST")
        return call(env, name, "/logout", { token: session.token });
      if (path === "/api/ledger" && req.method === "GET")
        return call(env, name, "/read", { token: session.token });
      if (path === "/api/ledger" && req.method === "PUT") {
        const body = await limitedBody(req, 2000000);
        return call(env, name, "/save", {
          ...(body as object),
          token: session.token,
        });
      }
      if (
        ["/api/ledger/undo", "/api/ledger/purge"].includes(path) &&
        req.method === "POST"
      ) {
        const body = z
          .object({ revision: z.number().int().nonnegative() })
          .strict()
          .safeParse(await limitedBody(req, 1024));
        if (!body.success) throw new AccountError(400, "نسخه معتبر لازم است");
        return call(env, name, path.endsWith("undo") ? "/undo" : "/purge", {
          token: session.token,
          ledger: { ...initial, revision: body.data.revision },
          action: path.endsWith("undo")
            ? "بازگردانی آخرین تغییر"
            : "پاک کردن دفتر فعلی",
        });
      }
      throw new AccountError(404, "مسیر وجود ندارد");
    } catch (e) {
      return response(
        {
          error:
            e instanceof AccountError
              ? e.message
              : "عملیات انجام نشد؛ دوباره تلاش کن",
        },
        e instanceof AccountError ? e.status : 500,
      );
    }
  },
};
