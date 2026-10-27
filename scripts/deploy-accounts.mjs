// Run from the repository root. Credentials are read from secure environment
// variables; generated encryption keys are kept outside the repository.
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { execFileSync } from "node:child_process";
const workerName = "cheghad";
const env = process.env;
const required = [
  "CLOUDFLARE_API_TOKEN",
  "CLOUDFLARE_ACCOUNT_ID",
  "GITHUB_DATA_TOKEN",
  "GITHUB_DATA_REPO",
];
const missing = required.filter((name) => !env[name]);
if (missing.length)
  throw Error("Configure secure environment values: " + missing.join(", "));
if (
  !/^[a-f0-9]{32}$/.test(env.CLOUDFLARE_ACCOUNT_ID) ||
  !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(env.GITHUB_DATA_REPO)
)
  throw Error("Invalid account ID or private repository name");
async function cf(path, options = {}) {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}${path}`,
    {
      ...options,
      headers: {
        Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
      signal: AbortSignal.timeout(20000),
    },
  );
  if (res.status === 404) return null;
  const body = await res.json();
  if (!res.ok || !body.success)
    throw Error("Cloudflare request failed; check account permissions");
  return body.result;
}
const repoResponse = await fetch(
  "https://api.github.com/repos/" + env.GITHUB_DATA_REPO,
  {
    headers: {
      Authorization: `Bearer ${env.GITHUB_DATA_TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    signal: AbortSignal.timeout(20000),
  },
);
if (!repoResponse.ok)
  throw Error(
    "Private data repository is inaccessible; no deployment was made",
  );
const repo = await repoResponse.json();
if (repo.private !== true || repo.archived)
  throw Error("Data repository must be private and writable");
const existing = await cf(`/workers/services/${workerName}`);
const secretFile = resolve(
  env.CHEGHAD_SERVER_SECRET_FILE ||
    "/workspace/private-cheghad/backend-secrets.private.json",
);
if (existing && !existsSync(secretFile))
  throw Error(
    "Existing Worker found but its encryption-key backup is missing. Restore the original backup; never generate replacement keys.",
  );
if (!existsSync(secretFile)) {
  mkdirSync(dirname(secretFile), { recursive: true, mode: 0o700 });
  writeFileSync(
    secretFile,
    JSON.stringify(
      {
        AUTH_PEPPER: randomBytes(32).toString("base64"),
        LEDGER_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
      },
      null,
      2,
    ),
    { mode: 0o600, flag: "wx" },
  );
}
const keys = JSON.parse(readFileSync(secretFile, "utf8"));
if (
  typeof keys.AUTH_PEPPER !== "string" ||
  keys.AUTH_PEPPER.length < 32 ||
  Buffer.from(keys.LEDGER_ENCRYPTION_KEY || "", "base64").length !== 32
)
  throw Error("Invalid server key backup");
const runEnv = {
  ...env,
  XDG_CONFIG_HOME: env.XDG_CONFIG_HOME || "/tmp/cheghad-cloudflare-config",
  WRANGLER_SEND_METRICS: "false",
};
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const npx = process.platform === "win32" ? "npx.cmd" : "npx";
execFileSync(npm, ["run", "check"], { stdio: "inherit", env: runEnv });
const args = [
  "--config",
  "wrangler.toml",
  "--var",
  `GITHUB_DATA_REPO:${env.GITHUB_DATA_REPO}`,
];
// The first publish has no credentials and therefore refuses all account calls.
// Secrets are then applied, followed by a final publish with the same bindings.
execFileSync(npx, ["wrangler", "deploy", ...args], {
  stdio: "inherit",
  env: runEnv,
});
execFileSync(npx, ["wrangler", "secret", "bulk", "--config", "wrangler.toml"], {
  input: JSON.stringify({
    ...keys,
    GITHUB_DATA_TOKEN: env.GITHUB_DATA_TOKEN,
  }),
  stdio: ["pipe", "inherit", "inherit"],
  env: runEnv,
});
execFileSync(npx, ["wrangler", "deploy", ...args], {
  stdio: "inherit",
  env: runEnv,
});
const result = await cf("/workers/subdomain");
if (!/^[a-z0-9-]+$/.test(result?.subdomain || ""))
  throw Error("Worker deployed; public URL needs verification in Cloudflare");
console.log(
  "Account site: https://" +
    workerName +
    "." +
    result.subdomain +
    ".workers.dev/",
);
console.log(
  "Preserve the encryption-key backup securely. Do not commit it or share it in chat.",
);
