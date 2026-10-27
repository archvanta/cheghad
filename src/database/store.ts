import { goldPortfolio } from "../domain/gold";
import Dexie, { type Table } from "dexie";
import { emptyState, stateSchema, type State } from "../domain/model";
class Database extends Dexie {
  undo!: Table<{ id: string; data: State }>;
  documents!: Table<{ id: string; data: State }>;
  constructor() {
    super("cheghad");
    this.version(1).stores({ documents: "id" });
    this.version(2).stores({ documents: "id", undo: "id" });
  }
}
export const db = new Database();
export async function loadState() {
  const record = await db.documents.get("main");
  return record ? migrate(record.data) : emptyState();
}
export async function saveState(state: State, recordUndo = true) {
  const data = stateSchema.parse({
    ...state,
    savedAt: new Date().toISOString(),
  });
  goldPortfolio(data);
  await db.transaction("rw", db.documents, db.undo, async () => {
    const previous = await db.documents.get("main");
    if (recordUndo && previous)
      await db.undo.put({ id: "main", data: migrate(previous.data) });
    else await db.undo.delete("main");
    await db.documents.put({ id: "main", data });
  });
  return data;
}
export function readBackup(text: string) {
  return migrate(JSON.parse(text));
}

export function migrate(value: unknown): State {
  if (!value || typeof value !== "object" || !("version" in value))
    throw Error("نسخه داده نامعتبر است");
  const version = value.version;
  if (![1, 2, 3, 4, 5].includes(version as number))
    throw Error("نسخه داده پشتیبانی نمی‌شود");
  const data = {
    ...value,
    ...(version === 1
      ? { categories: [], rules: [], excludedEntryIds: [], history: [] }
      : {}),
    ...((version as number) < 3 ? { debts: [] } : {}),
    ...((version as number) < 4
      ? { goldAssets: [], goldTransactions: [] }
      : {}),
    ...((version as number) < 5
      ? {
          scenarios: [],
          horizon: 12,
          calendar: "persian",
          displayUnit: "toman",
          onboarded: true,
        }
      : {}),
    version: 5,
  };
  const parsed = stateSchema.parse(data);
  goldPortfolio(parsed);
  return parsed;
}

export async function loadUndo() {
  const record = await db.undo.get("main");
  return record ? migrate(record.data) : null;
}

export async function purgeData() {
  await db.transaction("rw", db.documents, db.undo, async () => {
    await db.documents.clear();
    await db.undo.clear();
  });
  return emptyState();
}
