import { validateCourseMedia } from "./media-data.ts";
import { fileStorage } from "./project-files.ts";
import { databaseSql, type PlatformDatabase } from "./database.ts";
import { publishedSql } from "./database-sql.ts";
import { AccessError as AppError } from "./access.ts";
import { blockingLesson, canComplete, gradeQuiz, progressFor } from "./rules.ts";
import { courseSchema } from "./validation.ts";
import type { Course, Progress } from "./model";

type Learner = { id: string; role: string };
export async function seedCourse(d: PlatformDatabase, c: Course) {
  await d.prepare(databaseSql(d,
    "INSERT OR IGNORE INTO courses(id,data,version) VALUES(?,?,1)",
    "INSERT INTO courses(id,data,version) VALUES(?,?,1) ON DUPLICATE KEY UPDATE id=id"))
    .bind(c.id, JSON.stringify(c)).run();
}
export async function readCourse(d: PlatformDatabase, id: string, user: { role: string }) {
  const row = await d.prepare("SELECT data,version FROM courses WHERE id=?")
    .bind(id).first<{ data: string; version: number }>();
  if (!row) throw new AppError(404, "Course tidak ditemukan.");
  const c = { ...JSON.parse(row.data), version: row.version } as Course;
  if (!c.published && user.role !== "owner") throw new AppError(404, "Course belum tersedia.");
  return c;
}
export async function courseRows(d: PlatformDatabase, publishedOnly = false) {
  return (await d.prepare(`SELECT data,version FROM courses ${publishedOnly ? `WHERE ${publishedSql(d, "data")}` : ""} ORDER BY ${databaseSql(d, "rowid", "id")}`)
    .all<{ data: string; version: number }>()).results;
}
export async function readProgress(d: PlatformDatabase, userId: string, courseId: string) {
  return (await d.prepare("SELECT lesson_id AS lessonId,revision,complete,quiz_passed AS quizPassed,code_passed AS codePassed,quiz_attempts AS quizAttempts,code_attempts AS codeAttempts,score FROM progress WHERE user_id=? AND course_id=?")
    .bind(userId, courseId).all<Progress>()).results;
}
export async function accessibleLesson(d: PlatformDatabase, user: Learner, courseId: string, lessonId: string) {
  const c = await readCourse(d, courseId, user);
  const l = c.lessons.find((l) => l.id === lessonId);
  if (!l) throw new AppError(404, "Materi tidak ditemukan.");
  const p = await readProgress(d, user.id, c.id);
  const blocked = blockingLesson(c, l.id, p);
  if (blocked) throw new AppError(403, `Selesaikan syarat pada “${blocked.title}” terlebih dahulu.`);
  return { c, l, p };
}
export async function initializeProgress(d: PlatformDatabase, userId: string, courseId: string, lessonId: string, revision: number) {
  await d.prepare(databaseSql(d,
    "INSERT INTO progress(user_id,course_id,lesson_id,revision) VALUES(?,?,?,?) ON CONFLICT(user_id,course_id,lesson_id) DO UPDATE SET revision=excluded.revision,complete=0,quiz_passed=0,code_passed=0,quiz_attempts=0,code_attempts=0,score=0 WHERE progress.revision != excluded.revision",
    // Assignment order matters: comparisons must see the old revision.
    "INSERT INTO progress(user_id,course_id,lesson_id,revision) VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE complete=IF(revision<>VALUES(revision),0,complete),quiz_passed=IF(revision<>VALUES(revision),0,quiz_passed),code_passed=IF(revision<>VALUES(revision),0,code_passed),quiz_attempts=IF(revision<>VALUES(revision),0,quiz_attempts),code_attempts=IF(revision<>VALUES(revision),0,code_attempts),score=IF(revision<>VALUES(revision),0,score),revision=VALUES(revision)"))
    .bind(userId, courseId, lessonId, revision).run();
}
export async function saveCourse(d: PlatformDatabase, user: { role: string }, raw: unknown) {
  if (user.role !== "owner") throw new AppError(403, "Halaman ini hanya untuk pengelola course.");
  const next = courseSchema.parse(raw);
  const mediaIds = await validateCourseMedia(d, next);
  const old = await d.prepare("SELECT data,version FROM courses WHERE id=?")
    .bind(next.id).first<{ data: string; version: number }>();
  if (old) {
    if (old.version !== next.version) throw new AppError(409, "Course sudah berubah. Muat ulang sebelum menyimpan.");
    const previous = JSON.parse(old.data) as Course;
    next.lessons = next.lessons.map((l) => {
      const prior = previous.lessons.find((p) => p.id === l.id);
      return { ...l, revision: prior ? JSON.stringify({ ...l, revision: 0 }) === JSON.stringify({ ...prior, revision: 0 }) ? prior.revision : prior.revision + 1 : 1 };
    });
    next.version = old.version + 1;
    const data = JSON.stringify(next);
    const scope = mediaIds.length ? fileStorage().scope : "";
    const predicate = mediaIds.length ? ` AND (SELECT count(*) FROM media_files WHERE id IN (${mediaIds.map(() => "?").join(",")}) AND purpose='course' AND course_id=? AND scope=? AND ready=1)=?` : "";
    const update = d.prepare("UPDATE courses SET data=?,version=? WHERE id=? AND version=?" + predicate)
      .bind(data, next.version, next.id, old.version, ...(mediaIds.length ? [...mediaIds, next.id, scope, mediaIds.length] : []));
    const statements = [update];
    if (mediaIds.length) statements.push(d.prepare(`UPDATE media_files SET bound=1 WHERE id IN (${mediaIds.map(() => "?").join(",")}) AND course_id=? AND scope=? AND ready=1 AND EXISTS(SELECT 1 FROM courses WHERE id=? AND version=? AND data=?)`).bind(...mediaIds, next.id, scope, next.id, next.version, data));
    const [updated] = await d.batch(statements);
    if (!updated.meta.changes) throw new AppError(409, "Course berubah saat disimpan. Muat ulang dan coba lagi.");
  } else {
    if (mediaIds.length) throw new AppError(409, "Simpan course terlebih dahulu sebelum memakai upload.");
    if (next.version !== 0) throw new AppError(409, "Course tidak ditemukan. Muat ulang sebelum menyimpan.");
    next.version = 1;
    next.lessons = next.lessons.map((l) => ({ ...l, revision: 1 }));
    const result = await d.prepare(databaseSql(d,
      "INSERT OR IGNORE INTO courses(id,data,version) VALUES(?,?,1)",
      "INSERT INTO courses(id,data,version) VALUES(?,?,1) ON DUPLICATE KEY UPDATE id=id"))
      .bind(next.id, JSON.stringify(next)).run();
    if (!result.meta.changes) throw new AppError(409, "Course berubah saat disimpan. Muat ulang dan coba lagi.");
  }
  return next;
}
export async function completeLesson(d: PlatformDatabase, user: Learner, courseId: string, lessonId: string) {
  const { c, l, p } = await accessibleLesson(d, user, courseId, lessonId);
  await initializeProgress(d, user.id, c.id, l.id, l.revision);
  if (!canComplete(l, progressFor(l, p))) throw new AppError(403, "Lulus tes wajib terlebih dahulu.");
  await d.prepare("UPDATE progress SET complete=1 WHERE user_id=? AND course_id=? AND lesson_id=? AND revision=?")
    .bind(user.id, c.id, l.id, l.revision).run();
  return { complete: true };
}
export async function submitQuiz(d: PlatformDatabase, user: Learner, courseId: string, lessonId: string, answers: Record<string, number[]>) {
  const { c, l } = await accessibleLesson(d, user, courseId, lessonId);
  await initializeProgress(d, user.id, c.id, l.id, l.revision);
  if (!l.quiz) throw new AppError(400, "Materi ini tidak memiliki kuis.");
  const result = gradeQuiz(l.quiz, answers);
  const id = crypto.randomUUID();
  // Reserve, retain the result, and grant the pass together. A storage failure
  // rolls back the quota; parallel submissions cannot exceed maxAttempts.
  const results = await d.batch([
    d.prepare("INSERT INTO attempts(id,user_id,course_id,lesson_id,revision,kind,state,score,data,created_at) SELECT ?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM progress WHERE user_id=? AND course_id=? AND lesson_id=? AND revision=? AND (?=0 OR quiz_attempts<?))")
      .bind(id, user.id, c.id, l.id, l.revision, "quiz", "finished", result.score, JSON.stringify({ answers, result }), new Date().toISOString(), user.id, c.id, l.id, l.revision, l.quiz.maxAttempts, l.quiz.maxAttempts),
    d.prepare("UPDATE progress SET quiz_attempts=quiz_attempts+1 WHERE user_id=? AND course_id=? AND lesson_id=? AND revision=? AND EXISTS(SELECT 1 FROM attempts WHERE id=?)")
      .bind(user.id, c.id, l.id, l.revision, id),
    d.prepare(`UPDATE progress SET quiz_passed=${databaseSql(d, "max(quiz_passed,?)", "GREATEST(quiz_passed,?)")},score=? WHERE user_id=? AND course_id=? AND lesson_id=? AND revision=? AND EXISTS(SELECT 1 FROM attempts WHERE id=?)`)
      .bind(result.passed ? 1 : 0, result.score, user.id, c.id, l.id, l.revision, id),
  ]);
  if (!results[0].meta.changes) throw new AppError(429, "Batas percobaan tercapai. Hubungi mentor untuk membuka percobaan kembali.");
  return result;
}
