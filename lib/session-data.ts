import {requirePermission,authorizationGuard,policySql} from "./authorization.ts";
import { databaseSql, type PlatformDatabase } from "./database.ts";
import { courseTitleSql, publishedSql, upcomingSessionSql } from "./database-sql.ts";
import { AccessError as AppError } from "./access.ts";
import { learningCoursePredicate, learningCourseBindings, requireLearningCourse, learningReadSnapshot, assertLearningRead } from "./learning-access.ts";
import { readCourse } from "./course-data.ts";
import { sessionSchema } from "./validation.ts";
type User = { id: string; role: string };
const reservations = (session: string) => `(SELECT count(*) FROM rsvps r JOIN account_principals p ON p.user_id=r.user_id AND p.kind='student' WHERE r.session_id=${session})`;

export async function publicSessions(d: PlatformDatabase, at = new Date().toISOString()) {
  return (await d.prepare(`SELECT s.id,s.course_id AS courseId,s.title,s.kind,s.starts_at AS startsAt,s.duration,s.capacity,s.location,${reservations('s.id')} AS count FROM sessions s JOIN courses c ON c.id=s.course_id WHERE ${publishedSql(d, "c.data")} AND s.starts_at>? ORDER BY s.starts_at`)
    .bind(at).all()).results;
}
export async function learningSessions(d: PlatformDatabase, user: User) {
  const guard=await authorizationGuard(d,user,'account'),ctx=guard.context;
  user=ctx;
  if(ctx.owner){const rows=(await d.prepare(`SELECT s.id,s.course_id AS courseId,s.title,s.kind,s.starts_at AS startsAt,s.duration,s.location,s.capacity,s.url,${reservations('s.id')} AS count,0 AS joined FROM sessions s WHERE ${policySql("owner")} ORDER BY s.starts_at`).bind(user.id).all()).results;
    if(!await d.prepare(`SELECT 1 WHERE ${guard.sql}`).bind(...guard.binds).first())throw new AppError(403,'Hak pengelola berubah. Muat ulang jadwal.');return rows;}
  await requirePermission(d,user,"student");
  const before=await learningReadSnapshot(d,user);
  const rows=(await d.prepare(`SELECT s.id,s.course_id AS courseId,s.title,s.kind,s.starts_at AS startsAt,s.duration,s.location,s.capacity,CASE WHEN EXISTS(SELECT 1 FROM rsvps WHERE session_id=s.id AND user_id=?) THEN s.url ELSE '' END AS url,${reservations('s.id')} AS count,EXISTS(SELECT 1 FROM rsvps WHERE session_id=s.id AND user_id=?) AS joined FROM sessions s JOIN courses c ON c.id=s.course_id WHERE ${publishedSql(d, "c.data")} AND ${learningCoursePredicate("c.id")} ORDER BY s.starts_at`)
    .bind(user.id, user.id, ...learningCourseBindings(user.id)).all()).results;
  await assertLearningRead(d,user,before,rows.map(r=>String(r.courseId)));
  if(!await d.prepare(`SELECT 1 WHERE ${guard.sql}`).bind(...guard.binds).first())throw new AppError(403,'Hak akun berubah. Muat ulang jadwal.');return rows;
}
export async function enrolledSessions(d: PlatformDatabase, user: User, at = new Date().toISOString()) {
  const guard=await authorizationGuard(d,user,'student');user=guard.context;
  const before=await learningReadSnapshot(d,user);
  const rows=(await d.prepare(`SELECT s.id,s.course_id AS courseId,${courseTitleSql(d, "c.data")} AS courseTitle,s.title,s.kind,s.starts_at AS startsAt,s.duration,s.location,s.url FROM rsvps r JOIN sessions s ON s.id=r.session_id JOIN courses c ON c.id=s.course_id WHERE r.user_id=? AND (${publishedSql(d, "c.data")} OR ?='owner') AND ${upcomingSessionSql(d)} AND ${learningCoursePredicate("c.id")} ORDER BY s.starts_at`)
    .bind(user.id, user.role, at, ...learningCourseBindings(user.id)).all()).results;
  await assertLearningRead(d,user,before,rows.map(r=>String(r.courseId)));
  if(!await d.prepare(`SELECT 1 WHERE ${guard.sql}`).bind(...guard.binds).first())throw new AppError(403,'Hak akun berubah. Muat ulang jadwal.');return rows;
}
export async function saveSession(d: PlatformDatabase, user: User, raw: unknown) {
  const guard=await authorizationGuard(d,user,"owner");
  const s = sessionSchema.parse(raw);
  await readCourse(d, s.courseId, user);
  if (Date.parse(s.startsAt) <= Date.now()) throw new AppError(400, "Pilih waktu sesi yang akan datang.");
  const id = s.id || crypto.randomUUID();
  // Recheck capacity in the write, including when an existing session shrinks.
  const result = await d.prepare(`INSERT INTO sessions(id,course_id,title,kind,starts_at,duration,location,url,capacity) SELECT ?,?,?,?,?,?,?,?,? WHERE ${reservations('?')}<=? AND ${guard.sql} ${databaseSql(d,
    "ON CONFLICT(id) DO UPDATE SET course_id=excluded.course_id,title=excluded.title,kind=excluded.kind,starts_at=excluded.starts_at,duration=excluded.duration,location=excluded.location,url=excluded.url,capacity=excluded.capacity",
    "ON DUPLICATE KEY UPDATE course_id=VALUES(course_id),title=VALUES(title),kind=VALUES(kind),starts_at=VALUES(starts_at),duration=VALUES(duration),location=VALUES(location),url=VALUES(url),capacity=VALUES(capacity)")}`)
    .bind(id, s.courseId, s.title, s.kind, s.startsAt, s.duration, s.location, s.url, s.capacity,id,s.capacity,...guard.binds).run();
  if (!result.meta.changes) {
    if(!await d.prepare(`SELECT 1 WHERE ${guard.sql}`).bind(...guard.binds).first())throw new AppError(409,"Hak akses berubah. Muat ulang sebelum menyimpan.");
    const registered = await d.prepare(`SELECT ${reservations('?')} AS total`).bind(id).first<{ total: number }>();
    if ((registered?.total || 0) > s.capacity) throw new AppError(409, "Kapasitas tidak boleh lebih kecil dari jumlah peserta terdaftar.");
  }
  return { id };
}
export async function setRsvp(d: PlatformDatabase, user: User, id: string, join: boolean) {
  await requirePermission(d,user,"student");
  const s = await d.prepare("SELECT course_id,starts_at FROM sessions WHERE id=?").bind(id).first<{ course_id: string; starts_at: string }>();
  if (!s) throw new AppError(404, "Sesi tidak ditemukan.");
  const guard=await authorizationGuard(d,user,"student",s.course_id);
  await requireLearningCourse(d, user, s.course_id);
  await readCourse(d, s.course_id, user);
  if (Date.parse(s.starts_at) < Date.now()) throw new AppError(400, "Pendaftaran sesi sudah ditutup.");
  if (!join) {
    await d.prepare(`DELETE FROM rsvps WHERE session_id=? AND user_id=? AND ${guard.sql}`).bind(id,user.id,...guard.binds).run();
    if(!await d.prepare(`SELECT 1 WHERE ${guard.sql}`).bind(...guard.binds).first())throw new AppError(403,"Hak akses berubah. Muat ulang sebelum melanjutkan.");
    return { joined: false };
  }
  await d.prepare(`${databaseSql(d, "INSERT OR IGNORE", "INSERT")} INTO rsvps(session_id,user_id) SELECT ?,? WHERE EXISTS(SELECT 1 FROM sessions s JOIN courses c ON c.id=s.course_id WHERE s.id=? AND s.starts_at>? AND ${publishedSql(d, "c.data")} AND ${reservations('s.id')}<s.capacity) AND ${guard.sql} ${databaseSql(d, "", "ON DUPLICATE KEY UPDATE user_id=user_id")}`)
    .bind(id, user.id, id, new Date().toISOString(),...guard.binds).run();
  const joined = await d.prepare(`SELECT 1 FROM rsvps WHERE session_id=? AND user_id=? AND ${guard.sql}`).bind(id,user.id,...guard.binds).first();
  if (!joined) throw new AppError(409, "Sesi sudah penuh atau pendaftaran ditutup.");
  return { joined: true };
}
