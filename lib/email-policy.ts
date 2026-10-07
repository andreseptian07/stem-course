import { readEmailSettings } from "./email-settings.ts";
import type { PlatformDatabase } from "./database.ts";
import { AuthError } from "./auth-policy.ts";
export async function emailRequired(d: PlatformDatabase, env = process.env) { return env.APP_URL ? (await readEmailSettings(d, env)).state.required : env.AUTH_REQUIRE_EMAIL_VERIFICATION === "true"; }
export async function emailStatus(d: PlatformDatabase, userId: string) {
  const row = await d.prepare("SELECT c.email,s.verified_at AS verifiedAt FROM auth_credentials c LEFT JOIN auth_email_status s ON s.user_id=c.user_id AND s.email=c.email WHERE c.user_id=?")
    .bind(userId).first<{ email: string; verifiedAt: string | null }>();
  if (!row) throw new AuthError(401, "Silakan masuk kembali.");
  return { email: row.email, verified: !!row.verifiedAt, required: await emailRequired(d) };
}
export async function requireVerifiedEmail(d: PlatformDatabase, userId: string) {
  const owner = await d.prepare("SELECT value FROM settings WHERE `key`='owner'").first<{ value: string }>();
  if (owner?.value === userId) return;
  if (!(await emailRequired(d))) return;
  if (!(await emailStatus(d, userId)).verified) throw new AuthError(403, "Verifikasi email Anda melalui halaman Verifikasi email sebelum melanjutkan.");
}
