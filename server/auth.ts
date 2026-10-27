import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
export interface AuthEnv {
  ACCESS_TEAM_DOMAIN: string;
  ACCESS_AUDIENCE: string;
  ALLOWED_EMAILS?: string;
  ALLOWED_SUBJECTS?: string;
}
const keys = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function verifyAccess(
  req: Request,
  env: AuthEnv,
  testKeys?: JWTVerifyGetKey,
) {
  if (
    !/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(env.ACCESS_TEAM_DOMAIN || "") ||
    !env.ACCESS_AUDIENCE
  )
    throw new ApiError(503, "احراز هویت سرور پیکربندی نشده است");
  const emails = (env.ALLOWED_EMAILS || "")
      .split(",")
      .map((x) => x.trim().toLowerCase())
      .filter(Boolean),
    subjects = (env.ALLOWED_SUBJECTS || "")
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
  if (!emails.length && !subjects.length)
    throw new ApiError(503, "مجوز کاربر سرور پیکربندی نشده است");
  const assertion = req.headers.get("Cf-Access-Jwt-Assertion");
  if (!assertion) throw new ApiError(401, "ابتدا به بک‌اند امن وارد شوید");
  const issuer = "https://" + env.ACCESS_TEAM_DOMAIN;
  let jwks = testKeys;
  if (!jwks) {
    if (!keys.has(issuer))
      keys.set(
        issuer,
        createRemoteJWKSet(new URL(issuer + "/cdn-cgi/access/certs")),
      );
    jwks = keys.get(issuer)!;
  }
  try {
    const { payload } = await jwtVerify(assertion, jwks, {
      issuer,
      audience: env.ACCESS_AUDIENCE,
      algorithms: ["RS256"],
      requiredClaims: ["sub", "exp", "iat"],
      clockTolerance: 5,
    });
    if (
      !payload.sub ||
      !(
        subjects.includes(payload.sub) ||
        (typeof payload.email === "string" &&
          emails.includes(payload.email.toLowerCase()))
      )
    )
      throw new ApiError(403, "این کاربر مجوز دسترسی ندارد");
    return payload.sub;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(401, "نشست معتبر نیست یا منقضی شده است");
  }
}
