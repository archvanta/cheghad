import Dexie, { type Table } from "dexie";
import { emptyState, stateSchema, type State } from "../domain/model";
class Database extends Dexie {
  documents!: Table<{ id: string; data: State }>;
  constructor() {
    super("cheghad");
    this.version(1).stores({ documents: "id" });
  }
}
export const db = new Database();
export async function loadState() {
  const record = await db.documents.get("main");
  return record ? stateSchema.parse(record.data) : emptyState();
}
export async function saveState(state: State) {
  const data = stateSchema.parse({
    ...state,
    savedAt: new Date().toISOString(),
  });
  await db.documents.put({ id: "main", data });
  return data;
}
export function readBackup(text: string) {
  return stateSchema.parse(JSON.parse(text));
}
