import type { Ledger } from "./finance";
// No personal figures or seeded financial records are shipped.
export const initial: Ledger = {
  version: 2,
  revision: 0,
  profile: {
    cash: 0,
    reserve: 0,
    goldGrams: 0,
    goldPrice: null,
    goldFeePct: 0,
    goldCost: null,
    usdUnits: 0,
    usdPrice: null,
    usdCost: null,
    theme: "dark",
  },
  entries: [],
  payments: [],
  budgets: [],
  history: [],
};
