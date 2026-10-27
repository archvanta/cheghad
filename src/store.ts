import { isDemoMode, localAccountUser } from "./account/mode";
import { cloudEnabled, remoteStore } from "./account/api";
import { openDB } from "idb";
import {
  entrySchema,
  ledgerSchema,
  profileSchema,
  dueDate,
  recordPayment,
  type Ledger,
} from "./finance";
import { initial } from "./data";
const database = () =>
  openDB(
    isDemoMode()
      ? "cheghad-demo-v1"
      : localAccountUser()
        ? `cheghad-user-${localAccountUser()}-v1`
        : "cheghad-v1",
    2,
    {
    upgrade(db) {
      if (!db.objectStoreNames.contains("state")) db.createObjectStore("state");
      if (!db.objectStoreNames.contains("undo")) db.createObjectStore("undo");
    },
    },
  );
export function migrate(value: unknown): Ledger {
  if (value && typeof value === "object" && "version" in value)
    return ledgerSchema.parse(value);
  if (
    !value ||
    typeof value !== "object" ||
    !("entries" in value) ||
    !("profile" in value) ||
    !Array.isArray(value.entries)
  )
    throw Error("پشتیبان معتبر نیست");
  const profile = profileSchema.parse(value.profile);
  const entries = value.entries.map((raw) =>
    entrySchema.parse({
      ...raw,
      confirmed: raw.kind === "installment" ? false : (raw.confirmed ?? true),
    }),
  );
  let result = ledgerSchema.parse({
    ...initial,
    profile,
    entries: entries.map((e) => ({ ...e, status: "planned" })),
  });
  for (const e of entries.filter((e) => e.status === "done")) {
    if (["goldBuy", "goldSell", "usdBuy", "usdSell"].includes(e.kind))
      throw Error(
        "پشتیبان قدیمی معامله واقعی بدون مقدار/نرخ دارد؛ ابتدا آن را در نسخه قدیمی برنامه‌ریزی‌شده کنید و سپس معامله را با مشخصات کامل وارد کنید",
      );
    const relaxed = {
      ...result,
      entries: result.entries.map((x) =>
        x.id === e.id
          ? { ...x, allowEarly: "yes" as const, allowPartial: "yes" as const }
          : x,
      ),
    };
    result = recordPayment(
      relaxed,
      e.id,
      e.month,
      e.amount ?? 0,
      dueDate(e.month, e.day),
    );
  }
  return ledgerSchema.parse(result);
}
export async function read() {
  if (cloudEnabled && !isDemoMode()) return remoteStore.read();
  return (await database())
    .get("state", "ledger")
    .then((value) => (value ? migrate(value) : undefined));
}
export async function readUndo() {
  if (cloudEnabled && !isDemoMode()) return remoteStore.readUndo();
  const value = await (await database()).get("undo", "ledger");
  return value ? migrate(value) : undefined;
}
export async function save(
  value: Ledger,
  action = "ویرایش اطلاعات",
  undo = false,
): Promise<Ledger> {
  if (cloudEnabled && !isDemoMode())
    return remoteStore.save(value, action, undo);
  const parsed = ledgerSchema.parse(value);
  const db = await database(),
    tx = db.transaction(["state", "undo"], "readwrite");
  const old = await tx.objectStore("state").get("ledger");
  const current = old ? migrate(old) : initial;
  if (current.revision !== parsed.revision) {
    tx.abort();
    await tx.done.catch(() => {});
    throw Error("داده در پنجره دیگری تغییر کرده؛ صفحه را دوباره باز کن");
  }
  const next = ledgerSchema.parse({
    ...parsed,
    revision: current.revision + 1,
    history: [
      { date: new Date().toISOString(), action },
      ...current.history,
    ].slice(0, 100),
  });
  if (undo) await tx.objectStore("undo").delete("ledger");
  else await tx.objectStore("undo").put(current, "ledger");
  await tx.objectStore("state").put(next, "ledger");
  await tx.done;
  return next;
}
export async function restore(value: Ledger, currentRevision: number) {
  return save({ ...value, revision: currentRevision }, "بازیابی پشتیبان");
}
export async function purge() {
  if (cloudEnabled && !isDemoMode()) return remoteStore.purge();
  const db = await database(),
    tx = db.transaction(["state", "undo"], "readwrite");
  await tx.objectStore("state").clear();
  await tx.objectStore("undo").clear();
  await tx.done;
  return structuredClone(initial);
}
