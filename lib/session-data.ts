import { databaseSql, type PlatformDatabase } from "./database.ts";
import { courseTitleSql, publishedSql, upcomingSessionSql } from "./database-sql.ts";
import { AccessError as AppError } from "./access.ts";
import { readCourse } from "./course-data.ts";
import { sessionSchema } from "./validation.ts";
type User = { id: string; role: string };

export async function publicSessions(d: PlatformDatabase, at = new Date().toISOString()) {
  return (await d.prepare(`SELECT s.id,s.course_id AS courseId,s.title,s.kind,s.starts_at AS startsAt,s.duration,s.capacity,s.location,(SELECT COUNT(*) FROM rsvps WHERE session_id=s.id) AS count FROM sessions s JOIN courses c ON c.id=s.course_id WHERE ${publishedSql(d, "c.data")} AND s.starts_at>? ORDER BY s.starts_at`)
    .bind(at).all()).results;
}
export async function learningSessions(d: PlatformDatabase, user: User) {
  return (await d.prepare(`SELECT s.id,s.course_id AS courseId,s.title,s.kind,s.starts_at AS startsAt,s.duration,s.location,s.capacity,CASE WHEN ?='owner' OR EXISTS(SELECT 1 FROM rsvps WHERE session_id=s.id AND user_id=?) THEN s.url ELSE '' END AS url,(SELECT count(*) FROM rsvps WHERE session_id=s.id) AS count,EXISTS(SELECT 1 FROM rsvps WHERE session_id=s.id AND user_id=?) AS joined FROM sessions s JOIN courses c ON c.id=s.course_id WHERE (?='owner' OR ${publishedSql(d, "c.data")}) ORDER BY s.starts_at`)
    .bind(user.role, user.id, user.id, user.role).all()).results;
}
export async function enrolledSessions(d: PlatformDatabase, user: User, at = new Date().toISOString()) {
  return (await d.prepare(`SELECT s.id,s.course_id AS courseId,${courseTitleSql(d, "c.data")} AS courseTitle,s.title,s.kind,s.starts_at AS startsAt,s.duration,s.location,s.url FROM rsvps r JOIN sessions s ON s.id=r.session_id JOIN courses c ON c.id=s.course_id WHERE r.user_id=? AND (${publishedSql(d, "c.data")} OR ?='owner') AND ${upcomingSessionSql(d)} ORDER BY s.starts_at`)
    .bind(user.id, user.role, at).all()).results;
}
export async function saveSession(d: PlatformDatabase, user: User, raw: unknown) {
  if (user.role !== "owner") throw new AppError(403, "Halaman ini hanya untuk pengelola course.");
  const s = sessionSchema.parse(raw);
  await readCourse(d, s.courseId, user);
  if (Date.parse(s.startsAt) <= Date.now()) throw new AppError(400, "Pilih waktu sesi yang akan datang.");
  const id = s.id || crypto.randomUUID();
  // Recheck capacity in the write, including when an existing session shrinks.
  const result = await d.prepare(`INSERT INTO sessions(id,course_id,title,kind,starts_at,duration,location,url,capacity) SELECT ?,?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM rsvps WHERE session_id=?)<=? ${databaseSql(d,
    "ON CONFLICT(id) DO UPDATE SET course_id=excluded.course_id,title=excluded.title,kind=excluded.kind,starts_at=excluded.starts_at,duration=excluded.duration,location=excluded.location,url=excluded.url,capacity=excluded.capacity",
    "ON DUPLICATE KEY UPDATE course_id=VALUES(course_id),title=VALUES(title),kind=VALUES(kind),starts_at=VALUES(starts_at),duration=VALUES(duration),location=VALUES(location),url=VALUES(url),capacity=VALUES(capacity)")}`)
    .bind(id, s.courseId, s.title, s.kind, s.startsAt, s.duration, s.location, s.url, s.capacity, id, s.capacity).run();
  if (!result.meta.changes) {
    const registered = await d.prepare("SELECT COUNT(*) AS total FROM rsvps WHERE session_id=?").bind(id).first<{ total: number }>();
    if ((registered?.total || 0) > s.capacity) throw new AppError(409, "Kapasitas tidak boleh lebih kecil dari jumlah peserta terdaftar.");
  }
  return { id };
}
export async function setRsvp(d: PlatformDatabase, user: User, id: string, join: boolean) {
  const s = await d.prepare("SELECT course_id,starts_at FROM sessions WHERE id=?").bind(id).first<{ course_id: string; starts_at: string }>();
  if (!s) throw new AppError(404, "Sesi tidak ditemukan.");
  await readCourse(d, s.course_id, user);
  if (Date.parse(s.starts_at) < Date.now()) throw new AppError(400, "Pendaftaran sesi sudah ditutup.");
  if (!join) {
    await d.prepare("DELETE FROM rsvps WHERE session_id=? AND user_id=?").bind(id, user.id).run();
    return { joined: false };
  }
  await d.prepare(`${databaseSql(d, "INSERT OR IGNORE", "INSERT")} INTO rsvps(session_id,user_id) SELECT ?,? WHERE EXISTS(SELECT 1 FROM sessions s JOIN courses c ON c.id=s.course_id WHERE s.id=? AND s.starts_at>? AND (${publishedSql(d, "c.data")} OR ?='owner') AND (SELECT count(*) FROM rsvps WHERE session_id=s.id)<s.capacity) ${databaseSql(d, "", "ON DUPLICATE KEY UPDATE user_id=user_id")}`)
    .bind(id, user.id, id, new Date().toISOString(), user.role).run();
  const joined = await d.prepare("SELECT 1 FROM rsvps WHERE session_id=? AND user_id=?").bind(id, user.id).first();
  if (!joined) throw new AppError(409, "Sesi sudah penuh atau pendaftaran ditutup.");
  return { joined: true };
}
