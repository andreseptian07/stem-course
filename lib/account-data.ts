import {loadGraduationContext,assertAcademicRead} from "./graduation-data.ts";
import {concurrentRead} from "./concurrent-read.ts";
import {authorizationGuard} from "./authorization.ts";
import { curriculumEnabled } from "./curriculum-access.ts";
import { photoInfo } from "./media-data.ts";
import { databaseSql, type PlatformDatabase } from "./database.ts";
import { publishedSql } from "./database-sql.ts";
import { AccessError as AppError } from "./access.ts";
import { emptyProfile, profileSchema, dashboardCourse } from "./account.ts";
import { readCourse } from "./course-data.ts";
import { enrolledSessions } from "./session-data.ts";
import { classAgenda, type ClassUser } from "./classes.ts";
import { dashboardProjects } from "./projects.ts";
import { tutorDashboard } from "./tutor-dashboard.ts";
import {learningReadSnapshot,assertLearningRead} from './learning-access.ts';
import type { Course } from "./model";

export async function accountData(d: PlatformDatabase, u: ClassUser) {
  const guard=await authorizationGuard(d,u,"account"),context=guard.context;
  u=context;
  const learner=context.kind==="student"&&!context.owner;
  const learningBefore=learner?await learningReadSnapshot(d,u):new Map<string,string>();
  const p = await d.prepare("SELECT data,version FROM profiles WHERE user_id=?")
    .bind(u.id).first<{ data: string; version: number }>();
  const rows = learner ? (await d.prepare(`SELECT c.data,c.version,e.created_at AS enrolledAt FROM courses c LEFT JOIN enrollments e ON e.course_id=c.id AND e.user_id=? WHERE (${publishedSql(d, "c.data")} OR ?='owner') AND e.user_id IS NOT NULL ORDER BY e.created_at DESC,${databaseSql(d, "c.rowid", "c.id")}`)
    .bind(u.id, u.role).all<{ data: string; version: number; enrolledAt: string | null }>()).results : [];
  const academicContexts:Awaited<ReturnType<typeof loadGraduationContext>>[]=[];
  const courses = await concurrentRead(rows,async (r) => {
    const c = { ...JSON.parse(r.data), version: r.version } as Course;
    const ctx=await loadGraduationContext(d,u,c.id);
    academicContexts.push(ctx);
    const perClass=ctx.state.problem?.code==="CLASS_CONTEXT_REQUIRED"&&ctx.state.classes.length>1
      ?await concurrentRead(ctx.state.classes,async choice=>{const scoped=await loadGraduationContext(d,u,c.id,choice.id);academicContexts.push(scoped);return scoped.state;},2):[];
    const result=dashboardCourse(c,ctx.progress,r.enrolledAt,ctx.state,perClass);await assertAcademicRead(d,ctx);return result;
  });
  const sessions = [...(learner?await enrolledSessions(d,u):[]), ...await classAgenda(d,u)]
    .sort((a, b) => String(a.startsAt).localeCompare(String(b.startsAt)));
  const result={
    photo: await photoInfo(d, u.id),
    profile: p ? { ...JSON.parse(p.data), version: p.version } : emptyProfile(u.name),
    courses,
    sessions,
    projects: learner?await dashboardProjects(d,u):[],
    teaching: await tutorDashboard(d, u),
    curriculum: await curriculumEnabled(d,u),
  };
  if(learner)await assertLearningRead(d,u,learningBefore,courses.map(c=>c.id));
  await concurrentRead(academicContexts,ctx=>assertAcademicRead(d,ctx));
  if(!await d.prepare(`SELECT 1 WHERE ${guard.sql}`).bind(...guard.binds).first())throw new AppError(403,"Hak akun berubah. Muat ulang dashboard.");
  return result;
}
export async function enrollCourse(d: PlatformDatabase, u: ClassUser, id: string) {
  const guard=await authorizationGuard(d,u,"student");
  const c = await readCourse(d, id, u);
  if (!c.published) throw new AppError(400, "Course belum diterbitkan.");
  const result = await d.prepare(`${databaseSql(d, "INSERT OR IGNORE", "INSERT")} INTO enrollments(user_id,course_id,created_at,authorization_id) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM courses c WHERE c.id=? AND ${publishedSql(d, "c.data")}) AND ${guard.sql} ${databaseSql(d, "", "ON DUPLICATE KEY UPDATE user_id=user_id")}`)
    .bind(u.id,id,new Date().toISOString(),crypto.randomUUID(),id,...guard.binds).run();
  if (!result.meta.changes && !(await d.prepare(`SELECT 1 FROM enrollments WHERE user_id=? AND course_id=? AND ${guard.sql}`).bind(u.id,id,...guard.binds).first()))
    throw new AppError(409, "Course belum diterbitkan.");
  return { courseId: id };
}
export async function saveProfile(d: PlatformDatabase, userId: string, raw: unknown) {
  const guard=await authorizationGuard(d,{id:userId},"account");
  const p = profileSchema.parse(raw);
  const old = await d.prepare("SELECT version FROM profiles WHERE user_id=?")
    .bind(userId).first<{ version: number }>();
  if ((old?.version || 0) !== p.version) throw new AppError(409, "Profil sudah berubah. Muat ulang profil sebelum menyimpan.");
  const next = { ...p, version: p.version + 1 };
  const result = old
    ? await d.prepare(`UPDATE profiles SET data=?,version=?,updated_at=? WHERE user_id=? AND version=? AND ${guard.sql}`)
      .bind(JSON.stringify(next), next.version, new Date().toISOString(), userId,p.version,...guard.binds).run()
    : await d.prepare(databaseSql(d,
      `INSERT OR IGNORE INTO profiles(user_id,data,version,updated_at) SELECT ?,?,?,? WHERE ${guard.sql}`,
      `INSERT INTO profiles(user_id,data,version,updated_at) SELECT ?,?,?,? WHERE ${guard.sql} ON DUPLICATE KEY UPDATE user_id=user_id`))
      .bind(userId,JSON.stringify(next),next.version,new Date().toISOString(),...guard.binds).run();
  if (!result.meta.changes) throw new AppError(409, "Profil berubah saat disimpan. Muat ulang dan coba lagi.");
  return { profile: next };
}
