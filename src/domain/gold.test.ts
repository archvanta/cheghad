import { it, expect } from "vitest";
import {
  emptyState,
  goldAssetSchema,
  goldTransactionSchema,
  type GoldTransaction,
} from "./model";
import { goldPortfolio, quantityInput, tradeValue } from "./gold";
import { summary } from "./engine";
const fixture = () => {
  const now = new Date().toISOString();
  const a = goldAssetSchema.parse({
    id: crypto.randomUUID(),
    title: "طلای عمومی",
    kind: "18k",
    unit: "gram",
    price: 1200,
    priceDate: "2026-10-01",
    spreadBps: 100,
    createdAt: now,
    updatedAt: now,
  });
  const t = goldTransactionSchema.parse({
    id: crypto.randomUUID(),
    assetId: a.id,
    side: "buy",
    quantity: "2",
    price: 1000,
    commission: 100,
    workmanship: 0,
    tax: 0,
    other: 0,
    date: "2026-10-01",
    opening: false,
    notes: "",
    createdAt: now,
    updatedAt: now,
  });
  return {
    ...emptyState(),
    openingBalance: 5000,
    goldAssets: [a],
    goldTransactions: [t],
  };
};
it("خرید نقد را کم می‌کند و ارزش طلا را جدا نگه می‌دارد", () => {
  const s = fixture();
  const r = summary(s, "2026-10-01", "2026-10-31", "2026-10-01");
  expect([r.cash, r.goldValue, r.netWorth]).toEqual([2900, 2400, 5300]);
  const a = goldPortfolio(s)[0];
  expect([a.cost, a.average, a.unrealized, a.liquidation]).toEqual([
    2100, 1050, 300, 2376,
  ]);
});
it("فروش جزئی و کارمزد با میانگین موزون سود را محاسبه می‌کند", () => {
  const s = fixture();
  s.goldTransactions.push({
    ...s.goldTransactions[0],
    id: crypto.randomUUID(),
    side: "sell",
    quantity: "0.5",
    price: 1400,
    commission: 20,
    date: "2026-10-02",
  });
  const a = goldPortfolio(s)[0];
  expect([a.quantity, a.cost, a.realized, a.cashDelta]).toEqual([
    "1.5",
    1575,
    155,
    -1420,
  ]);
});
it("تغییر قیمت نقد را تغییر نمی‌دهد و فروش بیش از موجودی رد می‌شود", () => {
  const s = fixture();
  s.goldAssets[0].price = 2000;
  expect(summary(s, "2026-10-01", "2026-10-31", "2026-10-01").cash).toBe(2900);
  s.goldTransactions.push({
    ...s.goldTransactions[0],
    id: crypto.randomUUID(),
    side: "sell",
    quantity: "3",
    date: "2026-10-02",
  });
  expect(() => goldPortfolio(s)).toThrow();
});
it("موجودی اولیه بدون خروج دوباره وجه و قیمت نامعلوم با هشدار", () => {
  const s = fixture();
  s.goldTransactions[0].opening = true;
  s.goldAssets[0].price = null;
  const r = summary(s, "2026-10-01", "2026-10-31", "2026-10-01");
  expect(r.cash).toBe(5000);
  expect(r.incomplete).toBe(1);
});
it("دقت اعشاری و گردکردن صریح ریال و ورودی فارسی", () => {
  const s = fixture();
  s.goldTransactions[0].quantity = "0.000001";
  s.goldTransactions[0].price = 1500000;
  s.goldTransactions[0].commission = 0;
  expect(tradeValue(s.goldTransactions[0]).gross).toBe(2);
  expect(quantityInput("۱٫۲۵")).toBe("1.25");
});
it("سکه واحد و ارزش مستقل دارد و هزینه فروش بیش از عایدی رد می‌شود", () => {
  const s = fixture();
  expect(() =>
    goldAssetSchema.parse({ ...s.goldAssets[0], kind: "coin" }),
  ).toThrow();
  const t = {
    ...s.goldTransactions[0],
    side: "sell",
    price: 1,
  } as GoldTransaction;
  expect(() => tradeValue(t)).toThrow();
});
