import { expect, it } from "vitest";
import { emptyState } from "../domain/model";
import { saveState, loadState, readBackup, db } from "./store";
it("ذخیره و بازیابی IndexedDB با نسخه داده و رد نسخه نامعتبر", async () => {
  await db.documents.clear();
  expect((await loadState()).openingBalance).toBe(0);
  await saveState({ ...emptyState(), openingBalance: 1234 });
  expect((await loadState()).openingBalance).toBe(1234);
  expect(readBackup(JSON.stringify(await loadState())).version).toBe(1);
  expect(() => readBackup('{"version":9}')).toThrow();
});
