import { z } from "zod";
import { authorizationGuard, readAccessContext, policySql, teachingSql, type AccessContext } from "./authorization.ts";
import { AccessError } from "./access-error.ts";
export { AccessError } from "./access-error.ts";
import { databaseSql } from "./database.ts";
import type { PlatformDatabase } from "./database.ts";
export type PlatformUser = AccessContext;
export type AccessUser = {id:string;name:string;role:string;kind:AccessContext["kind"];principalVersion:number;tutor:number;tutorVersion:number;curriculum:number;curriculumVersion:number;status:AccessContext["accessStatus"];version:number;createdAt:string|null;mentorClasses:number};
export type AccessEvent = {id:string;targetId:string;targetName:string;actorId:string;actorName:string;status:AccessContext["accessStatus"];reason:string;createdAt:string};
export type AccessOverview = {user:PlatformUser;status:AccessContext["accessStatus"];version:number;users?:AccessUser[];events?:AccessEvent[]};
export const accessMutation = z
  .object({
    userId: z
      .string()
      .min(1)
      .max(80)
      .regex(/^[a-zA-Z0-9_-]+$/),
    version: z.number().int().nonnegative(),
    status: z.enum(["active", "suspended"]),
    reason: z
      .string()
      .trim()
      .min(1, "Tuliskan alasan perubahan akses.")
      .max(1000),
  })
  .strict();
export async function registerIdentity(
  d: PlatformDatabase, signed: {userId:string;displayName:string}, bootstrap:boolean,
): Promise<PlatformUser> {
  if (bootstrap) await d.prepare(databaseSql(d,
    "INSERT OR IGNORE INTO settings(key,value) SELECT 'owner',? WHERE NOT EXISTS(SELECT 1 FROM settings WHERE key='owner_setup_closed' AND value='true')",
    "INSERT INTO settings(`key`,value) SELECT 'owner',? WHERE NOT EXISTS(SELECT 1 FROM settings WHERE `key`='owner_setup_closed' AND value='true') ON DUPLICATE KEY UPDATE `key`=`key`"))
    .bind(signed.userId).run();
  const setup=await d.prepare("SELECT value FROM settings WHERE `key`='owner'").first<{value:string}>();
  if (!setup) throw new AccessError(503,"Pemilik platform belum disiapkan. Hubungi pengelola platform.");
  const at=new Date().toISOString();
  const existing=await d.prepare("SELECT id FROM users WHERE id=?").bind(signed.userId).first();
  // Only a genuinely new authenticated identity is initialized. Existing rows
  // without a principal require migration classification, never a role fallback.
  if (!existing) await d.batch([
    d.prepare(databaseSql(d,"INSERT OR IGNORE INTO users(id,name,role) VALUES(?,?,?)","INSERT INTO users(id,name,role) VALUES(?,?,?) ON DUPLICATE KEY UPDATE id=id")).bind(signed.userId,signed.displayName,setup.value===signed.userId?"owner":"student"),
    d.prepare(databaseSql(d,"INSERT OR IGNORE INTO account_principals(user_id,kind,version,updated_by,updated_at,proof) VALUES(?,?,1,?,?,'identity-initialized')","INSERT INTO account_principals(user_id,kind,version,updated_by,updated_at,proof) VALUES(?,?,1,?,?,'identity-initialized') ON DUPLICATE KEY UPDATE user_id=user_id")).bind(signed.userId,setup.value===signed.userId?"staff":"student",signed.userId,at),
    d.prepare(databaseSql(d,"INSERT OR IGNORE INTO user_access(user_id,status,version,created_at,updated_at) VALUES(?,?,1,?,?)","INSERT INTO user_access(user_id,status,version,created_at,updated_at) VALUES(?,?,1,?,?) ON DUPLICATE KEY UPDATE user_id=user_id")).bind(signed.userId,setup.value===signed.userId?"active":"pending",at,at),
  ]);
  if (!await d.prepare("SELECT 1 FROM settings WHERE `key`='owner_setup_closed' AND value='true'").first())
    await d.prepare(databaseSql(d,"INSERT OR IGNORE INTO settings(key,value) VALUES('owner_setup_closed','true')","INSERT INTO settings(`key`,value) VALUES('owner_setup_closed','true') ON DUPLICATE KEY UPDATE `key`=`key`")).run();
  return readAccessContext(d,{id:signed.userId});
}
export function requireActive(u: PlatformUser) {
  if (u.kind === "unclassified") throw new AccessError(403,"Jenis akun perlu ditinjau pengelola sebelum melanjutkan.");
  if (!u.owner && u.accessStatus !== "active") throw new AccessError(403,u.accessStatus === "suspended" ? "Akses akun ditangguhkan. Lihat status akun di halaman Akses akun." : "Akun menunggu persetujuan pengelola. Buka halaman Akses akun untuk melihat status.");
}
export async function requireOwner(d: PlatformDatabase, u: { id: string }) {
  const o = await d
    .prepare("SELECT value FROM settings WHERE `key`='owner'")
    .first<{ value: string }>();
  if (!o || o.value !== u.id || !await d.prepare(`SELECT 1 WHERE ${policySql("owner")}`).bind(u.id).first())
    throw new AccessError(
      403,
      "Hanya pemilik platform yang dapat mengelola akses akun.",
    );
  return o.value;
}
export async function accessOverview(d: PlatformDatabase, u: PlatformUser) {
  u = await readAccessContext(d,u);
  const result: AccessOverview = {
    user: u,
    status: u.accessStatus,
    version: u.accessVersion,
  };
  if (u.role !== "owner") return result;
  await requireOwner(d, u);
  const guard=await authorizationGuard(d,u,'owner');
  result.users = (
    await d
      .prepare(
        `SELECT u.id,u.name,CASE WHEN u.id=? THEN 'owner' WHEN p.kind='student' THEN 'student' WHEN EXISTS(SELECT 1 FROM staff_grants t WHERE t.user_id=u.id AND t.capability='tutor' AND t.active=1) AND p.kind='staff' THEN 'tutor' WHEN EXISTS(SELECT 1 FROM staff_grants q WHERE q.user_id=u.id AND q.capability='curriculum' AND q.active=1) AND p.kind='staff' THEN 'curriculum' ELSE COALESCE(p.kind,'unclassified') END AS role,COALESCE(p.kind,'unclassified') AS kind,COALESCE(p.version,0) AS principalVersion,
        COALESCE((SELECT active FROM staff_grants WHERE user_id=u.id AND capability='tutor'),0) AS tutor,
        COALESCE((SELECT version FROM staff_grants WHERE user_id=u.id AND capability='tutor'),0) AS tutorVersion,
        COALESCE((SELECT active FROM staff_grants WHERE user_id=u.id AND capability='curriculum'),0) AS curriculum,
        COALESCE((SELECT version FROM staff_grants WHERE user_id=u.id AND capability='curriculum'),0) AS curriculumVersion,
        CASE WHEN u.id=? THEN 'active' ELSE COALESCE(a.status,'pending') END AS status,COALESCE(a.version,0) AS version,a.created_at AS createdAt,(SELECT count(*) FROM cohorts c WHERE c.status!='archived' AND ${teachingSql("u.id")}) AS mentorClasses FROM users u LEFT JOIN user_access a ON a.user_id=u.id LEFT JOIN account_principals p ON p.user_id=u.id ORDER BY CASE WHEN u.id=? THEN 0 WHEN a.status IS NULL OR a.status='pending' THEN 1 WHEN a.status='active' THEN 2 ELSE 3 END,u.name`,
      )
      .bind(u.id, u.id, u.id)
      .all<AccessUser>()
  ).results;
  result.events = (
    await d
      .prepare(
        databaseSql(d,
          `SELECT e.id,e.target_id AS targetId,t.name AS targetName,e.actor_id AS actorId,a.name AS actorName,e.status,e.reason,e.created_at AS createdAt FROM access_events e JOIN users t ON t.id=e.target_id JOIN users a ON a.id=e.actor_id ORDER BY e.created_at DESC,e.rowid DESC LIMIT 100`,
          `SELECT e.id,e.target_id AS targetId,t.name AS targetName,e.actor_id AS actorId,a.name AS actorName,e.status,e.reason,e.created_at AS createdAt FROM access_events e JOIN users t ON t.id=e.target_id JOIN users a ON a.id=e.actor_id ORDER BY e.created_at DESC,e.id DESC LIMIT 100`,
        ),
      )
      .all<AccessEvent>()
  ).results;
  if(!await d.prepare(`SELECT 1 WHERE ${guard.sql}`).bind(...guard.binds).first())throw new AccessError(403,'Hak pengelola berubah. Muat ulang akses akun.');
  return result;
}
export async function updateAccess(
  d: PlatformDatabase,
  u: { id: string },
  raw: unknown,
) {
  const b = accessMutation.parse(raw),
    ownerId = await requireOwner(d, u);
  const guard = await authorizationGuard(d, u, "owner");
  if (b.userId === ownerId)
    throw new AccessError(
      400,
      "Akses pemilik tidak dapat diubah dari halaman ini.",
    );
  if (
    !(await d.prepare("SELECT 1 FROM users WHERE id=?").bind(b.userId).first())
  )
    throw new AccessError(404, "Akun belum pernah masuk ke platform.");
  const at = new Date().toISOString();
  const row = await d
    .prepare("SELECT version FROM user_access WHERE user_id=?")
    .bind(b.userId)
    .first<{ version: number }>();
  if ((row?.version || 0) !== b.version)
    throw new AccessError(
      409,
      "Status akun berubah. Muat ulang sebelum menyimpan.",
    );
  const change = row
    ? d
        .prepare(
          `UPDATE user_access SET status=?,version=version+1,updated_at=? WHERE user_id=? AND version=? AND user_id!=(SELECT value FROM settings WHERE \`key\`='owner') AND ${guard.sql}`,
        )
        .bind(b.status, at, b.userId, b.version, ...guard.binds)
    : d
        .prepare(
          databaseSql(d,
            `INSERT OR IGNORE INTO user_access(user_id,status,version,created_at,updated_at) SELECT ?,?,1,?,? WHERE ${guard.sql} AND ?!=(SELECT value FROM settings WHERE \`key\`='owner')`,
            `INSERT INTO user_access(user_id,status,version,created_at,updated_at) SELECT ?,?,1,?,? WHERE ${guard.sql} AND ?!=(SELECT value FROM settings WHERE \`key\`='owner') ON DUPLICATE KEY UPDATE user_id=user_id`,
          ),
        )
        .bind(b.userId, b.status, at, at, ...guard.binds, b.userId);
  // Audit is part of the same transaction. Deterministic per-account/version IDs make a losing concurrent update unable to duplicate events.
  const results = await d.batch([
    change,
    d
      .prepare(
        databaseSql(d,
          `INSERT OR IGNORE INTO access_events(id,actor_id,target_id,status,reason,created_at) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM user_access WHERE user_id=? AND version=? AND status=?) AND ${guard.sql}`,
          `INSERT INTO access_events(id,actor_id,target_id,status,reason,created_at) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM user_access WHERE user_id=? AND version=? AND status=?) AND ${guard.sql} ON DUPLICATE KEY UPDATE id=id`,
        ),
      )
      .bind(
        b.userId + ":" + (b.version + 1),
        u.id,
        b.userId,
        b.status,
        b.reason,
        at,
        b.userId,
        b.version + 1,
        b.status,
        ...guard.binds,
      ),
  ]);
  if (!results[0].meta.changes)
    throw new AccessError(
      409,
      "Status akun berubah. Muat ulang sebelum menyimpan.",
    );
  return { ok: true };
}
