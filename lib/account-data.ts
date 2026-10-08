import { curriculumEnabled } from "./curriculum-access.ts";
import { photoInfo } from "./media-data.ts";
import { databaseSql, type PlatformDatabase } from "./database.ts";
import { publishedSql } from "./database-sql.ts";
import { AccessError as AppError } from "./access.ts";
import { emptyProfile, profileSchema, dashboardCourse } from "./account.ts";
import { readCourse, readProgress } from "./course-data.ts";
import { enrolledSessions } from "./session-data.ts";
import { classAgenda, type ClassUser } from "./classes.ts";
import { dashboardProjects } from "./projects.ts";
import { tutorDashboard } from "./tutor-dashboard.ts";
import type { Course } from "./model";

export async function accountData(d: PlatformDatabase, u: ClassUser) {
  const p = await d.prepare("SELECT data,version FROM profiles WHERE user_id=?")
    .bind(u.id).first<{ data: string; version: number }>();
  const rows = (await d.prepare(`SELECT c.data,c.version,e.created_at AS enrolledAt FROM courses c LEFT JOIN enrollments e ON e.course_id=c.id AND e.user_id=? WHERE (${publishedSql(d, "c.data")} OR ?='owner') AND (e.user_id IS NOT NULL OR EXISTS(SELECT 1 FROM progress p WHERE p.course_id=c.id AND p.user_id=?)) ORDER BY e.created_at DESC,${databaseSql(d, "c.rowid", "c.id")}`)
    .bind(u.id, u.role, u.id).all<{ data: string; version: number; enrolledAt: string | null }>()).results;
  const courses = await Promise.all(rows.map(async (r) => {
    const c = { ...JSON.parse(r.data), version: r.version } as Course;
    return dashboardCourse(c, await readProgress(d, u.id, c.id), r.enrolledAt);
  }));
  const sessions = [...await enrolledSessions(d, u), ...await classAgenda(d, u)]
    .sort((a, b) => String(a.startsAt).localeCompare(String(b.startsAt)));
  return {
    photo: await photoInfo(d, u.id),
    profile: p ? { ...JSON.parse(p.data), version: p.version } : emptyProfile(u.name),
    courses,
    sessions,
    projects: await dashboardProjects(d, u),
    teaching: await tutorDashboard(d, u),
    curriculum: await curriculumEnabled(d,u),
  };
}
export async function enrollCourse(d: PlatformDatabase, u: ClassUser, id: string) {
  const c = await readCourse(d, id, u);
  if (!c.published) throw new AppError(400, "Course belum diterbitkan.");
  const result = await d.prepare(`${databaseSql(d, "INSERT OR IGNORE", "INSERT")} INTO enrollments(user_id,course_id,created_at) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM courses c WHERE c.id=? AND ${publishedSql(d, "c.data")}) AND EXISTS(SELECT 1 FROM user_access WHERE user_id=? AND status IN ('pending','active')) ${databaseSql(d, "", "ON DUPLICATE KEY UPDATE user_id=user_id")}`)
    .bind(u.id, id, new Date().toISOString(), id, u.id).run();
  if (!result.meta.changes && !(await d.prepare("SELECT 1 FROM enrollments WHERE user_id=? AND course_id=?").bind(u.id, id).first()))
    throw new AppError(409, "Course belum diterbitkan.");
  return { courseId: id };
}
export async function saveProfile(d: PlatformDatabase, userId: string, raw: unknown) {
  const p = profileSchema.parse(raw);
  const old = await d.prepare("SELECT version FROM profiles WHERE user_id=?")
    .bind(userId).first<{ version: number }>();
  if ((old?.version || 0) !== p.version) throw new AppError(409, "Profil sudah berubah. Muat ulang profil sebelum menyimpan.");
  const next = { ...p, version: p.version + 1 };
  const result = old
    ? await d.prepare("UPDATE profiles SET data=?,version=?,updated_at=? WHERE user_id=? AND version=?")
      .bind(JSON.stringify(next), next.version, new Date().toISOString(), userId, p.version).run()
    : await d.prepare(databaseSql(d,
      "INSERT OR IGNORE INTO profiles(user_id,data,version,updated_at) VALUES(?,?,?,?)",
      "INSERT INTO profiles(user_id,data,version,updated_at) VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE user_id=user_id"))
      .bind(userId, JSON.stringify(next), next.version, new Date().toISOString()).run();
  if (!result.meta.changes) throw new AppError(409, "Profil berubah saat disimpan. Muat ulang dan coba lagi.");
  return { profile: next };
}
