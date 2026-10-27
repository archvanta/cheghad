import { beforeEach, expect, it, vi } from "vitest";
import worker, { resetAttemptsForTest, type AccountEnv } from "./worker";
import { initial } from "../src/data";
import { base64, seal, unseal } from "./crypto";
import { GitHubLedger } from "./github";
const repo = "owner/private-data";
function setup() {
  const files = new Map<string, { sha: string; content: string }>();
  let privateRepo = true;
  const upstream = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === `https://api.github.com/repos/${repo}`)
        return Response.json({ private: privateRepo, archived: false });
      const key = url.split("/contents/")[1];
      if (init?.method === "PUT") {
        const body = JSON.parse(String(init.body)),
          old = files.get(key);
        if (old?.sha !== body.sha) return Response.json({}, { status: 409 });
        files.set(key, { sha: crypto.randomUUID(), content: body.content });
        return Response.json({}, { status: 201 });
      }
      return files.has(key)
        ? Response.json({ ...files.get(key), encoding: "base64" })
        : Response.json({}, { status: 404 });
    },
  );
  const env: AccountEnv = {
    GITHUB_DATA_REPO: repo,
    GITHUB_DATA_TOKEN: "mock-server-only-token",
    LEDGER_ENCRYPTION_KEY: base64(new Uint8Array(32).fill(42)),
    AUTH_PEPPER: "server-pepper-for-tests-only-1234567890",
    UPSTREAM: upstream as typeof fetch,
  };
  const request = (
    path: string,
    method = "GET",
    body?: unknown,
    cookie?: string,
    origin = "https://app.example",
  ) =>
    worker.fetch(
      new Request("https://app.example/api" + path, {
        method,
        headers: {
          Origin: origin,
          "X-Cheghad-Request": "1",
          ...(cookie ? { Cookie: cookie } : {}),
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      }),
      env,
    );
  return {
    env,
    files,
    upstream,
    request,
    setPrivate: (value: boolean) => {
      privateRepo = value;
    },
  };
}
const credentials = (name = "tester") => ({
  username: name,
  credential: "A".repeat(43),
  version: 1,
});
const cookieOf = (res: Response) =>
  res.headers.get("set-cookie")!.split(";")[0];
beforeEach(() => { vi.useRealTimers(); resetAttemptsForTest(); });
it("حساب بدون ایمیل با نشست امن ایجاد می‌شود؛ رمز و کلید در پاسخ نیست", async () => {
  const { request } = setup();
  const registered = await request("/accounts/signup", "POST", credentials());
  expect(registered.status).toBe(200);
  const header = registered.headers.get("set-cookie")!;
  for (const flag of ["Secure", "HttpOnly", "SameSite=Strict", "Path=/"])
    expect(header).toContain(flag);
  expect(await registered.json()).toEqual({ username: "tester" });
  const cookie = cookieOf(registered);
  expect(
    (await request("/accounts/session", "GET", undefined, cookie)).status,
  ).toBe(200);
  const wrong = await request("/accounts/login", "POST", {
    ...credentials(),
    credential: "B".repeat(43),
  });
  expect(wrong.status).toBe(401);
  expect((await request("/accounts/login", "POST", credentials())).status).toBe(
    200,
  );
  await request("/accounts/logout", "POST", {}, cookie);
  expect((await request("/accounts/session", "GET", undefined, cookie)).status).toBe(200);
});
it("دفتر روی GitHub فقط رمز‌شده ذخیره می‌شود و حساب دیگر آن را نمی‌بیند", async () => {
  const { request, files, env } = setup();
  const a = cookieOf(
    await request("/accounts/signup", "POST", credentials("alpha")),
  );
  const b = cookieOf(
    await request("/accounts/signup", "POST", credentials("bravo")),
  );
  const ledger = {
    ...structuredClone(initial),
    profile: { ...initial.profile, cash: 1234567 },
  };
  const saved = await request(
    "/ledger",
    "PUT",
    { ledger, action: "ثبت نمونه" },
    a,
  );
  expect(saved.status).toBe(200);
  expect(((await saved.json()) as any).ledger.revision).toBe(1);
  expect(
    ((await (await request("/ledger", "GET", undefined, a)).json()) as any)
      .ledger.profile.cash,
  ).toBe(1234567);
  expect(
    ((await (await request("/ledger", "GET", undefined, b)).json()) as any)
      .ledger.profile.cash,
  ).toBe(0);
  const [path, file] = [...files].find(([key]) => key.startsWith("ledgers/"))!,
    envelope = JSON.parse(atob(file.content));
  expect(atob(file.content)).not.toContain("1234567");
  expect(atob(file.content)).not.toContain("ثبت نمونه");
  const id = path.split("/")[1].replace(".json", "");
  expect(
    ((await unseal(envelope, env.LEDGER_ENCRYPTION_KEY, id)) as any).ledger
      .profile.cash,
  ).toBe(1234567);
  await expect(
    unseal(envelope, env.LEDGER_ENCRYPTION_KEY, crypto.randomUUID()),
  ).rejects.toThrow();
});
it("نسخه قدیمی رد می‌شود و Undo و پاک‌کردن دفتر پایدارند", async () => {
  const { request } = setup();
  const cookie = cookieOf(
    await request("/accounts/signup", "POST", credentials()),
  );
  const save = (ledger: unknown) =>
    request("/ledger", "PUT", { ledger, action: "ویرایش" }, cookie);
  expect(
    (await save({ ...initial, profile: { ...initial.profile, cash: 500 } }))
      .status,
  ).toBe(200);
  expect((await save(initial)).status).toBe(409);
  expect(
    (await request("/ledger/undo", "POST", { revision: 1 }, cookie)).status,
  ).toBe(200);
  const undone = (await (
    await request("/ledger", "GET", undefined, cookie)
  ).json()) as any;
  expect(undone).toMatchObject({
    ledger: { revision: 2, profile: { cash: 0 } },
    undo: null,
  });
  expect(
    (await request("/ledger/purge", "POST", { revision: 2 }, cookie)).status,
  ).toBe(200);
  expect(
    ((await (await request("/ledger", "GET", undefined, cookie)).json()) as any)
      .ledger.revision,
  ).toBe(3);
});
it("مخزن عمومی و پاسخ خطای upstream اطلاعات را افشا نمی‌کنند", async () => {
  const { request, setPrivate, env } = setup();
  setPrivate(false);
  expect(
    (await request("/accounts/signup", "POST", credentials())).status,
  ).toBe(503);
  const github = new GitHubLedger(env, async () =>
    Response.json({ message: "private-secret-detail" }, { status: 403 }),
  );
  await expect(github.read(crypto.randomUUID())).rejects.toThrow(
    "مخزن ذخیره خصوصی",
  );
});
it("CSRF، نشست منقضی، payload بزرگ و تنظیمات ناقص رد می‌شوند", async () => {
  const { request, env } = setup();
  expect(
    (
      await request(
        "/accounts/signup",
        "POST",
        credentials(),
        undefined,
        "https://evil.example",
      )
    ).status,
  ).toBe(403);
  expect((await request("/ledger")).status).toBe(401);
  expect(
    (
      await request("/accounts/signup", "POST", {
        ...credentials(),
        padding: "x".repeat(3000),
      })
    ).status,
  ).toBe(413);
  const cookie = cookieOf(
    await request("/accounts/signup", "POST", credentials()),
  );
  const original = Date.now();
  const spy = vi.spyOn(Date, "now").mockReturnValue(original + 8 * 86400000);
  expect(
    (await request("/accounts/session", "GET", undefined, cookie)).status,
  ).toBe(401);
  spy.mockRestore();
  env.AUTH_PEPPER = "";
  expect((await request("/accounts/session")).status).toBe(503);
});
it("تلاش‌های ورود و ثبت‌نام محدودند", async () => {
  const { request } = setup();
  for (let n = 0; n < 10; n++)
    expect(
      (await request("/accounts/login", "POST", credentials())).status,
    ).toBe(401);
  expect((await request("/accounts/login", "POST", credentials())).status).toBe(
    429,
  );
});

it("دفتر بزرگ از پاسخ raw گیت‌هاب خوانده می‌شود و SHA برای تعارض حفظ می‌شود", async () => {
  const { env } = setup();
  const id = crypto.randomUUID();
  const envelope = await seal(
    { ledger: initial, undo: null },
    env.LEDGER_ENCRYPTION_KEY,
    id,
  );
  const upstream = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith("/private-data"))
        return Response.json({ private: true });
      if (
        (init?.headers as Record<string, string>)?.Accept ===
        "application/vnd.github.raw+json"
      )
        return new Response(JSON.stringify(envelope));
      return Response.json({
        encoding: "none",
        content: "",
        sha: "large-file-sha",
        size: 1100000,
      });
    },
  );
  const result = await new GitHubLedger(env, upstream as typeof fetch).read(id);
  expect(result.sha).toBe("large-file-sha");
  expect(result.document.ledger).toEqual(initial);
  expect(upstream).toHaveBeenCalledTimes(3);
});
