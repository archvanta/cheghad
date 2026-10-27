import { Miniflare, convertV4MiniflareOptions } from "miniflare";
const files = new Map();
const mf = new Miniflare(
  convertV4MiniflareOptions({
    modules: true,
    rootPath: process.cwd(),
    scriptPath: process.cwd() + "/.wrangler/runtime-check/worker.js",
    compatibilityDate: "2026-10-01",
    cf: false,
    durableObjects: {
      ACCOUNTS: { className: "AccountVault", useSQLite: true },
    },
    bindings: {
      GITHUB_DATA_REPO: "owner/private-data",
      GITHUB_DATA_TOKEN: "mock-token",
      AUTH_PEPPER: "runtime-check-pepper-12345678901234567890",
      LEDGER_ENCRYPTION_KEY: Buffer.alloc(32, 42).toString("base64"),
    },
    outboundService: async (req) => {
      const url = new URL(req.url);
      const prefix = "/repos/owner/private-data";
      if (url.pathname === prefix)
        return Response.json({ private: true, archived: false });
      if (req.method === "PUT") {
        const data = await req.json(),
          old = files.get(url.pathname);
        if (old?.sha !== data.sha) return Response.json({}, { status: 409 });
        files.set(url.pathname, {
          content: data.content,
          sha: crypto.randomUUID(),
          encoding: "base64",
        });
        return Response.json({}, { status: 201 });
      }
      return files.has(url.pathname)
        ? Response.json(files.get(url.pathname))
        : Response.json({}, { status: 404 });
    },
  }),
);
try {
  const res = await mf.dispatchFetch(
    "https://app.example/api/accounts/signup",
    {
      method: "POST",
      headers: {
        Origin: "https://app.example",
        "X-Cheghad-Request": "1",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        username: "runtime_user",
        credential: "A".repeat(43),
        version: 1,
      }),
    },
  );
  const body = await res.json();
  if (res.status !== 200)
    throw Error(JSON.stringify({ status: res.status, body }));
  const cookie = res.headers.get("set-cookie").split(";")[0];
  const ledger = await mf.dispatchFetch("https://app.example/api/ledger", {
    headers: { Cookie: cookie },
  });
  if (ledger.status !== 200) throw Error("Ledger read failed " + ledger.status);
  const document = await ledger.json();
  document.ledger.profile.cash = 98765;
  const saved = await mf.dispatchFetch("https://app.example/api/ledger", {
    method: "PUT",
    headers: {
      Cookie: cookie,
      Origin: "https://app.example",
      "X-Cheghad-Request": "1",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ledger: document.ledger, action: "runtime check" }),
  });
  if (saved.status !== 200) throw Error("Ledger write failed " + saved.status);
  const again = await mf.dispatchFetch("https://app.example/api/ledger", {
    headers: { Cookie: cookie },
  });
  const persisted = await again.json();
  if (
    persisted.ledger.profile.cash !== 98765 ||
    persisted.ledger.revision !== 1
  )
    throw Error("Ledger was not persisted");
  const envelope = JSON.parse(
    Buffer.from([...files.values()][0].content, "base64").toString(),
  );
  if (Object.keys(envelope).sort().join(",") !== "ciphertext,iv,version")
    throw Error("Unexpected plaintext in GitHub file");
  console.log(
    "PASS: Workers runtime signup, crypto, Durable Object session, encrypted GitHub write and read",
  );
} finally {
  await mf.dispose();
}
