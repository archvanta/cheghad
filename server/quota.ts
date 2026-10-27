import { z } from "zod";
import { proposalSchema, type Proposal } from "../src/ai/protocol";
export interface Storage {
  get<T>(key: string): Promise<T | undefined>;
  put(key: string, value: unknown): Promise<unknown>;
  delete(key: string): Promise<unknown>;
  list<T>(options: { prefix: string }): Promise<Map<string, T>>;
  transaction<T>(fn: (storage: Storage) => Promise<T>): Promise<T>;
}
export interface ObjectState {
  storage: Storage;
}
export interface QuotaEnv {
  AI_REQUESTS_PER_MINUTE?: string;
  AI_REQUESTS_PER_DAY?: string;
  AI_TOKENS_PER_DAY?: string;
}
export interface Namespace {
  idFromName(name: string): unknown;
  get(id: unknown): { fetch(request: Request): Promise<Response> };
}
const limit = (value: string | undefined, fallback: number, max: number) => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 && n <= max ? n : fallback;
};
const respond = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
export class AiBudget {
  constructor(
    private state: ObjectState,
    private env: QuotaEnv,
  ) {}
  async fetch(req: Request) {
    if (req.method !== "POST")
      return respond({ error: "Method not allowed" }, 405);
    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return respond({ error: "Invalid request" }, 400);
    }
    const path = new URL(req.url).pathname;
    return this.state.storage.transaction(async (storage) => {
      const now = Date.now(),
        day = Math.floor(now / 86400000),
        minute = Math.floor(now / 60000);
      const stats = (await storage.get<{
        day: number;
        minute: number;
        daily: number;
        minutely: number;
        tokens: number;
      }>("stats")) ?? { day, minute, daily: 0, minutely: 0, tokens: 0 };
      if (stats.day !== day) {
        stats.day = day;
        stats.daily = 0;
        stats.tokens = 0;
      }
      if (stats.minute !== minute) {
        stats.minute = minute;
        stats.minutely = 0;
      }
      if (path === "/request") {
        if (
          stats.daily >= limit(this.env.AI_REQUESTS_PER_DAY, 30, 1000) ||
          stats.minutely >= limit(this.env.AI_REQUESTS_PER_MINUTE, 5, 100)
        )
          return respond(
            { error: "سقف تعداد درخواست هوش مصنوعی رسیده است" },
            429,
          );
        stats.daily++;
        stats.minutely++;
        await storage.put("stats", stats);
        const proposals = await storage.list<Proposal>({ prefix: "proposal:" });
        for (const [key, p] of proposals)
          if (p.expiresAt < now) await storage.delete(key);
        return respond({ ok: true });
      }
      if (path === "/tokens") {
        const parsed = z
          .object({ tokens: z.number().int().positive().max(1000000) })
          .strict()
          .safeParse(raw);
        if (!parsed.success)
          return respond({ error: "Invalid token reservation" }, 400);
        if (
          stats.tokens + parsed.data.tokens >
          limit(this.env.AI_TOKENS_PER_DAY, 100000, 1000000)
        )
          return respond(
            { error: "بودجه روزانه توکن هوش مصنوعی تمام شده است" },
            429,
          );
        stats.tokens += parsed.data.tokens;
        await storage.put("stats", stats);
        return respond({ ok: true });
      }
      if (path === "/proposal") {
        const parsed = proposalSchema.safeParse(raw);
        if (
          !parsed.success ||
          parsed.data.expiresAt <= now ||
          parsed.data.expiresAt > now + 10 * 60000
        )
          return respond({ error: "Invalid proposal" }, 400);
        const pending = await storage.list<Proposal>({ prefix: "proposal:" });
        if (pending.size >= 20)
          return respond(
            { error: "تعداد پیشنهادهای منتظر تأیید بیش از حد است" },
            429,
          );
        await storage.put("proposal:" + parsed.data.id, parsed.data);
        return respond({ ok: true });
      }
      if (path === "/approve") {
        const parsed = z
          .object({
            id: z.string().uuid(),
            contextHash: z.string().regex(/^[a-f0-9]{64}$/),
            revision: z.number().int().nonnegative(),
            confirmed: z.literal(true),
          })
          .strict()
          .safeParse(raw);
        if (!parsed.success)
          return respond({ error: "تأیید صریح و اطلاعات معتبر لازم است" }, 400);
        const p = await storage.get<Proposal>("proposal:" + parsed.data.id);
        if (!p || p.expiresAt <= now)
          return respond(
            { error: "پیشنهاد منقضی شده یا قبلاً استفاده شده است" },
            409,
          );
        if (
          p.contextHash !== parsed.data.contextHash ||
          p.revision !== parsed.data.revision
        )
          return respond(
            { error: "اطلاعات نسبت به پیشنهاد تغییر کرده است" },
            409,
          );
        await storage.delete("proposal:" + p.id);
        return respond({ proposal: p });
      }
      return respond({ error: "Not found" }, 404);
    });
  }
}
