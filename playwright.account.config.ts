import { defineConfig } from "@playwright/test";
import base from "./playwright.config";
export default defineConfig({
  ...base,
  testMatch: "account-auth.spec.ts",
  use: { ...base.use, baseURL: "http://127.0.0.1:5192" },
  webServer: {
    command:
      "VITE_ACCOUNT_API_BASE=/api npm run dev -- --host 127.0.0.1 --port 5192",
    url: "http://127.0.0.1:5192",
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
});
