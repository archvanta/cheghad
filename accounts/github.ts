import { z } from "zod";
import { ledgerSchema, type Ledger } from "../src/finance";
import { initial } from "../src/data";
import { base64, seal, unbase64, unseal } from "./crypto";
export interface DataEnv {
  GITHUB_DATA_REPO: string;
  GITHUB_DATA_TOKEN: string;
  LEDGER_ENCRYPTION_KEY: string;
}
export class AccountError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export const documentSchema = z.object({
  ledger: ledgerSchema,
  undo: ledgerSchema.nullable(),
});
export type LedgerDocument = z.infer<typeof documentSchema>;
const accountSchema = z.object({
  id: z.string().uuid(),
  username: z.string().regex(/^[a-z0-9_]{3,32}$/),
  salt: z.string().min(16).max(128),
  verifier: z.string().min(32).max(128),
  createdAt: z.string().datetime(),
});
export type StoredAccount = z.infer<typeof accountSchema>;
const encrypted = z.object({
  version: z.literal(1),
  iv: z.string().max(30),
  ciphertext: z.string().max(6000000),
});
export class GitHubLedger {
  constructor(
    private env: DataEnv,
    private upstream: typeof fetch = fetch.bind(globalThis),
  ) {}
  async request(
    path: string,
    method = "GET",
    body?: unknown,
    accept = "application/vnd.github+json",
  ) {
    const repo = this.env.GITHUB_DATA_REPO;
    if (
      !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo) ||
      !this.env.GITHUB_DATA_TOKEN ||
      !this.env.LEDGER_ENCRYPTION_KEY
    )
      throw new AccountError(503, "ذخیره خصوصی هنوز تنظیم نشده است");
    try {
      return await this.upstream(
        `https://api.github.com/repos/${repo}${path}`,
        {
          method,
          headers: {
            Authorization: `Bearer ${this.env.GITHUB_DATA_TOKEN}`,
            Accept: accept,
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "Cheghad-Private-Accounts",
            ...(body ? { "Content-Type": "application/json" } : {}),
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
          signal: AbortSignal.timeout(15000),
        },
      );
    } catch {
      throw new AccountError(
        503,
        "ارتباط با ذخیره خصوصی برقرار نشد؛ دوباره تلاش کن",
      );
    }
  }
  async checkPrivate() {
    const response = await this.request("");
    if (!response.ok)
      throw new AccountError(503, "مخزن ذخیره خصوصی در دسترس نیست");
    const repo = (await response.json()) as {
      private?: boolean;
      archived?: boolean;
    };
    if (repo.private !== true || repo.archived)
      throw new AccountError(503, "مخزن داده باید خصوصی و قابل نوشتن باشد");
  }
  private path(userId: string) {
    if (!/^[a-f0-9-]{36}$/.test(userId))
      throw new AccountError(500, "شناسه حساب معتبر نیست");
    return `/contents/ledgers/${userId}.json`;
  }
  private accountPath(username: string) {
    if (!/^[a-z0-9_]{3,32}$/.test(username))
      throw new AccountError(400, "نام کاربری معتبر نیست");
    return `/contents/accounts/${username}.json`;
  }
  async account(username: string): Promise<StoredAccount | null> {
    await this.checkPrivate();
    const response = await this.request(this.accountPath(username));
    if (response.status === 404) return null;
    if (!response.ok) throw new AccountError(503, "خواندن حساب ممکن نشد");
    try {
      const file = (await response.json()) as { content?: string; encoding?: string };
      if (file.encoding !== "base64" || typeof file.content !== "string") throw Error();
      return accountSchema.parse(JSON.parse(new TextDecoder().decode(unbase64(file.content.replace(/\s/g, "")))));
    } catch {
      throw new AccountError(503, "حساب خصوصی معتبر نیست");
    }
  }
  async createAccount(account: StoredAccount) {
    await this.checkPrivate();
    const response = await this.request(this.accountPath(account.username), "PUT", {
      message: "Create Cheghad private account",
      content: base64(new TextEncoder().encode(JSON.stringify(accountSchema.parse(account)))),
    });
    if (response.status === 409 || response.status === 422)
      throw new AccountError(409, "این نام کاربری قابل استفاده نیست");
    if (!response.ok) throw new AccountError(503, "ساخت حساب ممکن نشد");
  }
  async read(userId: string) {
    await this.checkPrivate();
    const response = await this.request(this.path(userId));
    if (response.status === 404)
      return {
        document: {
          ledger: structuredClone(initial),
          undo: null,
        } as LedgerDocument,
        sha: undefined as string | undefined,
      };
    if (!response.ok) throw new AccountError(503, "خواندن دفتر خصوصی ممکن نشد");
    try {
      const file = (await response.json()) as {
        sha: string;
        content: string;
        encoding: string;
        size?: number;
      };
      if (
        !["base64", "none"].includes(file.encoding) ||
        typeof file.sha !== "string" ||
        file.content.length > 9000000 ||
        (file.size ?? 0) > 6000000
      )
        throw Error();
      let contents: string;
      if (file.encoding === "none") {
        // GitHub omits base64 content for files over 1 MiB. Read the raw
        // representation while retaining the metadata SHA for atomic writes.
        const raw = await this.request(
          this.path(userId),
          "GET",
          undefined,
          "application/vnd.github.raw+json",
        );
        if (!raw.ok) throw Error();
        contents = await raw.text();
        if (contents.length > 6000000) throw Error();
      } else
        contents = new TextDecoder().decode(
          unbase64(file.content.replace(/\s/g, "")),
        );
      const envelope = encrypted.parse(JSON.parse(contents));
      return {
        document: documentSchema.parse(
          await unseal(envelope, this.env.LEDGER_ENCRYPTION_KEY, userId),
        ),
        sha: file.sha,
      };
    } catch {
      throw new AccountError(
        503,
        "صحت دفتر خصوصی تأیید نشد؛ نسخه موجود حفظ شده است",
      );
    }
  }
  async write(userId: string, document: LedgerDocument, sha?: string) {
    const envelope = await seal(
      documentSchema.parse(document),
      this.env.LEDGER_ENCRYPTION_KEY,
      userId,
    );
    const content = base64(new TextEncoder().encode(JSON.stringify(envelope)));
    const response = await this.request(this.path(userId), "PUT", {
      message: "Update encrypted finance ledger",
      content,
      ...(sha ? { sha } : {}),
    });
    if (response.status === 409 || response.status === 422)
      throw new AccountError(
        409,
        "دفتر در پنجره دیگری تغییر کرده؛ صفحه را تازه کن",
      );
    if (!response.ok)
      throw new AccountError(503, "ذخیره انجام نشد؛ نسخه قبلی حفظ شده است");
  }
  async save(
    userId: string,
    ledger: Ledger,
    action: string,
    operation: "save" | "undo" | "purge" = "save",
  ) {
    const { document: old, sha } = await this.read(userId);
    if (ledger.revision !== old.ledger.revision)
      throw new AccountError(409, "نسخه دفتر تغییر کرده؛ صفحه را تازه کن");
    if (operation === "undo" && !old.undo)
      throw new AccountError(409, "تغییری برای بازگردانی وجود ندارد");
    const source =
      operation === "undo"
        ? old.undo!
        : operation === "purge"
          ? initial
          : ledger;
    const next = ledgerSchema.parse({
      ...source,
      revision: old.ledger.revision + 1,
      history:
        operation === "purge"
          ? []
          : [
              { date: new Date().toISOString(), action },
              ...old.ledger.history,
            ].slice(0, 100),
    });
    const document = {
      ledger: next,
      undo: operation === "save" ? old.ledger : null,
    };
    await this.write(userId, document, sha);
    return document;
  }
}
