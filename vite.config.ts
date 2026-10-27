import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  base: process.env.GITHUB_PAGES === "true" ? "/cheghad/" : "/",
  test: {
    include: [
      "src/**/*.test.{ts,tsx}",
      "server/**/*.test.ts",
      "accounts/**/*.test.ts",
    ],
    environment: "node",
    setupFiles: ["./src/test-setup.ts"],
  },
});
