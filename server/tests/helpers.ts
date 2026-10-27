import {
  AiBudget,
  type Storage,
  type Namespace,
  type QuotaEnv,
} from "../quota";
export class MemoryStorage implements Storage {
  values = new Map<string, unknown>();
  private tail: Promise<unknown> = Promise.resolve();
  async get<T>(key: string) {
    return structuredClone(this.values.get(key)) as T | undefined;
  }
  async put(key: string, value: unknown) {
    this.values.set(key, structuredClone(value));
  }
  async delete(key: string) {
    this.values.delete(key);
  }
  async list<T>({ prefix }: { prefix: string }) {
    return new Map(
      [...this.values]
        .filter(([k]) => k.startsWith(prefix))
        .map(([k, v]) => [k, structuredClone(v) as T]),
    );
  }
  transaction<T>(fn: (s: Storage) => Promise<T>): Promise<T> {
    const task = this.tail.then(() => fn(this));
    this.tail = task.catch(() => {});
    return task;
  }
}
export function namespace(env: QuotaEnv = {}): Namespace {
  const objects = new Map<string, AiBudget>();
  return {
    idFromName: (name) => name,
    get: (id) => {
      const key = String(id);
      if (!objects.has(key))
        objects.set(key, new AiBudget({ storage: new MemoryStorage() }, env));
      return { fetch: (r) => objects.get(key)!.fetch(r) };
    },
  };
}
