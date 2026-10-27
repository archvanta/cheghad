import { it, expect, vi } from "vitest";
import worker, { createWorker, type Env } from "./worker";
import { namespace } from "./tests/helpers";
import { initial } from "../src/data";
import { entrySchema, monthOf } from "../src/finance";
import { buildContext } from "../src/ai/protocol";
const origin = "https://app.example";
function fixture(extra: Partial<Env> = {}) {
  const entry = entrySchema.parse({
    id: "expense-public",
    name: "هزینه عمومی",
    amount: 1000,
    kind: "expense",
    month: monthOf(),
    day: 1,
    status: "planned",
    repeat: true,
  });
  const context = buildContext(
    { ...structuredClone(initial), entries: [entry] },
    monthOf(),
  );
  const env: Env = {
    GEMINI_API_KEY: "test-only-server-key",
    ACCESS_TEAM_DOMAIN: "team.cloudflareaccess.com",
    ACCESS_AUDIENCE: "aud",
    ALLOWED_EMAILS: "owner@example.com",
    ALLOWED_ORIGINS: origin,
    AI_BUDGET: namespace(extra),
    ...extra,
  };
  return { entry, context, env };
}
const req = (path: string, body: unknown, subject = "owner", from = origin) =>
  new Request("https://api.example/api/ai" + path, {
    method: "POST",
    headers: {
      Origin: from,
      "Content-Type": "application/json",
      "X-Cheghad-Request": "1",
      "X-Test-Subject": subject,
    },
    body: JSON.stringify(body),
  });
const remote = (
  args: unknown = {
    entryId: "expense-public",
    fromMonth: monthOf(),
    changes: { amount: 200 },
  },
) =>
  vi.fn<typeof fetch>(
    async (input) =>
      new Response(
        JSON.stringify(
          String(input).endsWith(":countTokens")
            ? { totalTokens: 100 }
            : {
                candidates: [
                  {
                    finishReason: "STOP",
                    content: {
                      parts: [
                        {
                          functionCall: { name: "propose_update_entry", args },
                        },
                      ],
                    },
                  },
                ],
              },
        ),
        { headers: { "Content-Type": "application/json" } },
      ),
  );
const authenticate = async (req: Request) =>
  req.headers.get("X-Test-Subject") ?? "owner";
it("پیشنهاد بدون تأیید تغییری نمی‌کند؛ تأیید وابسته به کاربر و یک‌بارمصرف است", async () => {
  const { context, env } = fixture(),
    fetch = remote(),
    app = createWorker({ authenticate, fetch });
  const response = await app.fetch(
    req("/chat", {
      message: "مبلغ هزینه را تغییر بده",
      context,
      consent: true,
    }),
    env,
  );
  expect(response.status).toBe(200);
  const result = (await response.json()) as any;
  expect(result.proposal.operation.changes.amount).toBe(200);
  expect(context.entries[0].amount).toBe(1000);
  const approval = {
    id: result.proposal.id,
    contextHash: result.proposal.contextHash,
    revision: context.revision,
    confirmed: true,
  };
  expect(
    (await app.fetch(req("/approve", approval, "other"), env)).status,
  ).toBe(409);
  expect(
    (await app.fetch(req("/approve", { ...approval, confirmed: false }), env))
      .status,
  ).toBe(400);
  expect(
    (await app.fetch(req("/approve", { ...approval, revision: 1 }), env))
      .status,
  ).toBe(409);
  expect((await app.fetch(req("/approve", approval), env)).status).toBe(200);
  expect((await app.fetch(req("/approve", approval), env)).status).toBe(409);
  expect(fetch).toHaveBeenCalledTimes(2);
});
it("CORS، رضایت ارسال، CSRF و هویت جلوی فراخوانی مدل را می‌گیرند", async () => {
  const { context, env } = fixture(),
    fetch = remote(),
    app = createWorker({ authenticate, fetch });
  expect(
    (
      await app.fetch(
        req(
          "/chat",
          { message: "سلام", context, consent: true },
          "owner",
          "https://evil.example",
        ),
        env,
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await app.fetch(
        req("/chat", { message: "سلام", context, consent: false }),
        env,
      )
    ).status,
  ).toBe(400);
  const noCsrf = req("/chat", { message: "سلام", context, consent: true });
  noCsrf.headers.delete("X-Cheghad-Request");
  expect((await app.fetch(noCsrf, env)).status).toBe(403);
  expect(
    (
      await worker.fetch(
        req("/chat", { message: "سلام", context, consent: true }),
        env,
      )
    ).status,
  ).toBe(401);
  expect(fetch).not.toHaveBeenCalled();
});
it("کلید فقط در هدر upstream است و خطای provider آن را افشا نمی‌کند", async () => {
  const { context, env } = fixture(),
    fetch = vi.fn<typeof globalThis.fetch>(async (_input, init) => {
      expect((init?.headers as Record<string, string>)["x-goog-api-key"]).toBe(
        env.GEMINI_API_KEY,
      );
      return new Response("provider detail " + env.GEMINI_API_KEY, {
        status: 403,
      });
    });
  const response = await createWorker({ authenticate, fetch }).fetch(
    req("/chat", { message: "سلام", context, consent: true }),
    env,
  );
  expect(response.status).toBe(502);
  expect(await response.text()).not.toContain(env.GEMINI_API_KEY);
});
it("ابزار مخرب، رکورد خارج از context و فیلد پرداخت مدل رد می‌شوند", async () => {
  for (const args of [
    { entryId: "foreign", fromMonth: monthOf(), changes: { amount: 1 } },
    {
      entryId: "expense-public",
      fromMonth: monthOf(),
      changes: { amount: 1, status: "done" },
    },
    { entryId: "expense-public", fromMonth: "1200-01", changes: { amount: 1 } },
  ]) {
    const { context, env } = fixture();
    const response = await createWorker({
      authenticate,
      fetch: remote(args),
    }).fetch(req("/chat", { message: "تغییر", context, consent: true }), env);
    expect(response.status).toBeGreaterThanOrEqual(400);
    const text = await response.text();
    expect(text).not.toContain("test-only-server-key");
  }
});
it("بودجه توکن از تولید دوم و هزینه غیرمجاز جلوگیری می‌کند", async () => {
  const { context, env } = fixture({ AI_TOKENS_PER_DAY: "2200" }),
    fetch = remote(),
    app = createWorker({ authenticate, fetch });
  const body = { message: "تغییر", context, consent: true };
  expect((await app.fetch(req("/chat", body), env)).status).toBe(200);
  expect((await app.fetch(req("/chat", body), env)).status).toBe(429);
  expect(fetch).toHaveBeenCalledTimes(3);
});
it("بدنه بیش از حد و نبود کلید از مدل دور نگه داشته می‌شوند", async () => {
  const { context, env } = fixture(),
    fetch = remote(),
    app = createWorker({ authenticate, fetch });
  expect(
    (
      await app.fetch(
        req("/chat", { message: "x".repeat(110000), context, consent: true }),
        env,
      )
    ).status,
  ).toBe(413);
  env.GEMINI_API_KEY = "";
  expect(
    (
      await app.fetch(
        req("/chat", { message: "سلام", context, consent: true }),
        env,
      )
    ).status,
  ).toBe(503);
  expect(fetch).not.toHaveBeenCalled();
});
