import { it, expect } from "vitest";
import { initial } from "./data";
import { migrate, save, read, readUndo, purge } from "./store";
import { entrySchema, monthOf, nextMonth, actualCash } from "./finance";
it("مهاجرت پرداخت تکرارشونده قدیمی فقط یک دریافت واقعی می‌سازد", () => {
  const m = nextMonth(monthOf(), -1);
  const old = {
    profile: { cash: 0, reserve: 0, goldGrams: 0, goldPrice: 0, goldFeePct: 0 },
    entries: [
      {
        id: "old-income",
        name: "عمومی",
        amount: 1000,
        month: m,
        day: 1,
        kind: "income",
        status: "done",
        repeat: true,
      },
    ],
  };
  const l = migrate(old);
  expect(l.payments).toHaveLength(1);
  expect(actualCash(l)).toBe(1000);
  expect(l.payments[0].month).toBe(m);
});
it("مهاجرت معامله قدیمی فاقد مقدار متوقف می‌شود و داده را حدس نمی‌زند", () => {
  expect(() =>
    migrate({
      profile: initial.profile,
      entries: [
        {
          id: "old",
          name: "قدیمی",
          amount: 100,
          month: monthOf(),
          day: 1,
          kind: "goldBuy",
          status: "done",
          repeat: false,
        },
      ],
    }),
  ).toThrow();
});
it("ذخیره اتمیک، Undo و تعارض چندپنجره‌ای", async () => {
  await purge();
  const a = await save(structuredClone(initial));
  const b = await save({ ...a, profile: { ...a.profile, cash: 100 } });
  expect((await read())?.profile.cash).toBe(100);
  expect((await readUndo())?.profile.cash).toBe(0);
  await expect(
    save({ ...a, profile: { ...a.profile, cash: 200 } }),
  ).rejects.toThrow();
  expect((await read())?.revision).toBe(b.revision);
  await purge();
  expect(await readUndo()).toBeUndefined();
});
