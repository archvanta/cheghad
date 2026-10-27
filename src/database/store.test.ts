import { expect, it } from "vitest";
import { emptyState } from "../domain/model";
import { saveState, loadState, readBackup, db } from "./store";
it("ذخیره و بازیابی IndexedDB با نسخه داده و رد نسخه نامعتبر", async () => {
  await db.documents.clear();
  expect((await loadState()).openingBalance).toBe(0);
  await saveState({ ...emptyState(), openingBalance: 1234 });
  expect((await loadState()).openingBalance).toBe(1234);
  expect(readBackup(JSON.stringify(await loadState())).version).toBe(2);
  expect(() => readBackup('{"version":9}')).toThrow();
});
it("پشتیبان نسخه ۱ بدون تغییر مبالغ و پرداخت‌ها به نسخه ۲ تبدیل می‌شود", async () => {
  const old = { ...emptyState(), version: 1, openingBalance: 400 };
  const migrated = readBackup(JSON.stringify(old));
  expect(migrated.version).toBe(2);
  expect(migrated.openingBalance).toBe(400);
  expect(migrated.rules).toEqual([]);
  await db.documents.put({ id: "main", data: old as never });
  expect((await loadState()).version).toBe(2);
});
