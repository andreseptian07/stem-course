import type {ClassSummary, ClassSession} from "./client-dto.ts";
import type {AccessContext} from "./authorization.ts";
import {concurrentRead} from "./concurrent-read.ts";
import {loadGraduationContext,assertAcademicRead} from "./graduation-data.ts";
import { requirePermission, authorizationGuard, policySql, studentSql, classReadSnapshot, assertClassRead } from "./authorization.ts";
import { z } from "zod";
import { databaseSql, type PlatformDatabase } from "./database.ts";
import { courseTitleSql, publishedSql, upcomingSessionSql } from "./database-sql.ts";
import type { Course } from "./model";
import { dashboardCourse } from "./account.ts";
export type ClassUser = { id: string; name: string; role: string };
type ClassRow = {id:string;name:string;description:string;course_id:string;course_title:string;course_data:string;mentor_id:string|null;mentor_name:string|null;mentor_grant_version:number;starts_at:string|null;ends_at:string|null;capacity:number;count?:number;status:ClassSummary["status"];version:number;membership?:string|null;isStaff?:number|boolean;published:number};
type MemberRow = {userId:string;name:string;status:string;createdAt:string;progress?:{percent:number;completed:number;total:number;stale:number};lessons?:{id:string;title:string;complete:boolean;quizPassed:boolean;codePassed:boolean;quizAttempts:number;codeAttempts:number}[]};
type ClassData = {user:AccessContext;classes:ClassSummary[];users?:{id:string;name:string}[];mentors?:{id:string;name:string;grantVersion:number}[];courses?:{id:string;title:string;published:number}[]};
type DetailData = {class:ClassSummary;user:AccessContext;posts?:{id:string;name:string;role:string;kind:string;body:string;createdAt:string}[];sessions?:ClassSession[];feedback?:{id:string;studentId:string;studentName:string;mentorName:string;body:string;createdAt:string}[];members?:MemberRow[]};
export class ClassError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
const id = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-zA-Z0-9_-]+$/);
export const classSchema = z
  .object({
    id,
    version: z.number().int().nonnegative(),
    courseId: id,
    mentorId: id.nullable(),
  targetGrantVersion: z.number().int().nonnegative().default(0),
    name: z.string().trim().min(1, "Nama kelas wajib diisi.").max(160),
    description: z.string().trim().max(2000),
    startsAt: z.string().datetime().nullable(),
    endsAt: z.string().datetime().nullable(),
    capacity: z.number().int().min(1).max(500),
    status: z.enum(["open", "active", "archived"]),
  })
  .strict()
  .refine(
    (c) =>
      !c.startsAt || !c.endsAt || Date.parse(c.endsAt) > Date.parse(c.startsAt),
    "Tanggal akhir harus setelah tanggal mulai.",
  );
export const sessionSchema = z
  .object({
    id,
    version: z.number().int().nonnegative(),
    classId: id,
    title: z.string().trim().min(1).max(160),
    kind: z.enum(["online", "offline"]),
    startsAt: z.string().datetime(),
    duration: z.number().int().min(15).max(480),
    location: z.string().trim().max(500),
    url: z.string().max(2000),
  })
  .strict()
  .superRefine((s, c) => {
    if (s.kind === "online") {
      try {
        const u = new URL(s.url);
        if (u.protocol !== "https:" || u.username || u.password) throw 0;
      } catch {
        c.addIssue({
          code: "custom",
          message: "Tautan meeting harus HTTPS tanpa kredensial.",
        });
      }
    }
    if (s.kind === "offline" && !s.location)
      c.addIssue({ code: "custom", message: "Isi lokasi tatap muka." });
  });
export type ClassForm = z.infer<typeof classSchema>;
const now = () => new Date().toISOString();
export async function classAccess(d:PlatformDatabase,u:ClassUser,classId:string,mode:"summary"|"member"|"staff"="member") {
  const context=await requirePermission(d,u,"account");
  if(mode==='staff') await requirePermission(d,u,'tutor');
  if (context.kind==='staff' && !context.owner && !context.capabilities.tutor) throw new ClassError(403,"Fitur kelas tidak tersedia untuk akun ini.");
  const gates=mode==='staff' ? [policySql('tutor','c.id')] : [policySql('tutor','c.id'),policySql('studentClass','c.id'),...(mode==='summary'?[`(${policySql('student')} AND c.status='open' AND ${publishedSql(d,'k.data')})`]:[])];
  const c=await d.prepare(`SELECT c.*,${courseTitleSql(d,'k.data')} AS course_title,${publishedSql(d,'k.data')} AS published,k.data AS course_data,m.name AS mentor_name FROM cohorts c JOIN courses k ON k.id=c.course_id LEFT JOIN users m ON m.id=c.mentor_id WHERE c.id=? AND (${gates.join(' OR ')})`).bind(classId,...gates.map(()=>u.id)).first<ClassRow>();
  if (!c) throw new ClassError(404,"Kelas tidak tersedia untuk akun ini.");
  const staff=!!await d.prepare(`SELECT 1 WHERE ${policySql('tutor','?')}`).bind(u.id,classId).first();
  const member=context.kind==='student' ? await d.prepare('SELECT status,authorization_version FROM cohort_members WHERE class_id=? AND user_id=?').bind(classId,u.id).first<{status:string;authorization_version:number}>() : null;
  const guard=await authorizationGuard(d,u,staff?'tutor':member?.status==='approved'?'studentClass':'student',staff||member?.status==='approved'?classId:undefined);
  guard.sql += ' AND EXISTS(SELECT 1 FROM cohorts WHERE id=? AND version=?)'; guard.binds.push(classId,c.version);
  if (!staff && member?.status==='approved') {guard.sql+=' AND EXISTS(SELECT 1 FROM cohort_members WHERE class_id=? AND user_id=? AND authorization_version=?)';guard.binds.push(classId,u.id,member.authorization_version);}
  c.isStaff=staff;
  return {c,member,staff,context,guard};
}
function summary(c: ClassRow, u: ClassUser):ClassSummary {
  return {
    id: c.id,
    name: c.name,
    description: c.description,
    courseId: c.course_id,
    courseTitle: c.course_title,
    mentorName: c.mentor_name || "Mentor belum ditugaskan",
    startsAt: c.starts_at,
    endsAt: c.ends_at,
    capacity: c.capacity,
    count: c.count ?? 0,
    status: c.status,
    version: c.version,
    membership: c.membership || null,
    isMentor: !!c.isStaff && c.mentor_id === u.id,
    isStaff: !!c.isStaff,
    published: !!c.published,
  };
}
export async function listClasses(d:PlatformDatabase,u:ClassUser) {
  const guard=await authorizationGuard(d,u,'account'),context=guard.context;
  if (context.kind==='staff'&&!context.owner&&!context.capabilities.tutor) throw new ClassError(403,'Fitur kelas tidak tersedia untuk akun ini.');
  const before=await classReadSnapshot(d,u);
  const scope=`${policySql('tutor','c.id')} OR ${policySql('studentClass','c.id')} OR (${policySql('student')} AND c.status='open' AND ${publishedSql(d,'k.data')})`;
  const rows=(await d.prepare(`SELECT c.*,${courseTitleSql(d,'k.data')} AS course_title,${publishedSql(d,'k.data')} AS published,m.name AS mentor_name,cm.status AS membership,${policySql('tutor','c.id')} AS isStaff,(SELECT count(*) FROM cohort_members m JOIN account_principals p ON p.user_id=m.user_id AND p.kind='student' WHERE m.class_id=c.id AND m.status='approved') AS count FROM cohorts c JOIN courses k ON k.id=c.course_id LEFT JOIN users m ON m.id=c.mentor_id LEFT JOIN cohort_members cm ON cm.class_id=c.id AND cm.user_id=? AND ${studentSql('cm.user_id')} WHERE ${scope} ORDER BY c.created_at DESC`).bind(u.id,u.id,u.id,u.id,u.id).all<ClassRow>()).results;
  const data:ClassData={user:context,classes:rows.map(c=>summary(c,context))};
  if(context.owner){
    data.users=(await d.prepare(`SELECT u.id,u.name FROM users u WHERE ${studentSql('u.id')} ORDER BY u.name`).all<{id:string;name:string}>()).results;
    data.mentors=(await d.prepare(`SELECT u.id,u.name,g.version AS grantVersion FROM users u JOIN staff_grants g ON g.user_id=u.id AND g.capability='tutor' AND g.active=1 WHERE ${policySql('account').replace('ap.user_id=?','ap.user_id=u.id')} AND EXISTS(SELECT 1 FROM account_principals p WHERE p.user_id=u.id AND p.kind='staff') ORDER BY u.name`).all<{id:string;name:string;grantVersion:number}>()).results;
    data.courses=(await d.prepare(`SELECT id,${courseTitleSql(d,'data')} AS title,${publishedSql(d,'data')} AS published FROM courses ORDER BY ${databaseSql(d,'rowid','id')}`).all<{id:string;title:string;published:number}>()).results;
  }
  await assertClassRead(d,u,before,rows.filter(c=>c.isStaff||c.membership==='approved').map(c=>c.id));
  if(!await d.prepare(`SELECT 1 WHERE ${guard.sql}`).bind(...guard.binds).first())throw new ClassError(403,'Hak akun berubah. Muat ulang daftar kelas.');
  return data;
}
export async function classDetail(
  d: PlatformDatabase,
  u: ClassUser,
  classId: string,
) {
  const { c, member, staff, context,guard } = await classAccess(d, u, classId, "summary");
  u=context;
  const count = await d
    .prepare(
      "SELECT count(*) AS n FROM cohort_members m JOIN account_principals p ON p.user_id=m.user_id AND p.kind='student' WHERE m.class_id=? AND m.status='approved'",
    )
    .bind(classId)
    .first<{ n: number }>();
  const detail: DetailData = {
    class: {
      ...summary({ ...c, count: count?.n ?? 0, membership: member?.status }, u),
      ...(u.role === "owner" ? { mentorId:c.mentor_id,mentorGrantVersion:c.mentor_grant_version } : {}),
    },
    user: context,
  };
  if (!staff && member?.status !== "approved") {
    if(!await d.prepare(`SELECT 1 WHERE ${guard.sql}`).bind(...guard.binds).first())throw new ClassError(404,"Akses kelas berubah. Muat ulang halaman.");
    return detail;
  }
  detail.posts = (
    await d
      .prepare(
        databaseSql(d,
          "SELECT id,name,role,kind,body,created_at AS createdAt FROM (SELECT rowid AS sequence,* FROM cohort_posts WHERE class_id=? ORDER BY created_at DESC,rowid DESC LIMIT 100) ORDER BY created_at,sequence",
          "SELECT id,name,role,kind,body,created_at AS createdAt FROM (SELECT * FROM cohort_posts WHERE class_id=? ORDER BY created_at DESC,id DESC LIMIT 100) AS recent ORDER BY created_at,id"),
      )
      .bind(classId)
      .all<NonNullable<DetailData["posts"]>[number]>()
  ).results;
  detail.sessions = (
    await d
      .prepare(
        "SELECT id,title,kind,starts_at AS startsAt,duration,location,url,version FROM cohort_sessions WHERE class_id=? ORDER BY starts_at",
      )
      .bind(classId)
      .all<ClassSession>()
  ).results;
  detail.feedback = (
    await d
      .prepare(
        `SELECT f.id,f.student_id AS studentId,u.name AS studentName,f.mentor_name AS mentorName,f.body,f.created_at AS createdAt FROM cohort_feedback f JOIN users u ON u.id=f.student_id WHERE f.class_id=? AND (?=1 OR f.student_id=?) ORDER BY f.created_at DESC LIMIT 100`,
      )
      .bind(classId, staff ? 1 : 0, u.id)
      .all<NonNullable<DetailData["feedback"]>[number]>()
  ).results;
  if (staff) {
    const rows = (
      await d
        .prepare(
          "SELECT m.user_id AS userId,u.name,m.status,m.created_at AS createdAt FROM cohort_members m JOIN users u ON u.id=m.user_id WHERE m.class_id=? AND EXISTS(SELECT 1 FROM account_principals p WHERE p.user_id=m.user_id AND p.kind='student') ORDER BY m.created_at DESC",
        )
        .bind(classId)
        .all<MemberRow>()
    ).results;
    const course = JSON.parse(c.course_data) as Course;
    detail.members = await concurrentRead(rows,async (m) => {
      if (m.status !== "approved") return m;
      const ctx=await loadGraduationContext(d,{id:m.userId},c.course_id,classId,u);
      const p=ctx.progress,progress=dashboardCourse(ctx.course,p,null,ctx.state);
      await assertAcademicRead(d,ctx);
      return {
        ...m,
        progress: {
          percent: progress.percent,
          completed: progress.completed,
          total: course.lessons.length,
          stale: progress.stale,
        },
        lessons: course.lessons.map((l) => {
          const state = p.find(
            (p) => p.lessonId === l.id && p.revision === l.revision,
          );
          return {
            id: l.id,
            title: l.title,
            complete: !!state?.complete,
            quizPassed: !!state?.quizPassed,
            codePassed: !!state?.codePassed,
            quizAttempts: state?.quizAttempts || 0,
            codeAttempts: state?.codeAttempts || 0,
          };
        }),
      };
    });
  }
  if(!await d.prepare(`SELECT 1 WHERE ${guard.sql}`).bind(...guard.binds).first())throw new ClassError(404,"Akses kelas berubah. Muat ulang halaman.");
  return detail;
}
export async function saveClass(d:PlatformDatabase,u:ClassUser,form:unknown){
  const guard=await authorizationGuard(d,u,'owner'), c=classSchema.parse(form),proof=crypto.randomUUID(),time=now();
  if(!await d.prepare('SELECT 1 FROM courses WHERE id=?').bind(c.courseId).first())throw new ClassError(404,'Course tidak ditemukan.');
  const old=await d.prepare('SELECT course_id,mentor_id,mentor_grant_version,version FROM cohorts WHERE id=?').bind(c.id).first<{course_id:string;mentor_id:string|null;mentor_grant_version:number;version:number}>();
  if((old?.version||0)!==c.version)throw new ClassError(409,'Kelas berubah. Muat ulang sebelum menyimpan.');
  if(old&&old.course_id!==c.courseId)throw new ClassError(400,'Course kelas tidak dapat diganti.');
  let mentorVersion=0;
  if(c.mentorId){
    const target=await requirePermission(d,{id:c.mentorId},'tutor');
    if(target.owner||target.kind!=='staff'||!target.capabilities.tutor)throw new ClassError(400,'Pilih staf yang mempunyai hak Tutor.');
    mentorVersion=c.targetGrantVersion || (old?.mentor_id===c.mentorId?old.mentor_grant_version:0);
    if(!mentorVersion||mentorVersion!==target.grantVersions.tutor)throw new ClassError(409,'Penugasan Tutor perlu dipilih kembali dengan hak terbaru.');
  }
  const targetGuard=c.mentorId?`${policySql('tutor')} AND EXISTS(SELECT 1 FROM staff_grants WHERE user_id=? AND capability='tutor' AND active=1 AND version=?)`:'1=1';
  const tb=c.mentorId?[c.mentorId,c.mentorId,mentorVersion]:[];
  const capacity="(SELECT count(*) FROM cohort_members m JOIN account_principals p ON p.user_id=m.user_id AND p.kind='student' WHERE m.class_id=? AND m.status='approved')<=?";
  const write=old ? d.prepare(`UPDATE cohorts SET assignment_proof=?,mentor_id=?,mentor_grant_version=?,name=?,description=?,starts_at=?,ends_at=?,capacity=?,status=?,version=version+1 WHERE id=? AND version=? AND ${capacity} AND ${guard.sql} AND ${targetGuard}`).bind(proof,c.mentorId,mentorVersion,c.name,c.description,c.startsAt,c.endsAt,c.capacity,c.status,c.id,c.version,c.id,c.capacity,...guard.binds,...tb)
    :d.prepare(`INSERT INTO cohorts(id,course_id,mentor_id,mentor_grant_version,name,description,starts_at,ends_at,capacity,status,version,created_at,assignment_proof) SELECT ?,?,?,?,?,?,?,?,?,?,1,?,? WHERE ${guard.sql} AND ${targetGuard}`).bind(c.id,c.courseId,c.mentorId,mentorVersion,c.name,c.description,c.startsAt,c.endsAt,c.capacity,c.status,time,proof,...guard.binds,...tb);
  const [r]=await d.batch([write,d.prepare("INSERT INTO authorization_events(id,actor_id,target_id,kind,capability,scope_id,reason,data,created_at) SELECT ?,?,?,'classAssignment','tutor',?,'Pengaturan kelas',?,? WHERE EXISTS(SELECT 1 FROM cohorts WHERE id=? AND assignment_proof=?)").bind(proof,u.id,c.mentorId||u.id,c.id,JSON.stringify({before:old?{mentorId:old.mentor_id,grantVersion:old.mentor_grant_version}:null,after:{mentorId:c.mentorId,grantVersion:mentorVersion,version:c.version+1}}),time,c.id,proof)]);
  if(!r.meta.changes)throw new ClassError(409,'Kelas, penugasan atau kapasitas berubah. Muat ulang.');
  return {id:c.id};
}
export async function requestJoin(
  d: PlatformDatabase,
  u: ClassUser,
  classId: string,
) {
  const guard=await authorizationGuard(d,u,"student");
  const { c, guard: classGuard } = await classAccess(d, u, classId, "summary");
  guard.sql += ` AND ${classGuard.sql}`; guard.binds.push(...classGuard.binds);
  if (c.status !== "open" || !c.published)
    throw new ClassError(409, "Pendaftaran kelas belum dibuka.");
  // Rejected or removed memberships cannot be re-created by the applicant.
  const prior = await d
    .prepare("SELECT status FROM cohort_members WHERE class_id=? AND user_id=?")
    .bind(classId, u.id)
    .first();
  if (prior) {
    if (!await d.prepare(`SELECT 1 WHERE ${guard.sql}`).bind(...guard.binds).first())
      throw new ClassError(409, "Hak akun atau kelas berubah. Muat ulang.");
    return { ok: true };
  }
  const joined = await d
    .prepare(
      `${databaseSql(d, "INSERT OR IGNORE", "INSERT")} INTO cohort_members(class_id,user_id,status,created_at) SELECT ?,?,'pending',? WHERE EXISTS(SELECT 1 FROM cohorts c JOIN courses k ON k.id=c.course_id WHERE c.id=? AND c.status='open' AND ${publishedSql(d, "k.data")} AND (SELECT count(*) FROM cohort_members cm JOIN account_principals cp ON cp.user_id=cm.user_id AND cp.kind='student' WHERE cm.class_id=c.id AND cm.status='approved')<c.capacity) AND ${guard.sql} ${databaseSql(d, "", "ON DUPLICATE KEY UPDATE user_id=user_id")}`,
    )
    .bind(classId, u.id, now(), classId,...guard.binds)
    .run();
  if (!await d.prepare(`SELECT 1 WHERE ${guard.sql}`).bind(...guard.binds).first())
    throw new ClassError(409, "Hak akun atau kelas berubah. Muat ulang.");
  if (!joined.meta.changes && !(await d.prepare(`SELECT status FROM cohort_members WHERE class_id=? AND user_id=? AND ${guard.sql}`).bind(classId, u.id,...guard.binds).first()))
    throw new ClassError(409, "Kelas penuh atau pendaftaran sudah ditutup.");
  return { ok: true };
}
export async function setMembership(d:PlatformDatabase,u:ClassUser,classId:string,userId:string,status:'approved'|'declined'|'removed'){
  const guard=await authorizationGuard(d,u,'owner'),{c}=await classAccess(d,u,classId,'staff');
  guard.sql+=' AND EXISTS(SELECT 1 FROM cohorts WHERE id=? AND version=?)';guard.binds.push(classId,c.version);
  if(c.status==='archived')throw new ClassError(409,'Kelas diarsipkan. Aktifkan kembali sebelum mengubah peserta.');
  if(status==='approved'){
    const targetGuard=await authorizationGuard(d,{id:userId},'student');
    guard.sql+=` AND ${targetGuard.sql}`;guard.binds.push(...targetGuard.binds);
    await d.batch([
      d.prepare(`INSERT INTO cohort_members(class_id,user_id,status,created_at,authorization_version) SELECT ?,?,'approved',?,1 WHERE ${guard.sql} AND ${policySql('student')} AND EXISTS(SELECT 1 FROM cohorts WHERE id=? AND status!='archived' AND ((SELECT count(*) FROM cohort_members m JOIN account_principals p ON p.user_id=m.user_id AND p.kind='student' WHERE m.class_id=? AND m.status='approved')<capacity OR EXISTS(SELECT 1 FROM cohort_members WHERE class_id=? AND user_id=? AND status='approved'))) ${databaseSql(d,"ON CONFLICT(class_id,user_id) DO UPDATE SET authorization_version=CASE WHEN status='approved' THEN authorization_version ELSE authorization_version+1 END,status='approved'","ON DUPLICATE KEY UPDATE authorization_version=IF(status='approved',authorization_version,authorization_version+1),status='approved'")}`).bind(classId,userId,now(),...guard.binds,userId,classId,classId,classId,userId),
      d.prepare(`${databaseSql(d,'INSERT OR IGNORE','INSERT')} INTO enrollments(user_id,course_id,created_at,authorization_id) SELECT ?,?,?,? WHERE ${guard.sql} AND ${policySql('student')} AND EXISTS(SELECT 1 FROM cohort_members m JOIN cohorts c ON c.id=m.class_id WHERE m.class_id=? AND m.user_id=? AND m.status='approved' AND c.status!='archived') ${databaseSql(d,'','ON DUPLICATE KEY UPDATE user_id=user_id')}`).bind(userId,c.course_id,now(),crypto.randomUUID(),...guard.binds,userId,classId,userId),
    ]);
    if(!await d.prepare(`SELECT 1 FROM cohort_members m JOIN cohorts c ON c.id=m.class_id WHERE m.class_id=? AND m.user_id=? AND m.status='approved' AND c.status!='archived' AND ${guard.sql} AND ${policySql('student')}`).bind(classId,userId,...guard.binds,userId).first())throw new ClassError(409,'Kelas penuh atau hak akun berubah.');
  }else{
    const r=await d.prepare(`UPDATE cohort_members SET authorization_version=CASE WHEN status=? THEN authorization_version ELSE authorization_version+1 END,status=? WHERE class_id=? AND user_id=? AND EXISTS(SELECT 1 FROM cohorts WHERE id=? AND status!='archived') AND ${guard.sql}`).bind(status,status,classId,userId,classId,...guard.binds).run();
    if(!r.meta.changes&&!await d.prepare(`SELECT 1 FROM cohort_members WHERE class_id=? AND user_id=? AND status=? AND ${guard.sql}`).bind(classId,userId,status,...guard.binds).first())throw new ClassError(404,'Keanggotaan tidak ditemukan.');
  }
  return {ok:true};
}
export async function addPost(
  d: PlatformDatabase,
  u: ClassUser,
  classId: string,
  kind: "discussion" | "announcement",
  body: string,
) {
  const { c, staff, guard } = await classAccess(d, u, classId, "member");
  if (c.status === "archived")
    throw new ClassError(409, "Kelas diarsipkan dan hanya dapat dibaca.");
  if (kind === "announcement" && !staff)
    throw new ClassError(
      403,
      "Pengumuman hanya dapat dibuat mentor atau pengelola.",
    );
  const id = crypto.randomUUID();
  const cutoff = new Date(Date.now() - 60000).toISOString();
  const r = await d
    .prepare(
      `INSERT INTO cohort_posts(id,class_id,user_id,name,role,kind,body,created_at) SELECT ?,?,?,?,?,?,?,? WHERE (SELECT count(*) FROM cohort_posts WHERE user_id=? AND created_at>?)<10 AND EXISTS(SELECT 1 FROM cohorts c WHERE c.id=? AND c.status!='archived' AND (?='owner' OR c.mentor_id=? OR (?='discussion' AND EXISTS(SELECT 1 FROM cohort_members WHERE class_id=c.id AND user_id=? AND status='approved')))) AND ${guard.sql}`,
    )
    .bind(
      id,
      classId,
      u.id,
      u.name,
      staff ? (u.role === "owner" ? "owner" : "mentor") : "student",
      kind,
      body,
      now(),
      u.id,
      cutoff,
      classId,
      u.role,
      u.id,
      kind,
      u.id,
      ...guard.binds,
    )
    .run();
  if(!r.meta.changes){if(!await d.prepare(`SELECT 1 WHERE ${guard.sql}`).bind(...guard.binds).first())throw new ClassError(409,"Hak kelas berubah sebelum pesan disimpan.");throw new ClassError(429,"Tunggu sebentar sebelum mengirim pesan lagi.");}
  return { id };
}
export async function addFeedback(
  d: PlatformDatabase,
  u: ClassUser,
  classId: string,
  studentId: string,
  body: string,
) {
  const { c,guard } = await classAccess(d, u, classId, "staff");
  if (c.status === "archived") throw new ClassError(409, "Kelas diarsipkan.");
  const target = await d.prepare(`SELECT 1 WHERE ${policySql('studentClass','?')}`).bind(studentId,classId).first();
  if (!target)
    throw new ClassError(
      403,
      "Feedback hanya untuk peserta aktif di kelas ini.",
    );
  const targetGuard=await authorizationGuard(d,{id:studentId},'studentClass',classId);
  const id = crypto.randomUUID();
  const inserted = await d
    .prepare(
      `INSERT INTO cohort_feedback(id,class_id,student_id,mentor_id,mentor_name,body,created_at) SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM cohorts WHERE id=? AND status!='archived' AND (?='owner' OR mentor_id=?)) AND EXISTS(SELECT 1 FROM cohort_members WHERE class_id=? AND user_id=? AND status='approved') AND ${guard.sql} AND ${targetGuard.sql}`,
    )
    .bind(
      id,
      classId,
      studentId,
      u.id,
      u.name,
      body,
      now(),
      classId,
      u.role,
      u.id,
      classId,
      studentId,
      ...guard.binds,
      ...targetGuard.binds,
    )
    .run();
  if (!inserted.meta.changes)
    throw new ClassError(
      409,
      "Keanggotaan atau penugasan mentor berubah. Muat ulang.",
    );
  return { id };
}
export async function saveClassSession(
  d: PlatformDatabase,
  u: ClassUser,
  form: unknown,
) {
  const s = sessionSchema.parse(form),
    { c,guard } = await classAccess(d, u, s.classId, "staff");
  if (c.status === "archived") throw new ClassError(409, "Kelas diarsipkan.");
  if (Date.parse(s.startsAt) <= Date.now())
    throw new ClassError(400, "Pilih jadwal yang akan datang.");
  const old = await d
    .prepare("SELECT class_id,version FROM cohort_sessions WHERE id=?")
    .bind(s.id)
    .first<{class_id:string;version:number}>();
  if (old) {
    if (old.class_id !== s.classId)
      throw new ClassError(403, "Sesi tidak berasal dari kelas ini.");
    const r = await d
      .prepare(
        `UPDATE cohort_sessions SET title=?,kind=?,starts_at=?,duration=?,location=?,url=?,version=version+1 WHERE id=? AND class_id=? AND version=? AND EXISTS(SELECT 1 FROM cohorts WHERE id=? AND status!='archived' AND (?='owner' OR mentor_id=?)) AND ${guard.sql}`,
      )
      .bind(
        s.title,
        s.kind,
        s.startsAt,
        s.duration,
        s.location,
        s.kind === "online" ? s.url : "",
        s.id,
        s.classId,
        s.version,
        s.classId,
        u.role,
        u.id,
        ...guard.binds,
      )
      .run();
    if (!r.meta.changes)
      throw new ClassError(
        409,
        "Jadwal berubah. Muat ulang sebelum menyimpan.",
      );
  } else {
    if (s.version !== 0) throw new ClassError(409, "Sesi tidak ditemukan.");
    const inserted = await d
      .prepare(
        `INSERT INTO cohort_sessions(id,class_id,title,kind,starts_at,duration,location,url,version) SELECT ?,?,?,?,?,?,?,?,1 WHERE EXISTS(SELECT 1 FROM cohorts WHERE id=? AND status!='archived' AND (?='owner' OR mentor_id=?)) AND ${guard.sql}`,
      )
      .bind(
        s.id,
        s.classId,
        s.title,
        s.kind,
        s.startsAt,
        s.duration,
        s.location,
        s.kind === "online" ? s.url : "",
        s.classId,
        u.role,
        u.id,
        ...guard.binds,
      )
      .run();
    if (!inserted.meta.changes)
      throw new ClassError(
        409,
        "Penugasan mentor berubah atau kelas diarsipkan.",
      );
  }
  return { id: s.id };
}
export async function resetClassAttempts(
  d: PlatformDatabase,
  u: ClassUser,
  classId: string,
  studentId: string,
  lessonId: string,
) {
  const { c,guard } = await classAccess(d, u, classId, "staff");
  if (c.status === "archived") throw new ClassError(409, "Kelas diarsipkan.");
  const target = await d.prepare(`SELECT 1 WHERE ${policySql('studentClass','?')}`).bind(studentId,classId).first();
  if (!target)
    throw new ClassError(403, "Peserta tidak aktif di kelas ini.");
  const lesson = (JSON.parse(c.course_data) as Course).lessons.find(
    (l) => l.id === lessonId,
  );
  if (!lesson) throw new ClassError(404, "Materi tidak ditemukan.");
  const targetGuard=await authorizationGuard(d,{id:studentId},'studentClass',classId);
  const eligible = `user_id=? AND course_id=? AND lesson_id=? AND revision=? AND NOT EXISTS(SELECT 1 FROM attempts WHERE user_id=? AND course_id=? AND lesson_id=? AND kind='code' AND state IN ('pending','submitting')) AND EXISTS(SELECT 1 FROM cohorts WHERE id=? AND status!='archived' AND (?='owner' OR mentor_id=?)) AND EXISTS(SELECT 1 FROM cohort_members WHERE class_id=? AND user_id=? AND status='approved') AND ${guard.sql} AND ${targetGuard.sql}`;
  const values = [
      studentId,
      c.course_id,
      lessonId,
      lesson.revision,
      studentId,
      c.course_id,
      lessonId,
      classId,
      u.role,
      u.id,
      classId,
      studentId,
      ...guard.binds,
      ...targetGuard.binds,
    ];
  const r = await d.prepare(`UPDATE learning_progress_revisions SET quiz_attempts=0,code_attempts=0,version=version+1 WHERE ${eligible}`).bind(...values).run();
  if (!r.meta.changes && !(await d.prepare(`SELECT 1 FROM learning_progress_revisions WHERE ${eligible}`).bind(...values).first()))
    throw new ClassError(
      409,
      "Belum ada progres revisi saat ini atau pemeriksaan kode masih berjalan.",
    );
  return { ok: true };
}
export const mutationSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("saveClass"), class: classSchema }).strict(),
  z.object({ action: z.literal("requestJoin"), classId: id }).strict(),
  z
    .object({
      action: z.literal("membership"),
      classId: id,
      userId: id,
      status: z.enum(["approved", "declined", "removed"]),
    })
    .strict(),
  z
    .object({
      action: z.literal("post"),
      classId: id,
      kind: z.enum(["discussion", "announcement"]),
      body: z.string().trim().min(1).max(4000),
    })
    .strict(),
  z
    .object({
      action: z.literal("feedback"),
      classId: id,
      studentId: id,
      body: z.string().trim().min(1).max(4000),
    })
    .strict(),
  z
    .object({ action: z.literal("saveSession"), session: sessionSchema })
    .strict(),
  z
    .object({
      action: z.literal("resetAttempts"),
      classId: id,
      studentId: id,
      lessonId: id,
    })
    .strict(),
]);

export async function classAgenda(d: PlatformDatabase, u: ClassUser) {
  const guard=await authorizationGuard(d,u,'account'),before=await classReadSnapshot(d,u);
  const rows=(
    await d
      .prepare(
        `SELECT ${databaseSql(d, "'class-session:' || s.id", "CONCAT('class-session:',s.id)")} AS id,c.course_id AS courseId,${courseTitleSql(d, "k.data")} AS courseTitle,c.id AS classId,c.name AS className,s.title,s.kind,s.starts_at AS startsAt,s.duration,s.location,s.url FROM cohort_sessions s JOIN cohorts c ON c.id=s.class_id JOIN courses k ON k.id=c.course_id WHERE c.status!='archived' AND (${policySql('tutor','c.id')} OR ${policySql('studentClass','c.id')}) AND ${upcomingSessionSql(d)} ORDER BY s.starts_at`,
      )
      .bind(u.id, u.id, new Date().toISOString())
      .all()
  ).results;
  await assertClassRead(d,u,before,rows.map(r=>String(r.classId)));
  if(!await d.prepare(`SELECT 1 WHERE ${guard.sql}`).bind(...guard.binds).first())throw new ClassError(403,'Hak akun berubah. Muat ulang agenda.');
  return rows;
}
