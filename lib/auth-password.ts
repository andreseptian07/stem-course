import { scrypt, randomBytes, timingSafeEqual } from "node:crypto";
import { AuthError } from "./auth-policy.ts";
// OWASP's 32 MiB alternative: N=2^15, r=8, p=3. Keep resource use bounded.
const parameters = { N: 32768, r: 8, p: 3, maxmem: 48 * 1024 * 1024 };
let active = 0;
async function derive(password: string, salt: string) {
  if (active >= 2) throw new AuthError(429, "Layanan masuk sedang sibuk. Coba sebentar lagi.");
  active++;
  try {
    return await new Promise<Buffer>((resolve, reject) => scrypt(password, salt, 64, parameters,
      (error, key) => error ? reject(error) : resolve(key)));
  } finally { active--; }
}
export function validatePassword(password: unknown): asserts password is string {
  if (typeof password !== "string" || password.length < 15 || password.length > 128 || Buffer.byteLength(password, "utf8") > 512)
    throw new AuthError(400, "Password harus 15–128 karakter. Gunakan frasa yang panjang dan unik.");
}
export async function hashPassword(password: string) {
  validatePassword(password);
  const salt = randomBytes(16).toString("hex");
  const key = await derive(password, salt);
  return `scrypt:32768:8:3:${salt}:${key.toString("hex")}`;
}
const dummy = `scrypt:32768:8:3:${"0".repeat(32)}:${"0".repeat(128)}`;
export async function verifyPassword(password: string, stored: string | null) {
  if (typeof password !== "string" || password.length > 128 || Buffer.byteLength(password, "utf8") > 512) return false;
  const valid = typeof stored === "string" && /^scrypt:32768:8:3:[a-f0-9]{32}:[a-f0-9]{128}$/.test(stored);
  const parts = (valid ? stored! : dummy).split(":");
  const key = await derive(password, parts[4]);
  return timingSafeEqual(key, Buffer.from(parts[5], "hex")) && valid;
}
