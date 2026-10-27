import { it, expect } from "vitest";
import {
  emptyState,
  entrySchema,
  debtSchema,
  goldAssetSchema,
  scenarioSchema,
  type Scenario,
} from "./model";
import { project } from "./forecast";
const scenario = (extra: Partial<Scenario> = {}) => {
  const now = new Date().toISOString();
  return scenarioSchema.parse({
    id: crypto.randomUUID(),
    title: "فرض عمومی",
    available: 1000,
    goldAmount: 0,
    usdAmount: 0,
    debtAmount: 0,
    reserveAmount: 0,
    debtMode: "face",
    goldChange: 0,
    usdChange: 0,
    feeBps: 0,
    plans: [],
    createdAt: now,
    updatedAt: now,
    ...extra,
  });
};
const fixture = () => {
  const now = new Date().toISOString();
  const debt = debtSchema.parse({
    id: crypto.randomUUID(),
    title: "عمومی",
    provider: "",
    reference: "",
    principal: null,
    allowEarly: "unknown",
    allowPartial: "unknown",
    notes: "",
    createdAt: now,
    updatedAt: now,
  });
  const base = {
    id: crypto.randomUUID(),
    title: "عمومی",
    amount: 1000,
    dueDate: "2026-01-05",
    confirmed: true,
    payments: [],
    createdAt: now,
    updatedAt: now,
  };
  const asset = goldAssetSchema.parse({
    id: crypto.randomUUID(),
    title: "طلا عمومی",
    kind: "18k",
    unit: "gram",
    price: 1000,
    priceDate: "2026-01-01",
    spreadBps: 100,
    createdAt: now,
    updatedAt: now,
  });
  return {
    ...emptyState(),
    openingBalance: 1000,
    debts: [debt],
    goldAssets: [asset],
    entries: [
      entrySchema.parse({ ...base, kind: "installment", debtId: debt.id }),
      entrySchema.parse({
        ...base,
        id: crypto.randomUUID(),
        kind: "income",
        amount: 3000,
        dueDate: "2026-01-15",
      }),
      entrySchema.parse({
        ...base,
        id: crypto.randomUUID(),
        kind: "expense",
        amount: 500,
        dueDate: "2026-01-10",
      }),
    ],
  };
};
it("پرداخت زودهنگام بدون تخفیف ثروت جدید نمی‌سازد", () => {
  const s = fixture();
  const normal = project(s, "2026-01-01", 3);
  const early = project(
    s,
    "2026-01-01",
    3,
    scenario({ debtId: s.debts[0].id, debtAmount: 1000 }),
  );
  expect(normal.final.netWorth).toBe(2500);
  expect(early.final.netWorth).toBe(normal.final.netWorth);
  expect(s.entries[0].payments).toEqual([]);
  expect(early.warnings.join()).toContain("فرضی");
});
it("خرید دارایی با قیمت ثابت پول را دوبار نمی‌شمارد", () => {
  const s = fixture();
  const copy = JSON.stringify(s);
  const result = project(
    s,
    "2026-01-01",
    3,
    scenario({ goldAssetId: s.goldAssets[0].id, goldAmount: 500 }),
  );
  expect([result.final.cash, result.final.gold, result.final.netWorth]).toEqual(
    [2000, 500, 2500],
  );
  expect(JSON.stringify(s)).toBe(copy);
});
it("کسری قبل از حقوق به صورت منفی و روزانه ثبت می‌شود", () => {
  const s = fixture();
  s.openingBalance = 0;
  const r = project(s, "2026-01-01", 3);
  expect(r.minimum).toBe(-1500);
  expect(r.points.find((p) => p.date === "2026-01-10")?.cash).toBe(-1500);
});
it("نرخ دلار، کارمزد و قیمت ماهانه مستقل‌اند", () => {
  const s = fixture();
  s.goldAssets[0] = { ...s.goldAssets[0], kind: "usd", unit: "usd" };
  const r = project(
    s,
    "2026-01-01",
    3,
    scenario({ usdAssetId: s.goldAssets[0].id, usdAmount: 500, usdChange: 20 }),
  );
  expect(r.final.usd).toBe(600);
  expect(r.final.gold).toBe(0);
  expect(r.final.netWorth).toBe(2600);
  const fee = project(
    s,
    "2026-01-01",
    3,
    scenario({ usdAssetId: s.goldAssets[0].id, usdAmount: 500, feeBps: 1000 }),
  );
  expect(fee.final.netWorth).toBeLessThan(2500);
});
it("خرید پلکانی و ذخیره نقدی در نتایج اثر دارند", () => {
  const s = fixture();
  const r = project(
    s,
    "2026-01-01",
    3,
    scenario({
      reserveAmount: 400,
      plans: [
        { month: 0, assetId: s.goldAssets[0].id, budget: 500, price: 2000 },
      ],
    }),
  );
  expect(r.holdings[0].quantity).toBe("0.25");
  expect(r.final.cash).toBe(2000);
  expect(r.final.capacity).toBe(1600);
});
it("تخصیص اضافه، دارایی بی‌قیمت و مبلغ بدهی نامعلوم رد می‌شوند", () => {
  expect(() => scenario({ goldAmount: 1001 })).toThrow();
  const s = fixture();
  s.goldAssets[0].price = null;
  expect(() =>
    project(
      s,
      "2026-01-01",
      3,
      scenario({ goldAmount: 500, goldAssetId: s.goldAssets[0].id }),
    ),
  ).toThrow();
  s.entries[0].amount = null;
  expect(() =>
    project(
      s,
      "2026-01-01",
      3,
      scenario({ debtAmount: 500, debtId: s.debts[0].id }),
    ),
  ).toThrow();
});
