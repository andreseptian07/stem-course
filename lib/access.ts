import { z } from "zod";
import { databaseSql } from "./database.ts";
import type { PlatformDatabase } from "./database.ts";
export class AccessError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
export type PlatformUser = {
  id: string;
  name: string;
  role: string;
  accessStatus: "active" | "pending" | "suspended";
  accessVersion: number;
};
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
  d: PlatformDatabase,
  signed: { userId: string; displayName: string },
  bootstrap: boolean,
): Promise<PlatformUser> {
  if (bootstrap)
    await d
      .prepare(
        databaseSql(d,
          "INSERT OR IGNORE INTO settings(key,value) SELECT 'owner',? WHERE NOT EXISTS(SELECT 1 FROM settings WHERE key='owner_setup_closed' AND value='true')",
          "INSERT INTO settings(`key`,value) SELECT 'owner',? WHERE NOT EXISTS(SELECT 1 FROM settings WHERE `key`='owner_setup_closed' AND value='true') ON DUPLICATE KEY UPDATE `key`=`key`",
        ),
      )
      .bind(signed.userId)
      .run();
  await d
    .prepare(
      databaseSql(d,
        "INSERT OR IGNORE INTO settings(key,value) SELECT 'owner_setup_closed','true' WHERE EXISTS(SELECT 1 FROM settings WHERE key='owner')",
        "INSERT INTO settings(`key`,value) SELECT 'owner_setup_closed','true' WHERE EXISTS(SELECT 1 FROM settings WHERE `key`='owner') ON DUPLICATE KEY UPDATE `key`=`key`",
      ),
    )
    .run();
  const owner = await d
    .prepare("SELECT value FROM settings WHERE `key`='owner'")
    .first<{ value: string }>();
  if (!owner)
    throw new AccessError(
      503,
      "Pemilik platform belum disiapkan. Hubungi pengelola platform.",
    );
  const tutor = await d.prepare("SELECT 1 WHERE EXISTS(SELECT 1 FROM tutor_accounts WHERE user_id=? AND active=1) OR EXISTS(SELECT 1 FROM cohorts WHERE mentor_id=? AND status!='archived')").bind(signed.userId, signed.userId).first();
  const curriculum = await d.prepare("SELECT 1 FROM curriculum_members WHERE user_id=? AND active=1").bind(signed.userId).first();
  const role = owner.value === signed.userId ? "owner" : tutor ? "tutor" : curriculum ? "curriculum" : "student";
  const profile = await d
    .prepare("SELECT data FROM profiles WHERE user_id=?")
    .bind(signed.userId)
    .first<{ data: string }>();
  const name = profile
    ? JSON.parse(profile.data).displayName || signed.displayName
    : signed.displayName;
  const at = new Date().toISOString();
  await d.batch([
    d
      .prepare(
        databaseSql(d,
          "INSERT INTO users(id,name,role) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,role=excluded.role",
          "INSERT INTO users(id,name,role) VALUES(?,?,?) ON DUPLICATE KEY UPDATE name=VALUES(name),role=VALUES(role)",
        ),
      )
      .bind(signed.userId, name, role),
    d
      .prepare(
        databaseSql(d,
          "INSERT OR IGNORE INTO user_access(user_id,status,version,created_at,updated_at) VALUES(?,?,1,?,?)",
          "INSERT INTO user_access(user_id,status,version,created_at,updated_at) VALUES(?,?,1,?,?) ON DUPLICATE KEY UPDATE user_id=user_id",
        ),
      )
      .bind(signed.userId, role === "owner" ? "active" : "pending", at, at),
  ]);
  const a = await d
    .prepare("SELECT status,version FROM user_access WHERE user_id=?")
    .bind(signed.userId)
    .first<{ status: PlatformUser["accessStatus"]; version: number }>();
  return {
    id: signed.userId,
    name,
    role,
    accessStatus: role === "owner" ? "active" : a!.status,
    accessVersion: a!.version,
  };
}
export function requireActive(u: PlatformUser) {
  if (u.role !== "owner" && u.accessStatus !== "active")
    throw new AccessError(
      403,
      u.accessStatus === "suspended"
        ? "Akses akun ditangguhkan. Lihat status akun di halaman Akses akun."
        : "Akun menunggu persetujuan pengelola. Buka halaman Akses akun untuk melihat status.",
    );
}
export async function requireOwner(d: PlatformDatabase, u: { id: string }) {
  const o = await d
    .prepare("SELECT value FROM settings WHERE `key`='owner'")
    .first<{ value: string }>();
  if (!o || o.value !== u.id)
    throw new AccessError(
      403,
      "Hanya pemilik platform yang dapat mengelola akses akun.",
    );
  return o.value;
}
export async function accessOverview(d: PlatformDatabase, u: PlatformUser) {
  const result: any = {
    user: { id: u.id, name: u.name, role: u.role },
    status: u.accessStatus,
    version: u.accessVersion,
  };
  if (u.role !== "owner") return result;
  await requireOwner(d, u);
  result.users = (
    await d
      .prepare(
        `SELECT u.id,u.name,CASE WHEN u.id=? THEN 'owner' WHEN EXISTS(SELECT 1 FROM tutor_accounts t WHERE t.user_id=u.id AND t.active=1) OR EXISTS(SELECT 1 FROM cohorts WHERE mentor_id=u.id AND status!='archived') THEN 'tutor' ELSE 'student' END AS role,CASE WHEN u.id=? THEN 'active' ELSE COALESCE(a.status,'pending') END AS status,COALESCE(a.version,0) AS version,a.created_at AS createdAt,(SELECT count(*) FROM cohorts WHERE mentor_id=u.id AND status!='archived') AS mentorClasses FROM users u LEFT JOIN user_access a ON a.user_id=u.id ORDER BY CASE WHEN u.id=? THEN 0 WHEN a.status IS NULL OR a.status='pending' THEN 1 WHEN a.status='active' THEN 2 ELSE 3 END,u.name`,
      )
      .bind(u.id, u.id, u.id)
      .all()
  ).results;
  result.events = (
    await d
      .prepare(
        databaseSql(d,
          `SELECT e.id,e.target_id AS targetId,t.name AS targetName,e.actor_id AS actorId,a.name AS actorName,e.status,e.reason,e.created_at AS createdAt FROM access_events e JOIN users t ON t.id=e.target_id JOIN users a ON a.id=e.actor_id ORDER BY e.created_at DESC,e.rowid DESC LIMIT 100`,
          `SELECT e.id,e.target_id AS targetId,t.name AS targetName,e.actor_id AS actorId,a.name AS actorName,e.status,e.reason,e.created_at AS createdAt FROM access_events e JOIN users t ON t.id=e.target_id JOIN users a ON a.id=e.actor_id ORDER BY e.created_at DESC,e.id DESC LIMIT 100`,
        ),
      )
      .all()
  ).results;
  return result;
}
export async function updateAccess(
  d: PlatformDatabase,
  u: { id: string },
  raw: unknown,
) {
  const b = accessMutation.parse(raw),
    ownerId = await requireOwner(d, u);
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
          "UPDATE user_access SET status=?,version=version+1,updated_at=? WHERE user_id=? AND version=? AND user_id!=(SELECT value FROM settings WHERE `key`='owner') AND ?=(SELECT value FROM settings WHERE `key`='owner')",
        )
        .bind(b.status, at, b.userId, b.version, u.id)
    : d
        .prepare(
          databaseSql(d,
            "INSERT OR IGNORE INTO user_access(user_id,status,version,created_at,updated_at) SELECT ?,?,1,?,? WHERE ?=(SELECT value FROM settings WHERE `key`='owner') AND ?!=(SELECT value FROM settings WHERE `key`='owner')",
            "INSERT INTO user_access(user_id,status,version,created_at,updated_at) SELECT ?,?,1,?,? WHERE ?=(SELECT value FROM settings WHERE `key`='owner') AND ?!=(SELECT value FROM settings WHERE `key`='owner') ON DUPLICATE KEY UPDATE user_id=user_id",
          ),
        )
        .bind(b.userId, b.status, at, at, u.id, b.userId);
  // Audit is part of the same transaction. Deterministic per-account/version IDs make a losing concurrent update unable to duplicate events.
  const results = await d.batch([
    change,
    d
      .prepare(
        databaseSql(d,
          "INSERT OR IGNORE INTO access_events(id,actor_id,target_id,status,reason,created_at) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM user_access WHERE user_id=? AND version=? AND status=?) AND ?=(SELECT value FROM settings WHERE `key`='owner')",
          "INSERT INTO access_events(id,actor_id,target_id,status,reason,created_at) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM user_access WHERE user_id=? AND version=? AND status=?) AND ?=(SELECT value FROM settings WHERE `key`='owner') ON DUPLICATE KEY UPDATE id=id",
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
        u.id,
      ),
  ]);
  if (!results[0].meta.changes)
    throw new AccessError(
      409,
      "Status akun berubah. Muat ulang sebelum menyimpan.",
    );
  return { ok: true };
}
