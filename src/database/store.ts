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
  if (
    value &&
    typeof value === "object" &&
    "version" in value &&
    value.version === 1
  )
    return stateSchema.parse({
      ...value,
      version: 2,
      categories: [],
      rules: [],
      excludedEntryIds: [],
      history: [],
    });
  return stateSchema.parse(value);
}

export async function loadUndo() {
  const record = await db.undo.get("main");
  return record ? migrate(record.data) : null;
}
