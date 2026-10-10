import { createHash, randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { databaseSql, type PlatformDatabase } from "./database.ts";
import { AuthError, sessionDuration, idleDuration } from "./auth-policy.ts";
import { hashPassword, verifyPassword, validatePassword } from "./auth-password.ts";
import { policySql } from "./authorization.ts";
import { registerIdentity } from "./access.ts";
import { requireVerifiedEmail } from "./email-policy.ts";
import { publishedSql } from "./database-sql.ts";

export type SignedUser = { userId: string; displayName: string; email: string };
type Credential = SignedUser & { passwordHash: string; passwordVersion: number };
export const registrationSchema = z.object({
  email: z.string().trim().email().max(254).transform((v) => v.toLowerCase()),
  displayName: z.string().trim().min(1).max(100),
  password: z.string().min(15).max(128),
  courseId: z.string().min(1).max(80).regex(/^[a-zA-Z0-9_-]+$/).optional(),
}).strict();
export const loginSchema = z.object({ email: registrationSchema.shape.email, password: z.string().min(1).max(128) }).strict();
const digest = (text: string) => createHash("sha256").update(text).digest("hex");
const tokenValid = (token: unknown): token is string => typeof token === "string" && /^[A-Za-z0-9_-]{43}$/.test(token);
const credentialSql = "SELECT user_id AS userId,email,display_name AS displayName,password_hash AS passwordHash,password_version AS passwordVersion FROM auth_credentials";

async function ownerExists(d: PlatformDatabase) {
  if (!(await d.prepare("SELECT 1 FROM settings WHERE `key`='owner'").first()))
    throw new AuthError(503, "Akun pengelola belum disiapkan.");
}
async function consumeLimit(d: PlatformDatabase, key: string, limit: number, window: number, at: number) {
  const bucket = digest(key);
  await d.prepare(databaseSql(d,
    "INSERT INTO auth_limits(bucket_id,hits,expires_at) VALUES(?,1,?) ON CONFLICT(bucket_id) DO UPDATE SET hits=CASE WHEN expires_at<=? THEN 1 ELSE min(hits+1,?) END,expires_at=CASE WHEN expires_at<=? THEN excluded.expires_at ELSE expires_at END",
    "INSERT INTO auth_limits(bucket_id,hits,expires_at) VALUES(?,1,?) ON DUPLICATE KEY UPDATE hits=IF(expires_at<=?,1,LEAST(hits+1,?)),expires_at=IF(expires_at<=?,VALUES(expires_at),expires_at)"))
    .bind(bucket, at + window, at, limit + 1, at).run();
  const row = await d.prepare("SELECT hits FROM auth_limits WHERE bucket_id=?").bind(bucket).first<{ hits: number }>();
  if (!row || row.hits > limit) throw new AuthError(429, "Terlalu banyak percobaan. Coba lagi setelah jeda.");
}
export async function authRateLimit(d: PlatformDatabase, action: "login" | "register" | "password" | "invite" | "activate" | "recovery" | "verification" | "emailConfirm" | "upload", email: string, at = Date.now()) {
  await d.prepare("DELETE FROM auth_limits WHERE expires_at<=?").bind(at).run();
  const registration = action === "register" || action === "invite" || action === "recovery" || action === "verification";
  const window = registration ? 60 * 60 * 1000 : 15 * 60 * 1000;
  // A shared database budget cannot be bypassed with forged forwarding headers.
  // Check it first so random email addresses cannot create unbounded buckets.
  await consumeLimit(d, `global:${action}`, registration ? 20 : 100, window, at);
  await consumeLimit(d, `${action}:${email}`, registration ? 3 : 10, window, at);
}
export async function registerAccount(d: PlatformDatabase, raw: unknown, enabled: boolean) {
  if (!enabled) throw new AuthError(403, "Pendaftaran belum dibuka. Hubungi pengelola.");
  const b = registrationSchema.parse(raw);
  validatePassword(b.password);
  await ownerExists(d);
  await authRateLimit(d, "register", b.email);
  if (b.courseId && !(await d.prepare(`SELECT 1 FROM courses c WHERE c.id=? AND ${publishedSql(d, "c.data")}`).bind(b.courseId).first()))
    throw new AuthError(404, "Course belum tersedia untuk pendaftaran.");
  const hash = await hashPassword(b.password), id = randomUUID(), at = new Date().toISOString();
  try {
    const statements = [
      d.prepare("INSERT INTO auth_credentials(user_id,email,display_name,password_hash,password_version,created_at,updated_at) VALUES(?,?,?,?,1,?,?)").bind(id, b.email, b.displayName, hash, at, at),
      d.prepare("INSERT INTO users(id,name,role) VALUES(?,?,'student')").bind(id, b.displayName),
      d.prepare("INSERT INTO account_principals(user_id,kind,version,updated_by,updated_at,proof) VALUES(?,'student',1,?,?,?)").bind(id,id,at,randomUUID()),
      d.prepare("INSERT INTO user_access(user_id,status,version,created_at,updated_at) VALUES(?,'pending',1,?,?)").bind(id, at, at),
    ];
    if (b.courseId) statements.push(d.prepare(`INSERT INTO enrollments(user_id,course_id,created_at,authorization_id) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM courses c WHERE c.id=? AND ${publishedSql(d, "c.data")})`).bind(id, b.courseId, at, randomUUID(), b.courseId));
    const result = await d.batch(statements);
    return { registered: true, courseRequested: b.courseId ? !!result[4].meta.changes : false };
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ER_DUP_ENTRY")
      throw new AuthError(400, "Pendaftaran belum dapat disimpan. Jika sudah memiliki akun, gunakan halaman masuk.");
    throw error;
  }
}
export async function loginAccount(d: PlatformDatabase, raw: unknown, previousToken?: string, requestedCourse?: string) {
  const b = loginSchema.parse(raw);
  await ownerExists(d);
  await authRateLimit(d, "login", b.email);
  const credential = await d.prepare(`${credentialSql} WHERE email=?`).bind(b.email).first<Credential>();
  if (!(await verifyPassword(b.password, credential?.passwordHash ?? null)) || !credential)
    throw new AuthError(401, "Email atau password tidak sesuai.");
  await requireVerifiedEmail(d, credential.userId);
  const user = await registerIdentity(d, credential, false);
  const token = randomBytes(32).toString("base64url"), hash = digest(token), now = Date.now();
  const statements = [
    d.prepare("DELETE FROM auth_sessions WHERE expires_at<=? OR last_seen<=?").bind(now, now - idleDuration),
    d.prepare("DELETE FROM auth_sessions WHERE token_hash=?").bind(tokenValid(previousToken) ? digest(previousToken) : ""),
    d.prepare("INSERT INTO auth_sessions(token_hash,user_id,password_version,created_at,last_seen,expires_at) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM auth_credentials WHERE user_id=? AND password_version=?)")
      .bind(hash, credential.userId, credential.passwordVersion, now, now, now + sessionDuration, credential.userId, credential.passwordVersion),
    // Keep the newest five sessions per account; ties have a stable token order.
    d.prepare("DELETE FROM auth_sessions WHERE user_id=? AND token_hash NOT IN (SELECT token_hash FROM (SELECT token_hash FROM auth_sessions WHERE user_id=? ORDER BY (token_hash=?) DESC,created_at DESC,token_hash DESC LIMIT 5) AS recent)")
      .bind(credential.userId, credential.userId, hash),
  ];
  if (requestedCourse) {
    registrationSchema.shape.courseId.parse(requestedCourse);
    statements.push(d.prepare(databaseSql(d,
      `INSERT OR IGNORE INTO enrollments(user_id,course_id,created_at,authorization_id) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM courses c WHERE c.id=? AND ${publishedSql(d,"c.data")}) AND ${policySql("student")}`,
      `INSERT INTO enrollments(user_id,course_id,created_at,authorization_id) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM courses c WHERE c.id=? AND ${publishedSql(d,"c.data")}) AND ${policySql("student")} ON DUPLICATE KEY UPDATE user_id=user_id`))
      .bind(user.id,requestedCourse,new Date().toISOString(),randomUUID(),requestedCourse,user.id));
  }
  const result = await d.batch(statements);
  if (!result[2].meta.changes) throw new AuthError(401, "Password berubah. Silakan masuk kembali.");
  return { token, accessStatus: user.accessStatus };
}
export async function sessionUser(d: PlatformDatabase, token: unknown, at = Date.now()): Promise<SignedUser | null> {
  if (!tokenValid(token)) return null;
  const hash = digest(token);
  const row = await d.prepare("SELECT c.user_id AS userId,c.email,c.display_name AS displayName,s.last_seen AS lastSeen FROM auth_sessions s JOIN auth_credentials c ON c.user_id=s.user_id AND c.password_version=s.password_version WHERE s.token_hash=? AND s.expires_at>? AND s.last_seen>?")
    .bind(hash, at, at - idleDuration).first<SignedUser & { lastSeen: number }>();
  if (!row) return null;
  if (row.lastSeen <= at - 5 * 60 * 1000) {
    const renewed = await d.prepare("UPDATE auth_sessions SET last_seen=? WHERE token_hash=? AND expires_at>? AND last_seen>? AND EXISTS(SELECT 1 FROM auth_credentials c WHERE c.user_id=auth_sessions.user_id AND c.password_version=auth_sessions.password_version)")
      .bind(at, hash, at, at - idleDuration).run();
    if (!renewed.meta.changes) return sessionUser(d, token, at);
  }
  return { userId: row.userId, email: row.email, displayName: row.displayName };
}
export async function logoutSession(d: PlatformDatabase, token: unknown) {
  if (tokenValid(token)) await d.prepare("DELETE FROM auth_sessions WHERE token_hash=?").bind(digest(token)).run();
}
export async function createOwner(d: PlatformDatabase, raw: unknown) {
  const b = registrationSchema.omit({ courseId: true }).strict().parse(raw);
  const hash = await hashPassword(b.password), id = randomUUID(), at = new Date().toISOString();
  const results = await d.batch([
    d.prepare("INSERT INTO auth_credentials(user_id,email,display_name,password_hash,password_version,created_at,updated_at) SELECT ?,?,?,?,1,?,? WHERE NOT EXISTS(SELECT 1 FROM settings WHERE `key`='owner')").bind(id, b.email, b.displayName, hash, at, at),
    d.prepare("INSERT INTO users(id,name,role) SELECT ?,?,'owner' WHERE EXISTS(SELECT 1 FROM auth_credentials WHERE user_id=?)").bind(id, b.displayName, id),
    d.prepare("INSERT INTO account_principals(user_id,kind,version,updated_by,updated_at,proof) SELECT ?,'staff',1,?,?,? WHERE EXISTS(SELECT 1 FROM auth_credentials WHERE user_id=?)").bind(id,id,at,randomUUID(),id),
    d.prepare("INSERT INTO user_access(user_id,status,version,created_at,updated_at) SELECT ?,'active',1,?,? WHERE EXISTS(SELECT 1 FROM auth_credentials WHERE user_id=?)").bind(id, at, at, id),
    d.prepare("INSERT INTO settings(`key`,value) SELECT 'owner',? WHERE EXISTS(SELECT 1 FROM auth_credentials WHERE user_id=?) ON DUPLICATE KEY UPDATE `key`=`key`").bind(id, id),
    d.prepare("INSERT INTO settings(`key`,value) SELECT 'owner_setup_closed','true' WHERE EXISTS(SELECT 1 FROM auth_credentials WHERE user_id=?) ON DUPLICATE KEY UPDATE `key`=`key`").bind(id),
  ]);
  if (!results[0].meta.changes) throw new AuthError(409, "Owner sudah ada. Gunakan akun yang sudah ditetapkan.");
  return { userId: id };
}
async function replacePassword(d: PlatformDatabase, c: Credential, password: string) {
  const hash = await hashPassword(password);
  const results = await d.batch([
    d.prepare("UPDATE auth_credentials SET password_hash=?,password_version=password_version+1,updated_at=? WHERE user_id=? AND password_version=?")
      .bind(hash, new Date().toISOString(), c.userId, c.passwordVersion),
    d.prepare("DELETE FROM auth_sessions WHERE user_id=? AND password_version<=?").bind(c.userId, c.passwordVersion),
  ]);
  if (!results[0].meta.changes) throw new AuthError(409, "Password berubah. Muat ulang sebelum mencoba lagi.");
}
export async function changePassword(d: PlatformDatabase, userId: string, current: string, password: string) {
  validatePassword(password);
  const c = await d.prepare(`${credentialSql} WHERE user_id=?`).bind(userId).first<Credential>();
  if (!c) throw new AuthError(401, "Silakan masuk kembali.");
  await authRateLimit(d, "password", c.email);
  if (!(await verifyPassword(current, c.passwordHash))) throw new AuthError(401, "Password saat ini tidak sesuai.");
  await replacePassword(d, c, password);
}
// Operator CLI only. Not exported through any public password-reset endpoint.
export async function resetPassword(d: PlatformDatabase, email: string, password: string) {
  const normalized = registrationSchema.shape.email.parse(email);
  const c = await d.prepare(`${credentialSql} WHERE email=?`).bind(normalized).first<Credential>();
  if (!c) throw new AuthError(404, "Akun tidak ditemukan.");
  await replacePassword(d, c, password);
}
