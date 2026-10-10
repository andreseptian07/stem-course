import {loadGraduationContext,assertAcademicRead} from "./graduation-data.ts";
import type {PlatformDatabase,DatabaseValue} from './database.ts';
import type {Course,Progress} from './model.ts';
import {AccessError} from './access-error.ts';
import {authorizationGuard} from './authorization.ts';
import {learningAuthorization,learningReadSnapshot,assertLearningRead} from './learning-access.ts';
import {accessibleLesson,courseRows,learningCourseRows} from './course-data.ts';
import {learningSessions} from './session-data.ts';
import {curriculumEnabled} from './curriculum-access.ts';
import {classAgenda} from './classes.ts';
import {publicCourse} from './rules.ts';
type User={id:string;role:string};
type Guard={sql:string;binds:DatabaseValue[]};
async function current(d:PlatformDatabase,guard:Guard){
  if(!await d.prepare(`SELECT 1 WHERE ${guard.sql}`).bind(...guard.binds).first())throw new AccessError(403,'Hak akses berubah. Muat ulang ruang belajar.');
}
export async function studioHistory(d:PlatformDatabase,u:User,courseId:string,lessonId:string,classId?:string|null){
  const guard=await learningAuthorization(d,u,courseId);
  const {context}=await accessibleLesson(d,u,courseId,lessonId,classId);
  const attempts=(await d.prepare('SELECT id,kind,state,score,created_at AS createdAt FROM attempts WHERE user_id=? AND course_id=? AND lesson_id=? ORDER BY created_at DESC LIMIT 10').bind(u.id,courseId,lessonId).all()).results;
  await assertAcademicRead(d,context);await current(d,guard);return {attempts};
}
export async function studioDiscussion(d:PlatformDatabase,u:User,courseId:string,lessonId:string,classId?:string|null){
  const actor=await authorizationGuard(d,u,'account');
  const guard=actor.context.owner?await authorizationGuard(d,u,'owner'):await learningAuthorization(d,u,courseId);
  const ctx=!actor.context.owner&&lessonId?(await accessibleLesson(d,u,courseId,lessonId,classId)).context:null;
  const messages=(await d.prepare('SELECT id,course_id AS courseId,lesson_id AS lessonId,user_id AS userId,name,role,body,parent_id AS parentId,created_at AS createdAt FROM messages WHERE course_id=? AND lesson_id=? ORDER BY created_at LIMIT 300').bind(courseId,lessonId).all()).results;
  if(ctx)await assertAcademicRead(d,ctx);await current(d,guard);await current(d,actor);return {messages};
}
export async function adminStudioData(d:PlatformDatabase,u:User,judgeReady:boolean){
  const guard=await authorizationGuard(d,u,'owner');
  const result={user:guard.context,curriculum:true,
    courses:(await courseRows(d)).map(r=>({...JSON.parse(r.data),version:r.version})),
    users:(await d.prepare('SELECT id,name,role FROM users').all()).results,
    progress:(await d.prepare('SELECT p.*,u.name FROM learning_progress_revisions p JOIN users u ON u.id=p.user_id ORDER BY p.course_id,p.user_id').all()).results,
    sessions:await learningSessions(d,guard.context),judgeReady};
  await current(d,guard);return result;
}
export async function personalStudioData(d:PlatformDatabase,u:User,judgeReady:boolean,selectedCourse?:string,selectedClass?:string|null){
  const guard=await authorizationGuard(d,u,'student'),before=await learningReadSnapshot(d,u);
  const courses=(await learningCourseRows(d,u)).map(r=>({...JSON.parse(r.data),version:r.version}) as Course);
  if(selectedClass&&!selectedCourse)throw new AccessError(400,"Pilih course untuk konteks kelas.");
  if(selectedCourse&&!courses.some(c=>c.id===selectedCourse))throw new AccessError(404,"Course tidak tersedia.");
  const progress:Record<string,Progress[]>={};
  const contexts=[];
  for(const c of courses){const ctx=await loadGraduationContext(d,u,c.id,c.id===selectedCourse?selectedClass:undefined);contexts.push(ctx);progress[c.id]=ctx.progress;}
  const result={user:guard.context,curriculum:await curriculumEnabled(d,u),courses:contexts.map(ctx=>publicCourse(ctx.course,ctx.progress,ctx.state)),progress,sessions:await learningSessions(d,u),classSessions:await classAgenda(d,guard.context),judgeReady};
  for(const ctx of contexts)await assertAcademicRead(d,ctx);
  await assertLearningRead(d,u,before,courses.map(c=>c.id));await current(d,guard);return result;
}
export async function resetStudioAttempts(d:PlatformDatabase,u:User,target:{userId:string;courseId:string;lessonId:string}){
  const guard=await authorizationGuard(d,u,'owner');
  const row=await d.prepare("SELECT data,version FROM courses WHERE id=?").bind(target.courseId).first<{data:string;version:number}>();
  const lesson=row&&(JSON.parse(row.data) as Course).lessons.find(l=>l.id===target.lessonId);
  if(!lesson)throw new AccessError(404,"Materi tidak ditemukan.");
  const binds=[target.userId,target.courseId,target.lessonId];
  if(await d.prepare("SELECT 1 FROM attempts WHERE user_id=? AND course_id=? AND lesson_id=? AND state IN ('pending','submitting')").bind(...binds).first())throw new AccessError(409,'Tunggu pemeriksaan kode yang berjalan.');
  await d.prepare(`UPDATE learning_progress_revisions SET quiz_attempts=0,code_attempts=0,version=version+1 WHERE user_id=? AND course_id=? AND lesson_id=? AND revision=? AND EXISTS(SELECT 1 FROM courses WHERE id=? AND version=?) AND ${guard.sql} AND NOT EXISTS(SELECT 1 FROM attempts a WHERE a.user_id=learning_progress_revisions.user_id AND a.course_id=learning_progress_revisions.course_id AND a.lesson_id=learning_progress_revisions.lesson_id AND a.state IN ('pending','submitting'))`).bind(...binds,lesson.revision,target.courseId,row!.version,...guard.binds).run();
  await current(d,guard);
  if(await d.prepare("SELECT 1 FROM attempts WHERE user_id=? AND course_id=? AND lesson_id=? AND state IN ('pending','submitting')").bind(...binds).first())throw new AccessError(409,'Tunggu pemeriksaan kode yang berjalan.');
  return {ok:true};
}
