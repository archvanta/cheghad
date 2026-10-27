import { execFileSync } from "node:child_process";

// Explicit account build for Cloudflare; GitHub Pages keeps its separate build.
execFileSync(
  process.platform === "win32" ? "npm.cmd" : "npm",
  ["run", "build"],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      GITHUB_PAGES: "false",
      VITE_ACCOUNT_API_BASE: "/api",
    },
  },
);
