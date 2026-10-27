import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";

const executablePath =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
  (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined);
export default defineConfig({
  testDir: "./e2e",
  timeout: 45000,
  use: {
    baseURL: "http://127.0.0.1:5191",
    viewport: { width: 1360, height: 1000 },
    launchOptions: { executablePath },
  },
  webServer: {
    command:
      "GITHUB_PAGES=true npm run build && GITHUB_PAGES=true npm run preview -- --host 127.0.0.1 --port 5191",
    url: "http://127.0.0.1:5191/cheghad/",
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
});
