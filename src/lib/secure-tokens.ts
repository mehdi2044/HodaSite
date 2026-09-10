import {
  createHmac,
  randomBytes,
  timingSafeEqual,
  createCipheriv,
  createDecipheriv,
  createHash,
} from "node:crypto";
export function opaqueToken() {
  return randomBytes(32).toString("hex");
}
export function tokenHash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
function secret() {
  const value = process.env.AUTH_SECRET;
  if (!value) throw new Error("AUTH_SECRET required");
  return value;
}
export function signValue(value: string) {
  return createHmac("sha256", secret()).update(value).digest("hex");
}
export function equalSecret(a: string, b: string) {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export function seal(value: unknown) {
  const nonce = randomBytes(12),
    key = createHash("sha256").update(secret()).digest();
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  const data = Buffer.concat([
    cipher.update(JSON.stringify(value)),
    cipher.final(),
  ]);
  return Buffer.concat([nonce, cipher.getAuthTag(), data]).toString(
    "base64url",
  );
}
export function unseal(value: string): unknown {
  const data = Buffer.from(value, "base64url"),
    key = createHash("sha256").update(secret()).digest();
  const cipher = createDecipheriv("aes-256-gcm", key, data.subarray(0, 12));
  cipher.setAuthTag(data.subarray(12, 28));
  return JSON.parse(
    Buffer.concat([
      cipher.update(data.subarray(28)),
      cipher.final(),
    ]).toString(),
  );
}
