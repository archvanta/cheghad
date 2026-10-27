import { ledgerSchema, type Ledger } from "../finance";
export const cloudEnabled = import.meta.env.VITE_ACCOUNT_API_BASE === "/api";
let epoch = 0;
let cached: { ledger: Ledger; undo: Ledger | null } | null = null;
export function resetAccountCache() {
  epoch++;
  cached = null;
}
export async function accountRequest(
  path: string,
  method = "GET",
  body?: unknown,
) {
  const response = await fetch("/api" + path, {
    method,
    credentials: "same-origin",
    cache: "no-store",
    headers: {
      "X-Cheghad-Request": "1",
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response
    .json()
    .catch(() => ({ error: "پاسخ سرویس معتبر نیست" }));
  if (!response.ok) {
    if (response.status === 401 && !path.endsWith("/login"))
      window.dispatchEvent(new Event("cheghad-session-expired"));
    throw Error(data.error || "ارتباط با حساب برقرار نشد");
  }
  return data;
}
async function documentRequest(path: string, method = "GET", body?: unknown) {
  const currentEpoch = epoch;
  const data = await accountRequest(path, method, body);
  if (epoch !== currentEpoch) throw Error("نشست حساب تغییر کرده است");
  cached = {
    ledger: ledgerSchema.parse(data.ledger),
    undo: data.undo === null ? null : ledgerSchema.parse(data.undo),
  };
  return cached;
}
export const remoteStore = {
  async read() {
    return (await documentRequest("/ledger")).ledger;
  },
  async readUndo() {
    return cached?.undo ?? undefined;
  },
  async save(ledger: Ledger, action: string, undo = false) {
    return (
      await documentRequest(
        undo ? "/ledger/undo" : "/ledger",
        undo ? "POST" : "PUT",
        undo
          ? { revision: ledger.revision }
          : { ledger, action: action.slice(0, 200) },
      )
    ).ledger;
  },
  async purge() {
    if (!cached) await this.read();
    return (
      await documentRequest("/ledger/purge", "POST", {
        revision: cached!.ledger.revision,
      })
    ).ledger;
  },
};
export async function passwordCredential(username: string, password: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const result = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      iterations: 600000,
      salt: encoder.encode("cheghad.auth.v1:" + username),
    },
    key,
    256,
  );
  return btoa(String.fromCharCode(...new Uint8Array(result)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
