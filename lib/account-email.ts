import { createHash, randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { databaseSql, type PlatformDatabase } from "./database.ts";
import { AuthError, appOrigin } from "./auth-policy.ts";
import { authRateLimit, registrationSchema } from "./auth-data.ts";
import { hashPassword, validatePassword } from "./auth-password.ts";

export type EmailPurpose = "verify" | "reset";
export type AccountMail = { to: string; purpose: EmailPurpose | "changed" | "test" | "staffInvite"; staffRole?: "Tutor" | "Tim Kurikulum"; url?: string };
export type DeliverMail = (message: AccountMail) => Promise<void>;
const digest = (token: string) => createHash("sha256").update(token).digest("hex");
export const emailToken = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export const emailRequest = z.object({ email: registrationSchema.shape.email }).strict();
export const requestMessage = "Jika alamat tersebut terdaftar dan membutuhkan tautan, email akan dikirim. Periksa inbox dan folder spam.";

// SMTP runs after the response so delivery timing does not reveal account existence.
// The returned task stays server-side; the token never appears in the API response.
export async function prepareAccountEmail(d: PlatformDatabase, raw: unknown, purpose: EmailPurpose, deliver: DeliverMail, env = process.env, at = Date.now()) {
  const { email } = emailRequest.parse(raw);
  const origin = appOrigin(env);
  await authRateLimit(d, purpose === "reset" ? "recovery" : "verification", email, at);
  const token = randomBytes(32).toString("base64url"), hash = digest(token);
  const expiry = at + (purpose === "reset" ? 30 * 60 * 1000 : 24 * 60 * 60 * 1000);
  await d.prepare("DELETE FROM auth_email_tokens WHERE expires_at<=?").bind(at).run();
  const result = await d.prepare(`INSERT INTO auth_email_tokens(token_hash,user_id,email,purpose,password_version,created_at,expires_at) SELECT ?,c.user_id,c.email,?,c.password_version,?,? FROM auth_credentials c WHERE c.email=? ${purpose === "verify" ? "AND NOT EXISTS(SELECT 1 FROM auth_email_status s WHERE s.user_id=c.user_id AND s.email=c.email AND s.verified_at IS NOT NULL)" : ""}`)
    .bind(hash, purpose, at, expiry, email).run();
  const delivery = async () => {
    if (!result.meta.changes) return;
    try {
      // Use a fragment so bearer tokens are not sent in GET URLs or access logs.
      await deliver({ to: email, purpose, url: `${origin}/${purpose === "reset" ? "reset-password" : "verify-email"}#token=${token}` });
    } catch {
      try { await d.prepare("DELETE FROM auth_email_tokens WHERE token_hash=? AND used_at IS NULL").bind(hash).run(); }
      catch { console.warn("Unsent account email token cleanup failed."); }
      console.warn("Account email delivery failed; request another link or contact the operator.");
    }
  };
  return { message: requestMessage, delivery };
}

type TokenRecord = { userId: string; email: string; passwordVersion: number };
const validRecord = "t.token_hash=? AND t.purpose=? AND t.used_at IS NULL AND t.expires_at>? AND c.user_id=t.user_id AND c.email=t.email AND c.password_version=t.password_version";
async function findToken(d: PlatformDatabase, token: unknown, purpose: EmailPurpose, at: number) {
  const parsed = emailToken.safeParse(token);
  if (!parsed.success) throw new AuthError(400, "Tautan tidak valid atau kedaluwarsa. Minta tautan baru.");
  const hash = digest(parsed.data);
  const c = await d.prepare(`SELECT t.user_id AS userId,t.email,t.password_version AS passwordVersion FROM auth_email_tokens t JOIN auth_credentials c ON c.user_id=t.user_id WHERE ${validRecord}`)
    .bind(hash, purpose, at).first<TokenRecord>();
  if (!c) throw new AuthError(400, "Tautan tidak valid atau kedaluwarsa. Minta tautan baru.");
  return { ...c, hash };
}
// Validate without consuming the link; submit still rechecks validity atomically.
export async function checkResetToken(d: PlatformDatabase, token: unknown, at = Date.now()) {
  await findToken(d, token, "reset", at);
  return { valid: true };
}
export async function confirmEmail(d: PlatformDatabase, token: unknown, at = Date.now()) {
  const c = await findToken(d, token, "verify", at), claim = randomUUID(), verifiedAt = new Date(at).toISOString();
  const result = await d.batch([
    d.prepare("UPDATE auth_email_tokens SET used_at=?,claim_id=? WHERE token_hash=? AND purpose='verify' AND used_at IS NULL AND expires_at>? AND EXISTS(SELECT 1 FROM auth_credentials c WHERE c.user_id=auth_email_tokens.user_id AND c.email=auth_email_tokens.email AND c.password_version=auth_email_tokens.password_version)")
      .bind(at, claim, c.hash, at),
    d.prepare(databaseSql(d,
      "INSERT INTO auth_email_status(user_id,email,verified_at) SELECT user_id,email,? FROM auth_email_tokens WHERE token_hash=? AND claim_id=? ON CONFLICT(user_id) DO UPDATE SET email=excluded.email,verified_at=excluded.verified_at",
      "INSERT INTO auth_email_status(user_id,email,verified_at) SELECT user_id,email,? FROM auth_email_tokens WHERE token_hash=? AND claim_id=? ON DUPLICATE KEY UPDATE email=VALUES(email),verified_at=VALUES(verified_at)"))
      .bind(verifiedAt, c.hash, claim),
  ]);
  if (!result[0].meta.changes) throw new AuthError(400, "Tautan sudah digunakan atau tidak berlaku. Minta tautan baru.");
  return { message: "Email berhasil diverifikasi. Persetujuan akses belajar tetap mengikuti status akun Anda." };
}
export async function resetPasswordWithToken(d: PlatformDatabase, raw: unknown, at = Date.now()) {
  const b = z.object({ token: emailToken, password: z.string().min(15).max(128) }).strict().parse(raw);
  validatePassword(b.password);
  const c = await findToken(d, b.token, "reset", at);
  const passwordHash = await hashPassword(b.password);
  const changedAt = new Date(at).toISOString();
  const result = await d.batch([
    d.prepare("UPDATE auth_credentials SET password_hash=?,password_version=password_version+1,updated_at=? WHERE user_id=? AND email=? AND password_version=? AND EXISTS(SELECT 1 FROM auth_email_tokens t WHERE t.token_hash=? AND t.purpose='reset' AND t.used_at IS NULL AND t.expires_at>? AND t.user_id=auth_credentials.user_id AND t.email=auth_credentials.email AND t.password_version=auth_credentials.password_version)")
      .bind(passwordHash, changedAt, c.userId, c.email, c.passwordVersion, c.hash, at),
    d.prepare("UPDATE auth_email_tokens SET used_at=? WHERE user_id=? AND password_version<=? AND used_at IS NULL AND EXISTS(SELECT 1 FROM auth_credentials c WHERE c.user_id=auth_email_tokens.user_id AND c.password_hash=?)")
      .bind(at, c.userId, c.passwordVersion, passwordHash),
    d.prepare("DELETE FROM auth_sessions WHERE user_id=? AND password_version<=? AND EXISTS(SELECT 1 FROM auth_credentials c WHERE c.user_id=auth_sessions.user_id AND c.password_hash=?)")
      .bind(c.userId, c.passwordVersion, passwordHash),
  ]);
  if (!result[0].meta.changes) throw new AuthError(400, "Tautan sudah digunakan atau tidak berlaku. Minta tautan baru.");
  return { message: "Password berhasil diubah. Semua sesi sebelumnya diakhiri. Silakan masuk kembali.", email: c.email };
}
