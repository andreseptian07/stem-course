import { createHash, randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { requireOwner, AccessError, type PlatformUser } from "./access.ts";
import { databaseSql, type PlatformDatabase } from "./database.ts";
import { authRateLimit, registrationSchema, type SignedUser } from "./auth-data.ts";
import { hashPassword, validatePassword } from "./auth-password.ts";
import { appOrigin } from "./auth-policy.ts";

const id = z.string().min(1).max(80).regex(/^[a-zA-Z0-9_-]+$/);
export const inviteSchema = z.object({
  email: registrationSchema.shape.email,
  displayName: registrationSchema.shape.displayName,
  classId: id.nullable(),
}).strict();
export const activationSchema = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  email: registrationSchema.shape.email,
  password: z.string().min(15).max(128).optional(),
}).strict();
export const tutorMutation = z.discriminatedUnion("action", [
  z.object({ action: z.literal("invite"), invitation: inviteSchema }).strict(),
  z.object({ action: z.literal("revokeInvite"), id }).strict(),
  z.object({ action: z.literal("revokeTutor"), userId: id, reason: z.string().trim().min(1).max(1000) }).strict(),
]);
const digest = (s: string) => createHash("sha256").update(s).digest("hex");
const tokenSchema = activationSchema.shape.token;
const lifetime = 7 * 24 * 60 * 60 * 1000;
const owns = "?=(SELECT value FROM settings WHERE `key`='owner')";
type Invitation = {
  id: string; token_hash: string; email: string; display_name: string; class_id: string | null;
  created_by: string; expires_at: number; accepted_at: string | null; revoked_at: string | null;
};
async function validInvitation(d: PlatformDatabase, token: string, at: number) {
  tokenSchema.parse(token);
  const row = await d.prepare("SELECT * FROM tutor_invitations WHERE token_hash=? AND created_by=(SELECT value FROM settings WHERE `key`='owner')")
    .bind(digest(token)).first<Invitation>();
  if (!row || row.accepted_at || row.revoked_at || Number(row.expires_at) <= at)
    throw new AccessError(410, "Undangan tidak tersedia, sudah digunakan, dibatalkan, atau kedaluwarsa. Hubungi Super Admin.");
  return row;
}
export async function tutorOverview(d: PlatformDatabase, u: PlatformUser) {
  await requireOwner(d, u);
  const invitations = (await d.prepare("SELECT i.id,i.email,i.display_name AS displayName,i.class_id AS classId,c.name AS className,i.created_at AS createdAt,i.expires_at AS expiresAt,i.accepted_at AS acceptedAt,i.revoked_at AS revokedAt FROM tutor_invitations i LEFT JOIN cohorts c ON c.id=i.class_id ORDER BY i.created_at DESC,i.id DESC LIMIT 100").all()).results;
  const classes = (await d.prepare("SELECT id,name FROM cohorts WHERE status!='archived' AND mentor_id IS NULL ORDER BY name").all()).results;
  const events = (await d.prepare("SELECT id,target_email AS email,kind,reason,created_at AS createdAt FROM tutor_events ORDER BY created_at DESC,id DESC LIMIT 100").all()).results;
  return { invitations, classes, events };
}
export async function createTutorInvitation(d: PlatformDatabase, u: { id: string }, raw: unknown, env = process.env, at = Date.now()) {
  await requireOwner(d, u);
  const b = inviteSchema.parse(raw);
  const origin = appOrigin(env);
  const existing = await d.prepare("SELECT c.user_id AS id,a.status FROM auth_credentials c LEFT JOIN user_access a ON a.user_id=c.user_id WHERE c.email=?").bind(b.email).first<{ id: string; status: string }>();
  const ownerId = await requireOwner(d, u);
  if (existing?.id === ownerId) throw new AccessError(400, "Akun Super Admin tidak memerlukan undangan Tutor.");
  if (existing?.status === "suspended") throw new AccessError(409, "Pulihkan akses akun terlebih dahulu sebelum mengundang Tutor.");
  if (b.classId && !(await d.prepare("SELECT 1 FROM cohorts WHERE id=? AND status!='archived' AND mentor_id IS NULL").bind(b.classId).first()))
    throw new AccessError(409, "Pilih kelas aktif yang belum memiliki Tutor, atau undang tanpa penugasan kelas.");
  await authRateLimit(d, "invite", b.email, at);
  const token = randomBytes(32).toString("base64url"), inviteId = randomUUID(), createdAt = new Date(at).toISOString();
  const results = await d.batch([
    d.prepare(`INSERT INTO tutor_invitations(id,token_hash,email,display_name,class_id,created_by,created_at,expires_at) SELECT ?,?,?,?,?,?,?,? WHERE ${owns} AND (? IS NULL OR EXISTS(SELECT 1 FROM cohorts WHERE id=? AND status!='archived' AND mentor_id IS NULL))`)
      .bind(inviteId, digest(token), b.email, b.displayName, b.classId, u.id, createdAt, at + lifetime, u.id, b.classId, b.classId),
    d.prepare("UPDATE tutor_invitations SET revoked_at=? WHERE email=? AND id!=? AND accepted_at IS NULL AND revoked_at IS NULL AND EXISTS(SELECT 1 FROM (SELECT id FROM tutor_invitations WHERE id=?) AS issued)")
      .bind(createdAt, b.email, inviteId, inviteId),
    d.prepare("INSERT INTO tutor_events(id,actor_id,target_email,kind,reason,created_at) SELECT ?,?,?,'invite',?,? WHERE EXISTS(SELECT 1 FROM tutor_invitations WHERE id=?)")
      .bind(randomUUID(), u.id, b.email, b.classId ? `Undangan dengan penugasan kelas ${b.classId}` : "Undangan tanpa penugasan kelas", createdAt, inviteId),
  ]);
  if (!results[0].meta.changes) throw new AccessError(409, "Penugasan kelas berubah. Muat ulang sebelum membuat undangan.");
  return { id: inviteId, email: b.email, expiresAt: at + lifetime, url: `${origin}/tutor/activate#invite=${token}` };
}
export async function inspectTutorInvitation(d: PlatformDatabase, token: string, at = Date.now()) {
  tokenSchema.parse(token);
  await authRateLimit(d, "activate", digest(token), at);
  const row = await validInvitation(d, token, at);
  const account = await d.prepare("SELECT 1 FROM auth_credentials WHERE email=?").bind(row.email).first();
  return { displayName: row.display_name, emailHint: row.email.replace(/^(.{1,2}).*(@.*)$/, "$1…$2"), expiresAt: row.expires_at, existingAccount: !!account };
}
export async function activateTutorInvitation(d: PlatformDatabase, raw: unknown, signed: SignedUser | null, at = Date.now()) {
  const b = activationSchema.parse(raw);
  await authRateLimit(d, "activate", digest(b.token), at);
  const invite = await validInvitation(d, b.token, at);
  if (invite.email !== b.email) throw new AccessError(400, "Gunakan email yang menerima undangan.");
  const existing = await d.prepare("SELECT c.user_id AS id,c.password_version AS passwordVersion,a.status FROM auth_credentials c LEFT JOIN user_access a ON a.user_id=c.user_id WHERE c.email=?")
    .bind(invite.email).first<{ id: string; passwordVersion: number; status: string }>();
  if (existing && (!signed || signed.userId !== existing.id || signed.email !== invite.email))
    throw new AccessError(401, "Masuk dengan akun penerima undangan untuk mengaktifkan hak Tutor.");
  if (existing?.status === "suspended") throw new AccessError(403, "Akun ditangguhkan. Hubungi Super Admin untuk memulihkan akses.");
  if (!existing && !b.password) throw new AccessError(400, "Isi password baru untuk membuat akun Tutor.");
  if (existing && b.password) throw new AccessError(400, "Aktivasi akun yang sudah ada tidak mengganti password.");
  const userId = existing?.id || randomUUID();
  if (!existing) validatePassword(b.password!);
  const passwordHash = existing ? null : await hashPassword(b.password!);
  const acceptedAt = new Date(at).toISOString();
  // Unique proof per attempt prevents a losing simultaneous request for the same
  // existing user from performing writes, even when timestamps are identical.
  const activationId = randomUUID();
  const claimed = "EXISTS(SELECT 1 FROM tutor_invitations WHERE id=? AND accepted_user_id=? AND activation_id=?)";
  const proof = [invite.id, userId, activationId] as const;
  const statements = [d.prepare(`UPDATE tutor_invitations SET accepted_user_id=?,accepted_at=?,activation_id=? WHERE id=? AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>? AND created_by=(SELECT value FROM settings WHERE \`key\`='owner') AND (class_id IS NULL OR EXISTS(SELECT 1 FROM cohorts WHERE id=class_id AND status!='archived' AND mentor_id IS NULL)) AND (? IS NULL OR EXISTS(SELECT 1 FROM auth_credentials c JOIN user_access a ON a.user_id=c.user_id WHERE c.user_id=? AND c.password_version=? AND a.status!='suspended'))`)
    .bind(userId, acceptedAt, activationId, invite.id, at, existing?.id || null, existing?.id || null, existing?.passwordVersion || 0)];
  if (!existing) {
    statements.push(d.prepare(`INSERT INTO auth_credentials(user_id,email,display_name,password_hash,password_version,created_at,updated_at) SELECT ?,?,?,?,1,?,? WHERE ${claimed}`)
      .bind(userId, invite.email, invite.display_name, passwordHash, acceptedAt, acceptedAt, ...proof));
    statements.push(d.prepare(`INSERT INTO users(id,name,role) SELECT ?,?,'tutor' WHERE ${claimed}`).bind(userId, invite.display_name, ...proof));
    statements.push(d.prepare(`INSERT INTO user_access(user_id,status,version,created_at,updated_at) SELECT ?,'active',1,?,? WHERE ${claimed}`).bind(userId, acceptedAt, acceptedAt, ...proof));
  } else {
    statements.push(d.prepare(`UPDATE user_access SET status='active',version=version+1,updated_at=? WHERE user_id=? AND status='pending' AND ${claimed}`).bind(acceptedAt, userId, ...proof));
    statements.push(d.prepare(`UPDATE users SET role='tutor' WHERE id=? AND ${claimed}`).bind(userId, ...proof));
  }
  statements.push(d.prepare(databaseSql(d,
    `INSERT INTO tutor_accounts(user_id,active,granted_by,granted_at,revoked_at) SELECT ?,1,?,?,NULL WHERE ${claimed} ON CONFLICT(user_id) DO UPDATE SET active=1,granted_by=excluded.granted_by,granted_at=excluded.granted_at,revoked_at=NULL`,
    `INSERT INTO tutor_accounts(user_id,active,granted_by,granted_at,revoked_at) SELECT ?,1,?,?,NULL WHERE ${claimed} ON DUPLICATE KEY UPDATE active=1,granted_by=VALUES(granted_by),granted_at=VALUES(granted_at),revoked_at=NULL`))
    .bind(userId, invite.created_by, acceptedAt, ...proof));
  if (invite.class_id) statements.push(d.prepare(`UPDATE cohorts SET mentor_id=?,version=version+1 WHERE id=? AND mentor_id IS NULL AND status!='archived' AND ${claimed}`).bind(userId, invite.class_id, ...proof));
  statements.push(d.prepare(databaseSql(d,
    `INSERT OR IGNORE INTO tutor_events(id,actor_id,target_email,kind,reason,created_at) SELECT ?,?,?,'activate','Aktivasi akun Tutor',? WHERE ${claimed}`,
    `INSERT INTO tutor_events(id,actor_id,target_email,kind,reason,created_at) SELECT ?,?,?,'activate','Aktivasi akun Tutor',? WHERE ${claimed} ON DUPLICATE KEY UPDATE id=id`))
    .bind(`activate:${invite.id}`, userId, invite.email, acceptedAt, ...proof));
  try {
    const results = await d.batch(statements);
    if (!results[0].meta.changes) throw new AccessError(409, "Undangan atau akses kelas berubah. Hubungi Super Admin untuk undangan baru.");
  } catch (e) {
    if (e && typeof e === "object" && "code" in e && e.code === "ER_DUP_ENTRY") throw new AccessError(409, "Akun sudah ada. Masuk terlebih dahulu dan buka kembali tautan undangan.");
    throw e;
  }
  return { activated: true, existingAccount: !!existing };
}
export async function revokeTutorInvitation(d: PlatformDatabase, u: { id: string }, inviteId: string) {
  await requireOwner(d, u); id.parse(inviteId);
  const at = new Date().toISOString();
  const results = await d.batch([
    d.prepare(`UPDATE tutor_invitations SET revoked_at=? WHERE id=? AND accepted_at IS NULL AND revoked_at IS NULL AND ${owns}`).bind(at, inviteId, u.id),
    d.prepare("INSERT INTO tutor_events(id,actor_id,target_email,kind,reason,created_at) SELECT ?,?,email,'revokeInvite','Undangan dibatalkan',? FROM tutor_invitations WHERE id=? AND revoked_at=?").bind(randomUUID(), u.id, at, inviteId, at),
  ]);
  if (!results[0].meta.changes) throw new AccessError(409, "Undangan sudah digunakan atau dibatalkan. Muat ulang daftar.");
  return { ok: true };
}
export async function revokeTutor(d: PlatformDatabase, u: { id: string }, targetId: string, reason: string) {
  const ownerId = await requireOwner(d, u); id.parse(targetId); z.string().trim().min(1).max(1000).parse(reason);
  if (targetId === ownerId) throw new AccessError(400, "Hak Super Admin tidak dapat dicabut di sini.");
  const target = await d.prepare("SELECT c.email FROM auth_credentials c JOIN users u ON u.id=c.user_id WHERE u.id=?").bind(targetId).first<{ email: string }>();
  if (!target) throw new AccessError(404, "Akun Tutor tidak ditemukan.");
  const at = new Date().toISOString();
  await d.batch([
    d.prepare(`UPDATE tutor_accounts SET active=0,revoked_at=? WHERE user_id=? AND ${owns}`).bind(at, targetId, u.id),
    d.prepare(`UPDATE cohorts SET mentor_id=NULL,version=version+1 WHERE mentor_id=? AND ${owns}`).bind(targetId, u.id),
    d.prepare(`UPDATE users SET role='student' WHERE id=? AND ${owns}`).bind(targetId, u.id),
    d.prepare(`UPDATE tutor_invitations SET revoked_at=? WHERE email=? AND accepted_at IS NULL AND revoked_at IS NULL AND ${owns}`).bind(at, target.email, u.id),
    d.prepare(`INSERT INTO tutor_events(id,actor_id,target_email,kind,reason,created_at) SELECT ?,?,?,'revokeTutor',?,? WHERE ${owns}`).bind(randomUUID(), u.id, target.email, reason.trim(), at, u.id),
  ]);
  return { ok: true };
}
