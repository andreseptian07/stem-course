import {planCoursePublication} from "./academic-revisions.ts";
import {academicProgress,loadGraduationContext,academicProofPredicate,requireAcademicLesson} from "./graduation-data.ts";
import {readAcademicReceipt,academicReceipt} from "./academic-receipts.ts";
import {canConfirmLessonCompletion} from "./graduation.ts";
import { authorizationGuard, requirePermission } from "./authorization.ts";
import { learningCoursePredicate, learningCourseBindings, learningAuthorization } from "./learning-access.ts";
import { validateCourseMedia } from "./media-data.ts";
import { fileStorage } from "./project-files.ts";
import { databaseSql, type PlatformDatabase } from "./database.ts";
import { publishedSql } from "./database-sql.ts";
import { AccessError as AppError } from "./access.ts";
import { canComplete, gradeQuiz, progressFor } from "./rules.ts";
import { courseSchema } from "./validation.ts";
import type { Course } from "./model";

type Learner = { id: string; role: string };
export async function seedCourse(d: PlatformDatabase, c: Course) {
  await d.prepare(databaseSql(d,
    "INSERT OR IGNORE INTO courses(id,data,version) VALUES(?,?,1)",
    "INSERT INTO courses(id,data,version) VALUES(?,?,1) ON DUPLICATE KEY UPDATE id=id"))
    .bind(c.id, JSON.stringify(c)).run();
}
export async function readCourse(d: PlatformDatabase, id: string, user: { id:string;role?: string }) {
  const row = await d.prepare("SELECT data,version FROM courses WHERE id=?")
    .bind(id).first<{ data: string; version: number }>();
  if (!row) throw new AppError(404, "Course tidak ditemukan.");
  const c = { ...JSON.parse(row.data), version: row.version } as Course;
  if(!c.published)await requirePermission(d,user,"curriculum",id);
  return c;
}
export async function readLearningCourse(d: PlatformDatabase, id: string, user: Learner) {
  const guard=await learningAuthorization(d,user,id),course=await readCourse(d,id,user);
  if(course.version!==guard.proof.courseVersion||!await d.prepare(`SELECT 1 WHERE ${guard.sql}`).bind(...guard.binds).first())throw new AppError(403,'Hak atau materi belajar berubah. Muat ulang halaman.');
  return course;
}
export async function learningCourseRows(d: PlatformDatabase, user: Learner) {
  await requirePermission(d,user,"student");
  return (await d.prepare(`SELECT c.data,c.version FROM courses c WHERE ${learningCoursePredicate("c.id")} ORDER BY c.id`).bind(...learningCourseBindings(user.id)).all<{data:string;version:number}>()).results;
}
export async function courseRows(d: PlatformDatabase, publishedOnly = false) {
  return (await d.prepare(`SELECT data,version FROM courses ${publishedOnly ? `WHERE ${publishedSql(d, "data")}` : ""} ORDER BY ${databaseSql(d, "rowid", "id")}`)
    .all<{ data: string; version: number }>()).results;
}
export async function readProgress(d: PlatformDatabase, userId: string, courseId: string) {
  return academicProgress(d,userId,courseId);
}
export async function accessibleLesson(d: PlatformDatabase, user: Learner, courseId: string, lessonId: string,classId?:string|null) {
  const context=await loadGraduationContext(d,user,courseId,classId);
  const l=requireAcademicLesson(context,lessonId);
  return {c:context.course,l,p:context.progress,context};
}
export async function initializeProgress(d:PlatformDatabase,userId:string,courseId:string,lessonId:string,revision:number,expected?:{sql:string;binds:(string|number|boolean|null)[]}){
  const guard=expected||await learningAuthorization(d,{id:userId},courseId);
  const query=databaseSql(d,
    `INSERT OR IGNORE INTO learning_progress_revisions(user_id,course_id,lesson_id,revision) SELECT ?,?,?,? WHERE ${guard.sql}`,
    `INSERT INTO learning_progress_revisions(user_id,course_id,lesson_id,revision) SELECT ?,?,?,? WHERE ${guard.sql} ON DUPLICATE KEY UPDATE revision=revision`);
  await d.prepare(query).bind(userId,courseId,lessonId,revision,...guard.binds).run();
  if(!await d.prepare(`SELECT 1 FROM learning_progress_revisions WHERE user_id=? AND course_id=? AND lesson_id=? AND revision=? AND ${guard.sql}`).bind(userId,courseId,lessonId,revision,...guard.binds).first())throw new AppError(409,'Akses atau prasyarat berubah. Muat ulang sebelum melanjutkan.');
}
export async function saveCourse(d: PlatformDatabase, user: { id:string;role?: string }, raw: unknown) {
  const guard=await authorizationGuard(d,user,"owner");
  let next:Course = courseSchema.parse(raw);
  const mediaIds = await validateCourseMedia(d, next);
  const old = await d.prepare("SELECT data,version FROM courses WHERE id=?")
    .bind(next.id).first<{ data: string; version: number }>();
  if (old) {
    if (old.version !== next.version) throw new AppError(409, "Course sudah berubah. Muat ulang sebelum menyimpan.");
    const previous = JSON.parse(old.data) as Course;
    const classifications=next.lessons.map(l=>({lessonId:l.id,change:l.change||null}));
    next=planCoursePublication(next,previous);
    next.version = old.version + 1;
    const data = JSON.stringify(next);
    const scope = mediaIds.length ? fileStorage().scope : "";
    const predicate = mediaIds.length ? ` AND (SELECT count(*) FROM media_files WHERE id IN (${mediaIds.map(() => "?").join(",")}) AND purpose='course' AND course_id=? AND scope=? AND ready=1)=?` : "";
    const update = d.prepare(`UPDATE courses SET data=?,version=? WHERE id=? AND version=? AND ${guard.sql}` + predicate)
      .bind(data, next.version, next.id, old.version, ...guard.binds, ...(mediaIds.length ? [...mediaIds, next.id, scope, mediaIds.length] : []));
    const statements = [update, d.prepare("INSERT INTO academic_change_events(id,actor_id,object_id,kind,data,created_at) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM courses WHERE id=? AND version=? AND data=?)").bind(crypto.randomUUID(),user.id,next.id,"course_publication",JSON.stringify({previous,next,classifications}),new Date().toISOString(),next.id,next.version,data)];
    if (mediaIds.length) statements.push(d.prepare(`UPDATE media_files SET bound=1 WHERE id IN (${mediaIds.map(() => "?").join(",")}) AND course_id=? AND scope=? AND ready=1 AND EXISTS(SELECT 1 FROM courses WHERE id=? AND version=? AND data=?)`).bind(...mediaIds, next.id, scope, next.id, next.version, data));
    const [updated] = await d.batch(statements);
    if (!updated.meta.changes) throw new AppError(409, "Course berubah saat disimpan. Muat ulang dan coba lagi.");
  } else {
    if (mediaIds.length) throw new AppError(409, "Simpan course terlebih dahulu sebelum memakai upload.");
    if (next.version !== 0) throw new AppError(409, "Course tidak ditemukan. Muat ulang sebelum menyimpan.");
    next=planCoursePublication(next);
    next.version = 1;
    const result = await d.prepare(databaseSql(d,
      `INSERT OR IGNORE INTO courses(id,data,version) SELECT ?,?,1 WHERE ${guard.sql}`,
      `INSERT INTO courses(id,data,version) SELECT ?,?,1 WHERE ${guard.sql} ON DUPLICATE KEY UPDATE id=id`))
      .bind(next.id, JSON.stringify(next),...guard.binds).run();
    if (!result.meta.changes) throw new AppError(409, "Course berubah saat disimpan. Muat ulang dan coba lagi.");
  }
  return next;
}
export async function completeLesson(d: PlatformDatabase, user: Learner, courseId: string, lessonId: string,classId?:string|null,requestId=crypto.randomUUID(),expectedRevision?:number) {
  const {c,l,p,context}=await accessibleLesson(d,user,courseId,lessonId,classId);
  if(expectedRevision!==undefined&&expectedRevision!==l.revision)throw new AppError(409,"ASSESSMENT_CHANGED: Materi berubah. Muat ulang sebelum mengerjakan.");
  const payload={courseId,lessonId,revision:l.revision,classId:context.state.classId};
  const prior=await readAcademicReceipt<{complete:boolean}>(d,user.id,"complete",requestId,payload);
  if(prior)return prior;
  if(!canComplete(l,progressFor(l,p)))throw new AppError(403,"Lulus tes wajib terlebih dahulu.");
  if(!canConfirmLessonCompletion(context.state.lessons.find(lesson=>lesson.lessonId===lessonId)))throw new AppError(403,"Penuhi seluruh syarat kelulusan, termasuk review tugas wajib, sebelum menandai tahap selesai.");
  const guard=academicProofPredicate(context,lessonId,true,true);
  await initializeProgress(d,user.id,c.id,l.id,l.revision,guard);
  const result={complete:true};
  const condition=`user_id=? AND course_id=? AND lesson_id=? AND revision=? AND (?=0 OR quiz_passed=1) AND (?=0 OR code_passed=1)`;
  const values=[user.id,c.id,l.id,l.revision,l.quiz?.mode==="required"?1:0,l.exercise?.required?1:0];
  await d.batch([
    d.prepare(`UPDATE learning_progress_revisions SET complete=1,version=version+1 WHERE ${condition} AND ${guard.sql} AND NOT EXISTS(SELECT 1 FROM academic_mutation_receipts WHERE actor_id=? AND action='complete' AND request_id=?)`).bind(...values,...guard.binds,user.id,requestId),
    academicReceipt(d,user.id,"complete",requestId,payload,result,`EXISTS(SELECT 1 FROM learning_progress_revisions WHERE ${condition} AND complete=1) AND ${guard.sql}`,[...values,...guard.binds]),
  ]);
  const saved=await readAcademicReceipt<typeof result>(d,user.id,"complete",requestId,payload);
  if(!saved){if(!await d.prepare(`SELECT 1 WHERE ${context.guard.sql}`).bind(...context.guard.binds).first())throw new AppError(403,"Hak akses berubah.");throw new AppError(409,"Prasyarat atau hasil penilaian berubah sebelum disimpan.");}
  return saved;
}
export async function submitQuiz(d: PlatformDatabase, user: Learner, courseId: string, lessonId: string, answers: Record<string, number[]>,classId?:string|null,requestId=crypto.randomUUID(),expectedRevision?:number) {
  const {c,l,context}=await accessibleLesson(d,user,courseId,lessonId,classId);
  if(expectedRevision!==undefined&&expectedRevision!==l.revision)throw new AppError(409,"ASSESSMENT_CHANGED: Materi berubah. Muat ulang sebelum mengerjakan.");
  const payload={courseId,lessonId,revision:l.revision,classId:context.state.classId,answers};
  const prior=await readAcademicReceipt<ReturnType<typeof gradeQuiz>>(d,user.id,"quiz",requestId,payload);
  if(prior)return prior;
  if(!l.quiz)throw new AppError(400,"Materi ini tidak memiliki kuis.");
  const guard=academicProofPredicate(context,lessonId);
  await initializeProgress(d,user.id,c.id,l.id,l.revision,guard);
  const result=gradeQuiz(l.quiz,answers),id=requestId;
  const results=await d.batch([
    d.prepare(`INSERT INTO attempts(id,user_id,course_id,lesson_id,revision,kind,state,score,data,created_at) SELECT ?,?,?,?,?,'quiz','finished',?,?,? WHERE EXISTS(SELECT 1 FROM learning_progress_revisions WHERE user_id=? AND course_id=? AND lesson_id=? AND revision=? AND (?=0 OR quiz_attempts<?)) AND ${guard.sql} AND NOT EXISTS(SELECT 1 FROM attempts WHERE id=?)`).bind(id,user.id,c.id,l.id,l.revision,result.score,JSON.stringify({answers,result,classId:context.state.classId}),new Date().toISOString(),user.id,c.id,l.id,l.revision,l.quiz.maxAttempts,l.quiz.maxAttempts,...guard.binds,id),
    d.prepare(`UPDATE learning_progress_revisions SET quiz_attempts=quiz_attempts+1,quiz_passed=${databaseSql(d,"max(quiz_passed,?)","GREATEST(quiz_passed,?)")},score=?,quiz_evidence_id=CASE WHEN ?=1 THEN ? ELSE quiz_evidence_id END,version=version+1 WHERE user_id=? AND course_id=? AND lesson_id=? AND revision=? AND EXISTS(SELECT 1 FROM attempts WHERE id=? AND user_id=?) AND NOT EXISTS(SELECT 1 FROM academic_mutation_receipts WHERE actor_id=? AND action='quiz' AND request_id=?)`).bind(result.passed?1:0,result.score,result.passed?1:0,id,user.id,c.id,l.id,l.revision,id,user.id,user.id,requestId),
    academicReceipt(d,user.id,"quiz",requestId,payload,result,"EXISTS(SELECT 1 FROM attempts WHERE id=? AND user_id=?)",[id,user.id]),
  ]);
  const saved=await readAcademicReceipt<typeof result>(d,user.id,"quiz",requestId,payload);
  if(saved)return saved;
  if(!results[0].meta.changes&&!await d.prepare(`SELECT 1 WHERE ${context.guard.sql}`).bind(...context.guard.binds).first())throw new AppError(403,"Hak akses berubah.");
  if(!results[0].meta.changes&&!await d.prepare(`SELECT 1 WHERE ${guard.sql}`).bind(...guard.binds).first())throw new AppError(409,"Prasyarat berubah.");
  throw new AppError(429,"Batas percobaan tercapai. Hubungi mentor untuk membuka percobaan kembali.");
}
