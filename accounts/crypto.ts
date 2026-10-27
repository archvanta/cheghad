const bytes = (s: string) => new TextEncoder().encode(s);
export function base64(data: Uint8Array) {
  return btoa(Array.from(data, (n) => String.fromCharCode(n)).join(""));
}
export function unbase64(value: string) {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}
export function randomToken(size = 32) {
  return base64(crypto.getRandomValues(new Uint8Array(size)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
export async function digest(value: string) {
  return base64(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes(value))),
  );
}
export async function verifier(
  credential: string,
  salt: string,
  pepper: string,
) {
  const hmac = await crypto.subtle.importKey(
    "raw",
    bytes(pepper),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const prehash = await crypto.subtle.sign("HMAC", hmac, bytes(credential));
  const key = await crypto.subtle.importKey("raw", prehash, "PBKDF2", false, [
    "deriveBits",
  ]);
  return base64(
    new Uint8Array(
      await crypto.subtle.deriveBits(
        {
          name: "PBKDF2",
          hash: "SHA-256",
          iterations: 100000,
          salt: unbase64(salt),
        },
        key,
        256,
      ),
    ),
  );
}
export function equal(a: string, b: string) {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++)
    difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}
async function encryptionKey(secret: string, userId: string) {
  const root = unbase64(secret);
  if (root.length !== 32) throw Error("Encryption configuration invalid");
  const key = await crypto.subtle.importKey("raw", root, "HKDF", false, [
    "deriveKey",
  ]);
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: bytes(userId),
      info: bytes("cheghad.private-ledger.v1"),
    },
    key,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}
export async function seal(value: unknown, secret: string, userId: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: bytes(userId + ":v1") },
    await encryptionKey(secret, userId),
    bytes(JSON.stringify(value)),
  );
  return {
    version: 1,
    iv: base64(iv),
    ciphertext: base64(new Uint8Array(ciphertext)),
  };
}
export async function unseal(
  value: { version: number; iv: string; ciphertext: string },
  secret: string,
  userId: string,
): Promise<unknown> {
  if (value.version !== 1 || unbase64(value.iv).length !== 12)
    throw Error("Invalid encrypted data");
  const plaintext = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: unbase64(value.iv),
      additionalData: bytes(userId + ":v1"),
    },
    await encryptionKey(secret, userId),
    unbase64(value.ciphertext),
  );
  return JSON.parse(new TextDecoder().decode(plaintext));
}
