import { createHash, randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { requireOwner, AccessError, type PlatformUser } from "./access.ts";
import { authorizationGuard, changePermission, readAccessContext } from "./authorization.ts";
import { databaseSql, type PlatformDatabase } from "./database.ts";
import { authRateLimit, registrationSchema, type SignedUser } from "./auth-data.ts";
import { hashPassword, validatePassword } from "./auth-password.ts";
import { courseTitleSql } from "./database-sql.ts";
import { configuredAccountMailer, readEmailSettings } from "./email-settings.ts";
import type { DeliverMail } from "./account-email.ts";
import { appOrigin } from "./auth-policy.ts";

const id = z.string().min(1).max(80).regex(/^[a-zA-Z0-9_-]+$/);
export const inviteSchema = z.object({
  email: registrationSchema.shape.email,
  displayName: registrationSchema.shape.displayName,
  classId: id.nullable(),
  capability: z.enum(["tutor","curriculum"]).default("tutor"),
  courseId: id.nullable().default(null),
  delivery: z.enum(["manual", "email"]).default("manual"),
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
type Invitation = {
  id: string; token_hash: string; email: string; display_name: string; class_id: string | null;
  capability: "tutor"|"curriculum"; course_id: string|null; created_by: string; expires_at: number; accepted_at: string | null; revoked_at: string | null;
};
async function validInvitation(d: PlatformDatabase, token: string, at: number) {
  tokenSchema.parse(token);
  const row = await d.prepare("SELECT * FROM tutor_invitations WHERE token_hash=? AND created_by=(SELECT value FROM settings WHERE `key`='owner')")
    .bind(digest(token)).first<Invitation>();
  if (!row || row.accepted_at || row.revoked_at || Number(row.expires_at) <= at)
    throw new AccessError(410, "Undangan tidak tersedia, sudah digunakan, dibatalkan, atau kedaluwarsa. Hubungi Super Admin.");
  return row;
}
export async function tutorOverview(d: PlatformDatabase, u: PlatformUser, env = process.env) {
  const guard=await authorizationGuard(d,u,'owner');
  const invitations = (await d.prepare(`SELECT i.id,i.email,i.display_name AS displayName,i.class_id AS classId,i.capability,i.course_id AS courseId,${courseTitleSql(d,"k.data")} AS courseTitle,c.name AS className,i.created_at AS createdAt,i.expires_at AS expiresAt,i.accepted_at AS acceptedAt,i.revoked_at AS revokedAt FROM tutor_invitations i LEFT JOIN cohorts c ON c.id=i.class_id LEFT JOIN courses k ON k.id=i.course_id ORDER BY i.created_at DESC,i.id DESC LIMIT 100`).all()).results;
  const classes = (await d.prepare("SELECT id,name FROM cohorts WHERE status!='archived' AND mentor_id IS NULL ORDER BY name").all()).results;
  const events = (await d.prepare("SELECT id,target_email AS email,kind,reason,created_at AS createdAt FROM tutor_events ORDER BY created_at DESC,id DESC LIMIT 100").all()).results;
  if(!await d.prepare(`SELECT 1 WHERE ${guard.sql}`).bind(...guard.binds).first())throw new AccessError(403,'Hak pengelola berubah. Muat ulang undangan.');
  const mail = await readEmailSettings(d,env);
  const courses=(await d.prepare(`SELECT id,${courseTitleSql(d,"data")} AS title FROM courses ORDER BY id`).all()).results;
  if(!await d.prepare(`SELECT 1 WHERE ${guard.sql}`).bind(...guard.binds).first())throw new AccessError(403,'Hak pengelola berubah. Muat ulang undangan.');
  return { invitations, classes, courses, events, emailAvailable:mail.active || env.MAIL_DELIVERY === "preview", emailPreview:env.MAIL_DELIVERY === "preview" };
}
export async function createTutorInvitation(d: PlatformDatabase, u: { id: string }, raw: unknown, env = process.env, at = Date.now(), testSender?: DeliverMail) {
  const guard=await authorizationGuard(d,u,"owner");
  const b = inviteSchema.parse(raw);
  if ((b.capability === "curriculum" && b.classId) || (b.capability === "tutor" && b.courseId)) throw new AccessError(400,"Penugasan tidak sesuai jenis undangan.");
  const scope = b.courseId ? await d.prepare("SELECT version FROM courses WHERE id=?").bind(b.courseId).first<{version:number}>() : null;
  if(b.courseId && !scope) throw new AccessError(404,"Course tidak tersedia.");
  const sender = b.delivery === "email" ? testSender ?? await configuredAccountMailer(d,env) : null;
  const origin = appOrigin(env);
  const existing = await d.prepare("SELECT c.user_id AS id,a.status FROM auth_credentials c LEFT JOIN user_access a ON a.user_id=c.user_id WHERE c.email=?").bind(b.email).first<{ id: string; status: string }>();
  const ownerId = await requireOwner(d, u);
  if (existing?.id === ownerId) throw new AccessError(400, "Akun Super Admin tidak memerlukan undangan staf.");
  if (existing?.status === "suspended") throw new AccessError(409, "Pulihkan akses akun terlebih dahulu sebelum mengundang staf.");
  if (b.classId && !(await d.prepare("SELECT 1 FROM cohorts WHERE id=? AND status!='archived' AND mentor_id IS NULL").bind(b.classId).first()))
    throw new AccessError(409, "Pilih kelas aktif yang belum memiliki Tutor, atau undang tanpa penugasan kelas.");
  await authRateLimit(d, "invite", b.email, at);
  const token = randomBytes(32).toString("base64url"), inviteId = randomUUID(), createdAt = new Date(at).toISOString();
  const results = await d.batch([
    d.prepare(`INSERT INTO tutor_invitations(id,token_hash,email,display_name,class_id,capability,course_id,created_by,created_at,expires_at) SELECT ?,?,?,?,?,?,?,?,?,? WHERE ${guard.sql} AND (? IS NULL OR EXISTS(SELECT 1 FROM cohorts WHERE id=? AND status!='archived' AND mentor_id IS NULL)) AND (? IS NULL OR EXISTS(SELECT 1 FROM courses WHERE id=? AND version=?))`)
      .bind(inviteId, digest(token), b.email, b.displayName, b.classId, b.capability,b.courseId,u.id, createdAt, at + lifetime,...guard.binds, b.classId, b.classId,b.courseId,b.courseId,scope?.version ?? 0),
    d.prepare("UPDATE tutor_invitations SET revoked_at=? WHERE email=? AND capability=? AND id!=? AND accepted_at IS NULL AND revoked_at IS NULL AND EXISTS(SELECT 1 FROM (SELECT id FROM tutor_invitations WHERE id=?) AS issued)")
      .bind(createdAt, b.email,b.capability, inviteId, inviteId),
    d.prepare("INSERT INTO tutor_events(id,actor_id,target_email,kind,reason,created_at) SELECT ?,?,?,'invite',?,? WHERE EXISTS(SELECT 1 FROM tutor_invitations WHERE id=?)")
      .bind(randomUUID(), u.id, b.email, `${b.capability === "curriculum" ? "Tim Kurikulum" : "Tutor"}: ${b.classId ? `kelas ${b.classId}` : b.courseId ? `course ${b.courseId}` : "penugasan menyusul"}`, createdAt, inviteId),
  ]);
  if (!results[0].meta.changes) throw new AccessError(409, "Hak pengelola atau penugasan berubah. Muat ulang sebelum membuat undangan.");
  const url = `${origin}/tutor/activate#invite=${token}`;
  let delivery: "manual" | "accepted" | "preview" | "failed" = "manual";
  if (sender) {
    try {
      // Check authority again before handing the secret to the mail transport.
      await validInvitation(d,token,Date.now());
      if(!await d.prepare(`SELECT 1 WHERE ${guard.sql}`).bind(...guard.binds).first()) throw new AccessError(403,"Hak pengelola berubah.");
      await sender({to:b.email,purpose:"staffInvite",url,staffRole:b.capability === "curriculum" ? "Tim Kurikulum" : "Tutor"});
      delivery = env.MAIL_DELIVERY === "preview" ? "preview" : "accepted";
    } catch { delivery = "failed"; }
  }
  return { id: inviteId, email: b.email, capability:b.capability, expiresAt: at + lifetime, url, delivery };
}
export async function inspectTutorInvitation(d: PlatformDatabase, token: string, at = Date.now()) {
  tokenSchema.parse(token);
  await authRateLimit(d, "activate", digest(token), at);
  const row = await validInvitation(d, token, at);
  const account = await d.prepare("SELECT 1 FROM auth_credentials WHERE email=?").bind(row.email).first();
  const course = row.course_id ? await d.prepare(`SELECT ${courseTitleSql(d,"data")} AS title FROM courses WHERE id=?`).bind(row.course_id).first<{title:string}>() : null;
  const cohort = row.class_id ? await d.prepare("SELECT name FROM cohorts WHERE id=?").bind(row.class_id).first<{name:string}>() : null;
  return { displayName: row.display_name, emailHint: row.email.replace(/^(.{1,2}).*(@.*)$/, "$1…$2"), expiresAt: row.expires_at, existingAccount: !!account,capability:row.capability,scopeName:course?.title || cohort?.name || null, courseId:row.course_id };
}
export async function activateTutorInvitation(d: PlatformDatabase, raw: unknown, signed: SignedUser | null, at = Date.now()) {
  const b = activationSchema.parse(raw);
  await authRateLimit(d, "activate", digest(b.token), at);
  const invite = await validInvitation(d, b.token, at);
  if (invite.email !== b.email) throw new AccessError(400, "Gunakan email yang menerima undangan.");
  const existing = await d.prepare("SELECT c.user_id AS id,c.password_version AS passwordVersion,a.status FROM auth_credentials c LEFT JOIN user_access a ON a.user_id=c.user_id WHERE c.email=?")
    .bind(invite.email).first<{ id: string; passwordVersion: number; status: string }>();
  if (existing && (!signed || signed.userId !== existing.id || signed.email !== invite.email))
    throw new AccessError(401, "Masuk dengan akun penerima undangan untuk mengaktifkan hak staf.");
  if (existing?.status === "suspended") throw new AccessError(403, "Akun ditangguhkan. Hubungi Super Admin untuk memulihkan akses.");
  if (!existing && !b.password) throw new AccessError(400, "Isi password baru untuk membuat akun staf.");
  if (existing && b.password) throw new AccessError(400, "Aktivasi akun yang sudah ada tidak mengganti password.");
  const prior=existing?await readAccessContext(d,{id:existing.id}):null;
  if(prior?.owner || prior?.kind === "unclassified") throw new AccessError(409,"Akun ini belum dapat menerima undangan staf.");
  const scope = invite.course_id ? await d.prepare("SELECT version FROM courses WHERE id=?").bind(invite.course_id).first<{version:number}>() : null;
  if(invite.course_id && !scope) throw new AccessError(409,"Course penugasan tidak tersedia. Hubungi Super Admin untuk undangan baru.");
  const issuer=await authorizationGuard(d,{id:invite.created_by},"owner");
  const userId = existing?.id || randomUUID();
  if (!existing) validatePassword(b.password!);
  const passwordHash = existing ? null : await hashPassword(b.password!);
  const acceptedAt = new Date(at).toISOString();
  // Unique proof per attempt prevents a losing simultaneous request for the same
  // existing user from performing writes, even when timestamps are identical.
  const activationId = randomUUID();
  const recipientSql = prior ? "EXISTS(SELECT 1 FROM account_principals p JOIN user_access a ON a.user_id=p.user_id WHERE p.user_id=? AND p.kind=? AND p.version=? AND a.version=?) AND COALESCE((SELECT version FROM staff_grants WHERE user_id=? AND capability=?),0)=?" : "1=1";
  const recipientBinds = prior ? [prior.id,prior.kind,prior.principalVersion,prior.accessVersion,prior.id,invite.capability,prior.grantVersions[invite.capability]] : [];
  const claimed = "EXISTS(SELECT 1 FROM tutor_invitations WHERE id=? AND accepted_user_id=? AND activation_id=?)";
  const proof = [invite.id, userId, activationId] as const;
  const legacyRole = invite.capability === "tutor" || prior?.capabilities.tutor ? "tutor" : "curriculum";
  const statements = [d.prepare(`UPDATE tutor_invitations SET accepted_user_id=?,accepted_at=?,activation_id=? WHERE id=? AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>? AND created_by=(SELECT value FROM settings WHERE \`key\`='owner') AND ${issuer.sql} AND ${recipientSql} AND (class_id IS NULL OR EXISTS(SELECT 1 FROM cohorts WHERE id=class_id AND status!='archived' AND mentor_id IS NULL)) AND (? IS NULL OR EXISTS(SELECT 1 FROM courses WHERE id=? AND version=?)) AND (? IS NULL OR EXISTS(SELECT 1 FROM auth_credentials c JOIN user_access a ON a.user_id=c.user_id WHERE c.user_id=? AND c.password_version=? AND a.status!='suspended'))`)
    .bind(userId, acceptedAt, activationId, invite.id, at,...issuer.binds,...recipientBinds,invite.course_id,invite.course_id,scope?.version ?? 0, existing?.id || null, existing?.id || null, existing?.passwordVersion || 0)];
  if (!existing) {
    statements.push(d.prepare(`INSERT INTO auth_credentials(user_id,email,display_name,password_hash,password_version,created_at,updated_at) SELECT ?,?,?,?,1,?,? WHERE ${claimed}`)
      .bind(userId, invite.email, invite.display_name, passwordHash, acceptedAt, acceptedAt, ...proof));
    statements.push(d.prepare(`INSERT INTO users(id,name,role) SELECT ?,?,? WHERE ${claimed}`).bind(userId, invite.display_name,legacyRole, ...proof));
    statements.push(d.prepare(`INSERT INTO user_access(user_id,status,version,created_at,updated_at) SELECT ?,'active',1,?,? WHERE ${claimed}`).bind(userId, acceptedAt, acceptedAt, ...proof));
  } else {
    statements.push(d.prepare(`UPDATE user_access SET status='active',version=version+1,updated_at=? WHERE user_id=? AND status='pending' AND ${claimed}`).bind(acceptedAt, userId, ...proof));
    statements.push(d.prepare(`UPDATE users SET role=? WHERE id=? AND ${claimed}`).bind(legacyRole,userId, ...proof));
  }
  statements.push(d.prepare(databaseSql(d,
    `INSERT INTO account_principals(user_id,kind,version,updated_by,updated_at,proof) SELECT ?,'staff',1,?,?,? WHERE ${claimed} ON CONFLICT(user_id) DO UPDATE SET version=account_principals.version+CASE WHEN account_principals.kind='staff' THEN 0 ELSE 1 END,kind='staff',updated_by=excluded.updated_by,updated_at=excluded.updated_at,proof=excluded.proof`,
    `INSERT INTO account_principals(user_id,kind,version,updated_by,updated_at,proof) SELECT ?,'staff',1,?,?,? WHERE ${claimed} ON DUPLICATE KEY UPDATE version=version+CASE WHEN kind='staff' THEN 0 ELSE 1 END,kind='staff',updated_by=VALUES(updated_by),updated_at=VALUES(updated_at),proof=VALUES(proof)`)).bind(userId,invite.created_by,acceptedAt,activationId,...proof));
  statements.push(d.prepare(databaseSql(d,
    `INSERT INTO staff_grants(user_id,capability,active,version,granted_by,updated_at,proof) SELECT ?,?,1,1,?,?,? WHERE ${claimed} ON CONFLICT(user_id,capability) DO UPDATE SET version=staff_grants.version+CASE WHEN staff_grants.active=1 THEN 0 ELSE 1 END,active=1,granted_by=excluded.granted_by,updated_at=excluded.updated_at,proof=excluded.proof`,
    `INSERT INTO staff_grants(user_id,capability,active,version,granted_by,updated_at,proof) SELECT ?,?,1,1,?,?,? WHERE ${claimed} ON DUPLICATE KEY UPDATE version=version+CASE WHEN active=1 THEN 0 ELSE 1 END,active=1,granted_by=VALUES(granted_by),updated_at=VALUES(updated_at),proof=VALUES(proof)`)).bind(userId,invite.capability,invite.created_by,acceptedAt,activationId,...proof));
  if(invite.capability === "tutor") statements.push(d.prepare(databaseSql(d,
    `INSERT INTO tutor_accounts(user_id,active,granted_by,granted_at,revoked_at) SELECT ?,1,?,?,NULL WHERE ${claimed} ON CONFLICT(user_id) DO UPDATE SET active=1,granted_by=excluded.granted_by,granted_at=excluded.granted_at,revoked_at=NULL`,
    `INSERT INTO tutor_accounts(user_id,active,granted_by,granted_at,revoked_at) SELECT ?,1,?,?,NULL WHERE ${claimed} ON DUPLICATE KEY UPDATE active=1,granted_by=VALUES(granted_by),granted_at=VALUES(granted_at),revoked_at=NULL`))
    .bind(userId, invite.created_by, acceptedAt, ...proof));
  if (invite.class_id) statements.push(d.prepare(`UPDATE cohorts SET mentor_id=?,mentor_grant_version=(SELECT version FROM staff_grants WHERE user_id=? AND capability='tutor'),version=version+1 WHERE id=? AND mentor_id IS NULL AND status!='archived' AND ${claimed}`).bind(userId,userId, invite.class_id, ...proof));
  if(invite.course_id) statements.push(d.prepare(databaseSql(d,
    `INSERT INTO curriculum_members(course_id,user_id,active,version,grant_version,granted_by,updated_at,proof) SELECT ?,?,1,1,(SELECT version FROM staff_grants WHERE user_id=? AND capability='curriculum'),?,?,? WHERE ${claimed} ON CONFLICT(course_id,user_id) DO UPDATE SET active=1,version=curriculum_members.version+1,grant_version=excluded.grant_version,granted_by=excluded.granted_by,updated_at=excluded.updated_at,proof=excluded.proof`,
    `INSERT INTO curriculum_members(course_id,user_id,active,version,grant_version,granted_by,updated_at,proof) SELECT ?,?,1,1,(SELECT version FROM staff_grants WHERE user_id=? AND capability='curriculum'),?,?,? WHERE ${claimed} ON DUPLICATE KEY UPDATE active=1,version=version+1,grant_version=VALUES(grant_version),granted_by=VALUES(granted_by),updated_at=VALUES(updated_at),proof=VALUES(proof)`)).bind(invite.course_id,userId,userId,invite.created_by,acceptedAt,activationId,...proof));
  statements.push(d.prepare(`INSERT INTO authorization_events(id,actor_id,target_id,kind,capability,scope_id,reason,data,created_at) SELECT ?,?,?,'invitationActivated',?,?, 'Aktivasi undangan staf',?,? WHERE ${claimed}`).bind(activationId,invite.created_by,userId,invite.capability,invite.class_id || invite.course_id,JSON.stringify({invitationId:invite.id}),acceptedAt,...proof));
  statements.push(d.prepare(databaseSql(d,
    `INSERT OR IGNORE INTO tutor_events(id,actor_id,target_email,kind,reason,created_at) SELECT ?,?,?,'activate',?,? WHERE ${claimed}`,
    `INSERT INTO tutor_events(id,actor_id,target_email,kind,reason,created_at) SELECT ?,?,?,'activate',?,? WHERE ${claimed} ON DUPLICATE KEY UPDATE id=id`))
    .bind(`activate:${invite.id}`, userId, invite.email, `Aktivasi ${invite.capability === "curriculum" ? "Tim Kurikulum" : "Tutor"}`,acceptedAt, ...proof));
  try {
    const results = await d.batch(statements);
    if (!results[0].meta.changes) throw new AccessError(409, "Undangan atau akses kelas berubah. Hubungi Super Admin untuk undangan baru.");
  } catch (e) {
    if (e && typeof e === "object" && "code" in e && e.code === "ER_DUP_ENTRY") throw new AccessError(409, "Akun sudah ada. Masuk terlebih dahulu dan buka kembali tautan undangan.");
    throw e;
  }
  return { activated: true, existingAccount: !!existing, capability:invite.capability, destination:invite.capability === "curriculum" ? "/curriculum" + (invite.course_id ? `?course=${encodeURIComponent(invite.course_id)}` : "") : "/classes" };
}
export async function revokeTutorInvitation(d: PlatformDatabase, u: { id: string }, inviteId: string) {
  const guard=await authorizationGuard(d,u,"owner"); id.parse(inviteId);
  const at = new Date().toISOString();
  const results = await d.batch([
    d.prepare(`UPDATE tutor_invitations SET revoked_at=? WHERE id=? AND accepted_at IS NULL AND revoked_at IS NULL AND ${guard.sql}`).bind(at, inviteId, ...guard.binds),
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
  const context=await readAccessContext(d,{id:targetId});
  await changePermission(d,u,{action:"setGrant",targetId,capability:"tutor",principalVersion:context.principalVersion,grantVersion:context.grantVersions.tutor,active:false,reason});
  return {ok:true};
}
