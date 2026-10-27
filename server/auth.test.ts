import { it, expect } from "vitest";
import { generateKeyPair, exportJWK, SignJWT, createLocalJWKSet } from "jose";
import { verifyAccess } from "./auth";
const env = {
  ACCESS_TEAM_DOMAIN: "team.cloudflareaccess.com",
  ACCESS_AUDIENCE: "cheghad-aud",
  ALLOWED_EMAILS: "owner@example.com",
};
async function fixture() {
  const keys = await generateKeyPair("RS256");
  const jwk = await exportJWK(keys.publicKey);
  const keySet = createLocalJWKSet({
    keys: [{ ...jwk, kid: "trusted", alg: "RS256" }],
  });
  const sign = (extra: Record<string, unknown> = {}) =>
    new SignJWT({ email: "owner@example.com", ...extra })
      .setProtectedHeader({ alg: "RS256", kid: "trusted" })
      .setSubject("owner")
      .setIssuer("https://team.cloudflareaccess.com")
      .setAudience("cheghad-aud")
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(keys.privateKey);
  return { keySet, sign };
}
it("JWT معتبر با issuer، audience و کاربر مجاز پذیرفته می‌شود", async () => {
  const { keySet, sign } = await fixture();
  const req = new Request("https://api.example/api/ai/chat", {
    headers: { "Cf-Access-Jwt-Assertion": await sign() },
  });
  expect(await verifyAccess(req, env, keySet)).toBe("owner");
});
it("توکن ساختگی، audience اشتباه و کاربر غیرمجاز رد می‌شوند", async () => {
  const { keySet, sign } = await fixture();
  const req = (token: string) =>
    new Request("https://api.example", {
      headers: { "Cf-Access-Jwt-Assertion": token },
    });
  await expect(verifyAccess(req("fake"), env, keySet)).rejects.toMatchObject({
    status: 401,
  });
  await expect(
    verifyAccess(
      req(await sign()),
      { ...env, ACCESS_AUDIENCE: "wrong" },
      keySet,
    ),
  ).rejects.toMatchObject({ status: 401 });
  await expect(
    verifyAccess(req(await sign({ email: "other@example.com" })), env, keySet),
  ).rejects.toMatchObject({ status: 403 });
});
it("کلید خودساخته با نام issuer صحیح و توکن منقضی پذیرفته نمی‌شوند", async () => {
  const trusted = await fixture(),
    other = await fixture();
  const req = (token: string) =>
    new Request("https://api.example", {
      headers: { "Cf-Access-Jwt-Assertion": token },
    });
  await expect(
    verifyAccess(req(await other.sign()), env, trusted.keySet),
  ).rejects.toMatchObject({ status: 401 });
  const keys = await generateKeyPair("RS256"),
    jwk = await exportJWK(keys.publicKey),
    set = createLocalJWKSet({
      keys: [{ ...jwk, kid: "expired", alg: "RS256" }],
    });
  const expired = await new SignJWT({ email: "owner@example.com" })
    .setProtectedHeader({ alg: "RS256", kid: "expired" })
    .setSubject("owner")
    .setIssuer("https://team.cloudflareaccess.com")
    .setAudience("cheghad-aud")
    .setIssuedAt(Math.floor(Date.now() / 1000) - 300)
    .setExpirationTime(Math.floor(Date.now() / 1000) - 30)
    .sign(keys.privateKey);
  await expect(verifyAccess(req(expired), env, set)).rejects.toMatchObject({
    status: 401,
  });
});
it("نبود پیکربندی هویت و فهرست مجاز، سرویس را بسته نگه می‌دارد", async () => {
  await expect(
    verifyAccess(new Request("https://api.example"), {
      ...env,
      ACCESS_TEAM_DOMAIN: "",
    }),
  ).rejects.toMatchObject({ status: 503 });
  await expect(
    verifyAccess(new Request("https://api.example"), {
      ...env,
      ALLOWED_EMAILS: "",
    }),
  ).rejects.toMatchObject({ status: 503 });
});
