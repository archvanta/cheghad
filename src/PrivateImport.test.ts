import { expect, it } from "vitest";
import { initial } from "./data";
import { entrySchema, monthOf } from "./finance";
import { mergePrivateImport } from "./PrivateImport";
import { isDemoMode, setDemoMode } from "./account/mode";
import { read, save, purge } from "./store";
it("انتقال خصوصی ردیف را تکرار نمی‌کند و دفتر موجود را بازنویسی نمی‌کند", () => {
  const e = entrySchema.parse({
    id: "private-import-one",
    name: "خصوصی",
    amount: 100,
    month: monthOf(),
    day: 1,
    kind: "income",
    status: "planned",
    repeat: true,
  });
  const incoming = {
    ...structuredClone(initial),
    profile: { ...initial.profile, cash: 1000 },
    entries: [e],
  };
  const first = mergePrivateImport(initial, incoming);
  expect(first.profile.cash).toBe(1000);
  expect(first.entries).toHaveLength(1);
  expect(
    mergePrivateImport({ ...first, revision: 1 }, incoming).entries,
  ).toHaveLength(1);
  expect(
    mergePrivateImport({ ...initial, revision: 1 }, incoming).profile.cash,
  ).toBe(0);
});
it("دمو به داده‌های واقعی همین مرورگر دسترسی ندارد", async () => {
  setDemoMode(false);
  await purge();
  await save({ ...initial, profile: { ...initial.profile, cash: 1000 } });
  setDemoMode(true);
  await purge();
  expect(await read()).toBeUndefined();
  await save({ ...initial, profile: { ...initial.profile, cash: 99 } });
  expect((await read())?.profile.cash).toBe(99);
  setDemoMode(false);
  expect((await read())?.profile.cash).toBe(1000);
  await purge();
  expect(isDemoMode()).toBe(false);
});
