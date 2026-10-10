import {courseReviewThreshold} from "./grading-policy.ts";
import {databaseSql} from "./database.ts";
import {loadGraduationContext,academicProofPredicate,requireAcademicLesson,assertAcademicRead} from "./graduation-data.ts";
import {academicReceipt,readAcademicReceipt} from "./academic-receipts.ts";
import type {Course} from "./model.ts";
import {requirePermission,authorizationGuard,policySql,classReadSnapshot,assertClassRead} from "./authorization.ts";
import { AccessError } from "./access-error.ts";
import { z } from "zod";
import { fileStorage, projectFileList } from "./project-files.ts";
import type { PlatformDatabase } from "./database.ts";
import { courseTitleSql } from "./database-sql.ts";
import { classAccess, ClassError, type ClassUser } from "./classes.ts";
const id = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-zA-Z0-9_-]+$/);
const url = z
  .string()
  .trim()
  .max(2000)
  .refine((s) => {
    if (!s) return true;
    try {
      const u = new URL(s);
      return u.protocol === "https:" && !u.username && !u.password;
    } catch {
      return false;
    }
  }, "Tautan proyek harus HTTPS tanpa kredensial.");
export const assignmentSchema = z
  .object({
    id,
    classId: id,
    version: z.number().int().nonnegative(),
    title: z.string().trim().min(1).max(160),
    rubric: z.string().trim().max(8000).default(""),
    requirementId: id.nullable().optional(),
    change: z.object({kind:z.enum(["editorial","substantial"]),reason:z.string().trim().min(1).max(2000)}).strict().optional(),
    instructions: z.string().trim().min(1).max(8000),
    dueAt: z.string().datetime().nullable(),
    status: z.enum(["draft", "published", "closed"]),
  })
  .strict();
export const projectMutation = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("saveAssignment"),
      assignment: assignmentSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal("submit"),
      id,
      assignmentId: id,
      assignmentVersion: z.number().int().positive(),
      previousId: id.nullable(),
      previousVersion: z.number().int().nonnegative(),
      body: z
        .string()
        .trim()
        .min(1, "Jelaskan hasil pekerjaan Anda.")
        .max(10000),
      url,
      attachmentIds: z.array(id).max(3).refine((ids) => new Set(ids).size === ids.length, "Lampiran tidak boleh berulang.").default([]),
    })
    .strict(),
  z
    .object({
      action: z.literal("review"),
      submissionId: id,
      requestId: z.string().uuid().optional(),
      version: z.number().int().positive(),
      status: z.enum(["accepted", "changes_requested"]),
      feedback: z
        .string()
        .trim()
        .min(1, "Tuliskan feedback untuk peserta.")
        .max(8000),
      score: z.number().int().min(0).max(100).nullable(),
    })
    .strict(),
]);
const activeStaff = `${policySql('tutor','a.class_id')} AND EXISTS(SELECT 1 FROM cohorts c WHERE c.id=a.class_id AND c.status!='archived')`;
const activeMember = `${policySql('studentClass','a.class_id')} AND EXISTS(SELECT 1 FROM cohorts c WHERE c.id=a.class_id AND c.status!='archived')`;
type AssignmentRow = {id:string;class_id:string;title:string;instructions:string;rubric:string;assessment_revision:number;content_revision:number;due_at:string|null;status:"draft"|"published"|"closed";version:number};
type BindingRow = Awaited<ReturnType<typeof loadGraduationContext>>["bindings"][number];
type ProjectTask = {id:string;classId:string;title:string;instructions:string;rubric:string;assessmentRevision:number;contentRevision:number;requirementId:string|null;lessonId:string|null;dueAt:string|null;status:"draft"|"published"|"closed";version:number;lessonRevision?:number;locked?:boolean;blocker?:string|null;canSubmit?:boolean};
type ProjectSubmission = {id:string;assignmentId:string;studentId:string;studentName:string;attempt:number;assignmentVersion:number;assessmentRevision:number;lessonRevision:number;requirementRevision:number;instructions:string;snapshot?:string;rubric?:string;reviewPassThreshold?:number;body:string;url:string;submittedAt:string;late:number;status:string;feedback:string;score:number|null;reviewerName:string|null;reviewedAt:string|null;version:number};
export async function projectList(
  d: PlatformDatabase,
  u: ClassUser,
  classId: string,
) {
  const {staff,guard,c}=await classAccess(d,u,classId,"member");
  const tasks = (
    await d
      .prepare(
        `SELECT a.id,a.class_id AS classId,a.title,a.instructions,a.rubric,a.assessment_revision AS assessmentRevision,a.content_revision AS contentRevision,b.requirement_id AS requirementId,b.lesson_id AS lessonId,a.due_at AS dueAt,a.status,a.version FROM class_assignments a LEFT JOIN class_assignment_requirements b ON b.assignment_id=a.id WHERE a.class_id=? AND (?=1 OR a.status!='draft') ORDER BY a.created_at DESC`,
      )
      .bind(classId, staff ? 1 : 0)
      .all<ProjectTask>()
  ).results;
  const submissions = (
    await d
      .prepare(
        `SELECT s.id,s.assignment_id AS assignmentId,s.student_id AS studentId,n.name AS studentName,s.attempt,s.assignment_version AS assignmentVersion,s.assessment_revision AS assessmentRevision,s.lesson_revision AS lessonRevision,s.requirement_revision AS requirementRevision,s.instructions,s.snapshot,s.body,s.url,s.submitted_at AS submittedAt,s.late,s.status,s.feedback,s.score,s.reviewer_name AS reviewerName,s.reviewed_at AS reviewedAt,s.version FROM project_submissions s JOIN class_assignments a ON a.id=s.assignment_id JOIN users n ON n.id=s.student_id WHERE a.class_id=? AND (?=1 OR (s.student_id=? AND a.status!='draft')) ORDER BY s.submitted_at DESC,s.attempt DESC`,
      )
      .bind(classId, staff ? 1 : 0, u.id)
      .all<ProjectSubmission>()
  ).results;
  const reviewHistory=(await d.prepare(`SELECT r.id,r.submission_id AS submissionId,r.sequence,r.status,r.score,r.feedback,r.reviewer_name AS reviewerName,r.created_at AS reviewedAt FROM project_reviews r JOIN project_submissions s ON s.id=r.submission_id JOIN class_assignments a ON a.id=s.assignment_id WHERE a.class_id=? AND (?=1 OR s.student_id=?) ORDER BY r.submission_id,r.sequence`).bind(classId,staff?1:0,u.id).all<{id:string;submissionId:string;sequence:number;status:string;score:number|null;feedback:string;reviewerName:string;reviewedAt:string}>()).results;
  for(const s of submissions){const snapshot=JSON.parse(s.snapshot||"{}");s.rubric=snapshot.rubric||"";if(snapshot.requirementId)s.reviewPassThreshold=snapshot.reviewPassThreshold??80;delete s.snapshot;}
  const academic=!staff?await loadGraduationContext(d,u,c.course_id,classId):null;
  for(const task of tasks){
    const lesson=academic?.course.lessons.find(l=>l.id===task.lessonId);
    task.lessonRevision=lesson?.revision||0;
    task.locked=!!academic&&(!!academic.state.problem||(!!task.lessonId&&!academic.state.lessons.find(l=>l.lessonId===task.lessonId)?.unlocked));
    task.blocker=task.locked?(academic?.state.problem?.message||"Selesaikan seluruh syarat materi sebelumnya pada kelas ini."):null;
    if(task.locked){task.instructions="";task.rubric="";}
    const latest=submissions.filter(s=>s.assignmentId===task.id&&s.studentId===u.id).sort((a,b)=>b.attempt-a.attempt)[0];
    task.canSubmit=!task.locked&&task.status==="published"&&c.status!=="archived"&&(!latest||latest.status==="changes_requested"||latest.assessmentRevision!==task.assessmentRevision||latest.lessonRevision!==task.lessonRevision);
  }
  let uploadsAvailable = true;
  try { fileStorage(); } catch(e) { if (!(e instanceof ClassError) || e.status !== 503) throw e; uploadsAvailable = false; }
  const files=uploadsAvailable?await projectFileList(d,u,classId,staff):[];
  if(!await d.prepare(`SELECT 1 WHERE ${guard.sql}`).bind(...guard.binds).first())throw new ClassError(404,"Akses kelas berubah. Muat ulang halaman.");
  if(academic)await assertAcademicRead(d,academic);
  const raw=staff?await d.prepare("SELECT data,version FROM courses WHERE id=?").bind(c.course_id).first<{data:string;version:number}>():null;
  const requirements=raw?(JSON.parse(raw.data) as Course).lessons.flatMap(l=>(l.reviewRequirements||[]).map(r=>({...r,lessonId:l.id,lessonTitle:l.title}))):[];
    if(!await d.prepare(`SELECT 1 WHERE ${guard.sql}`).bind(...guard.binds).first()||(raw&&!await d.prepare("SELECT 1 FROM courses WHERE id=? AND version=?").bind(c.course_id,raw.version).first()))throw new ClassError(409,"Hak akses atau course berubah. Muat ulang.");
  return {reviewPassThreshold:academic?courseReviewThreshold(academic.course):raw?courseReviewThreshold(JSON.parse(raw.data) as Course):null,tasks,submissions,reviewHistory,staff,owner:guard.context.owner,uploadsAvailable,files,requirements,graduation:academic?.state};
}
export async function assignmentAcademicContext(d:PlatformDatabase,u:{id:string},assignmentId:string){
  const a=await d.prepare("SELECT a.*,c.course_id FROM class_assignments a JOIN cohorts c ON c.id=a.class_id WHERE a.id=?").bind(assignmentId).first<AssignmentRow&{course_id:string}>();
  if(!a)throw new ClassError(404,"Tugas tidak ditemukan.");
  const ctx=await loadGraduationContext(d,u,a.course_id,a.class_id);
  const binding=ctx.bindings.find(b=>b.assignment_id===a.id);
  const lesson=binding?requireAcademicLesson(ctx,binding.lesson_id):null;
  if(binding&&lesson?.reviewRequirements?.find(r=>r.id===binding.requirement_id)?.revision!==binding.requirement_revision)throw new ClassError(409,"Pengelola perlu memperbarui tugas wajib sesuai materi terbaru.");
  if(ctx.state.problem)throw new ClassError(409,ctx.state.problem.message);
  // An unbound legacy task is optional only after the course policy was explicitly mapped.
  const guard=academicProofPredicate(ctx,binding?.lesson_id);
  return {a,ctx,binding,lesson,guard};
}
export async function saveAssignment(d:PlatformDatabase,u:ClassUser,raw:unknown){
  const a=assignmentSchema.parse(raw);
  const {c,guard,context}=await classAccess(d,u,a.classId,"staff");
  const courseRow=await d.prepare("SELECT data,version FROM courses WHERE id=?").bind(c.course_id).first<{data:string;version:number}>();
  if(!courseRow)throw new ClassError(404,"Course tidak tersedia.");
  const course=JSON.parse(courseRow.data) as Course;
  const old=await d.prepare("SELECT * FROM class_assignments WHERE id=? AND class_id=?").bind(a.id,a.classId).first<AssignmentRow>();
  const oldBinding=await d.prepare("SELECT * FROM class_assignment_requirements WHERE assignment_id=?").bind(a.id).first<BindingRow>();
  const requested=a.requirementId===undefined?oldBinding?.requirement_id||null:a.requirementId;
  if(oldBinding&&requested!==oldBinding.requirement_id)throw new ClassError(403,"Syarat review wajib tidak dapat dilepas dari tugas ini.");
  const lesson=requested?course.lessons.find(l=>l.reviewRequirements?.some(r=>r.id===requested)):null;
  const requirement=lesson?.reviewRequirements?.find(r=>r.id===requested);
  if(requested&&!requirement)throw new ClassError(400,"Syarat review tidak tersedia pada course kelas ini.");
  if(requirement&&!a.rubric.trim())throw new ClassError(400,"Rubrik tugas wajib harus diisi.");
  const changed=!!old&&(old.instructions!==a.instructions||old.rubric!==a.rubric);
  const editorial=changed&&a.change?.kind==="editorial";
  if(editorial&&!context.owner)throw new ClassError(403,"Perubahan editorial instruksi/rubrik memerlukan konfirmasi Admin.");
  const assessmentRevision=old?Number(old.assessment_revision)+(changed&&!editorial?1:0):1;
  const contentRevision=old?Number(old.content_revision)+(changed||old.title!==a.title?1:0):1;
  const version=a.version+1,time=new Date().toISOString();
  guard.sql+=" AND EXISTS(SELECT 1 FROM courses WHERE id=? AND version=?)";guard.binds.push(c.course_id,courseRow.version);
  if(requested){guard.sql+=" AND NOT EXISTS(SELECT 1 FROM class_assignment_requirements WHERE class_id=? AND requirement_id=? AND assignment_id!=?)";guard.binds.push(a.classId,requested,a.id);}
  const write=!a.version?d.prepare(`INSERT INTO class_assignments(id,class_id,title,instructions,rubric,due_at,status,version,assessment_revision,content_revision,created_at) SELECT ?,?,?,?,?,?,?,1,?,?,? WHERE ${guard.sql} AND EXISTS(SELECT 1 FROM cohorts WHERE id=? AND status!='archived') AND (SELECT count(*) FROM class_assignments WHERE class_id=?)<100 AND NOT EXISTS(SELECT 1 FROM class_assignments WHERE id=?)`).bind(a.id,a.classId,a.title,a.instructions,a.rubric,a.dueAt,a.status,assessmentRevision,contentRevision,time,...guard.binds,a.classId,a.classId,a.id)
    :d.prepare(`UPDATE class_assignments AS a SET title=?,instructions=?,rubric=?,due_at=?,status=?,version=version+1,assessment_revision=?,content_revision=? WHERE id=? AND class_id=? AND version=? AND ${guard.sql} AND ${activeStaff} AND (?!='draft' OR NOT EXISTS(SELECT 1 FROM project_submissions WHERE assignment_id=a.id))`).bind(a.title,a.instructions,a.rubric,a.dueAt,a.status,assessmentRevision,contentRevision,a.id,a.classId,a.version,...guard.binds,u.id,a.status);
  let committed="EXISTS(SELECT 1 FROM class_assignments WHERE id=? AND class_id=? AND version=? AND title=? AND instructions=? AND rubric=?)";
  const proof=[a.id,a.classId,version,a.title,a.instructions,a.rubric];
  const eventId=crypto.randomUUID();
  const writes=[write,d.prepare(`INSERT INTO academic_change_events(id,actor_id,object_id,kind,data,created_at) SELECT ?,?,?,?,?,? WHERE ${databaseSql(d,"changes()>0","ROW_COUNT()>0")}`).bind(eventId,u.id,a.id,"assignment_revision",JSON.stringify({previous:old,next:a,assessmentRevision,contentRevision}),time)];
  committed+=` AND EXISTS(SELECT 1 FROM academic_change_events WHERE id='${eventId}')`;
  if(requirement&&lesson)writes.push(d.prepare(databaseSql(d,`INSERT INTO class_assignment_requirements(class_id,requirement_id,course_id,lesson_id,assignment_id,requirement_revision) SELECT ?,?,?,?,?,? WHERE ${committed} ON CONFLICT(class_id,requirement_id) DO UPDATE SET requirement_revision=excluded.requirement_revision,version=class_assignment_requirements.version+1`, `INSERT INTO class_assignment_requirements(class_id,requirement_id,course_id,lesson_id,assignment_id,requirement_revision) SELECT ?,?,?,?,?,? WHERE ${committed} ON DUPLICATE KEY UPDATE requirement_revision=VALUES(requirement_revision),version=version+1`)).bind(a.classId,requirement.id,course.id,lesson.id,a.id,requirement.revision,...proof));
  writes.push(d.prepare(`INSERT INTO assignment_revisions(assignment_id,version,assessment_revision,content_revision,data,actor_id,created_at) SELECT ?,?,?,?,?,?,? WHERE ${committed} AND NOT EXISTS(SELECT 1 FROM assignment_revisions WHERE assignment_id=? AND version=?)`).bind(a.id,version,assessmentRevision,contentRevision,JSON.stringify({...a,assessmentRevision,contentRevision}),u.id,time,...proof,a.id,version));
  const result=await d.batch(writes);
  if(!result[0].meta.changes)throw new ClassError(409,"Tugas, course, binding atau hak akses berubah. Muat ulang sebelum menyimpan.");
  return {id:a.id};
}
export async function submitProject(d:PlatformDatabase,u:ClassUser,raw:unknown){
  await requirePermission(d,u,"student");
  const b=projectMutation.parse(raw);if(b.action!=="submit")throw new ClassError(400,"Aksi tidak sesuai.");
  const {a,ctx,binding,lesson,guard}=await assignmentAcademicContext(d,u,b.assignmentId);
  const prior=await readAcademicReceipt<{id:string}>(d,u.id,"submit",b.id,b);if(prior)return prior;
  const snapshot=JSON.stringify({classId:a.class_id,courseId:a.course_id,lessonId:lesson?.id||null,lessonRevision:lesson?.revision||0,requirementId:binding?.requirement_id||null,requirementRevision:binding?.requirement_revision||0,assignmentRevision:a.assessment_revision,reviewPassThreshold:courseReviewThreshold(ctx.course),instructions:a.instructions,rubric:a.rubric});
  // Submission IDs are the stable mutation IDs. The latest attempt is checked in the write itself.
  const query=d.prepare(`INSERT INTO project_submissions(id,assignment_id,student_id,attempt,assignment_version,assessment_revision,lesson_revision,requirement_revision,snapshot,instructions,body,url,submitted_at,late,status,feedback,version)
    SELECT ?,a.id,?,COALESCE((SELECT max(attempt) FROM project_submissions WHERE assignment_id=a.id AND student_id=?),0)+1,a.version,a.assessment_revision,?,?,?,a.instructions,?,?,?,CASE WHEN a.due_at IS NOT NULL AND a.due_at<? THEN 1 ELSE 0 END,'submitted','',1
    FROM class_assignments a WHERE a.id=? AND a.version=? AND a.status='published' AND ${activeMember} AND ${guard.sql}
    AND (SELECT count(*) FROM project_submissions WHERE assignment_id=a.id AND student_id=? AND assessment_revision=a.assessment_revision AND lesson_revision=?)<20
    AND NOT EXISTS(SELECT 1 FROM project_submissions WHERE id=?)
    AND ((? IS NULL AND NOT EXISTS(SELECT 1 FROM project_submissions WHERE assignment_id=a.id AND student_id=?)) OR EXISTS(SELECT 1 FROM project_submissions p WHERE p.id=? AND p.assignment_id=a.id AND p.student_id=? AND p.version=? AND (p.status='changes_requested' OR p.assessment_revision!=a.assessment_revision OR p.lesson_revision!=?) AND p.attempt=(SELECT max(attempt) FROM project_submissions WHERE assignment_id=a.id AND student_id=?)))
    ${b.attachmentIds.length?`AND (SELECT count(*) FROM project_files WHERE id IN (${b.attachmentIds.map(()=>"?").join(",")}) AND submission_id=? AND owner_id=? AND assignment_id=a.id AND scope=? AND ready=1)=?`:""}`)
    .bind(b.id,u.id,u.id,lesson?.revision||0,binding?.requirement_revision||0,snapshot,b.body,b.url,new Date().toISOString(),new Date().toISOString(),b.assignmentId,b.assignmentVersion,u.id,...guard.binds,u.id,lesson?.revision||0,b.id,b.previousId,u.id,b.previousId,u.id,b.previousVersion,lesson?.revision||0,u.id,...(b.attachmentIds.length?[...b.attachmentIds,b.id,u.id,fileStorage().scope,b.attachmentIds.length]:[]));
  void ctx;
  const writes=[];
  if(b.attachmentIds.length)writes.push(d.prepare(`UPDATE project_files SET submission_id=? WHERE id IN (${b.attachmentIds.map(()=>"?").join(",")}) AND owner_id=? AND assignment_id=? AND scope=? AND ready=1 AND submission_id IS NULL AND ${guard.sql} AND NOT EXISTS(SELECT 1 FROM project_submissions WHERE id=?)`).bind(b.id,...b.attachmentIds,u.id,b.assignmentId,fileStorage().scope,...guard.binds,b.id));
  writes.push(query);
  if(b.attachmentIds.length)writes.push(d.prepare("UPDATE project_files SET submission_id=NULL WHERE submission_id=? AND owner_id=? AND NOT EXISTS(SELECT 1 FROM project_submissions WHERE id=?)").bind(b.id,u.id,b.id));
  writes.push(academicReceipt(d,u.id,"submit",b.id,b,{id:b.id},"EXISTS(SELECT 1 FROM project_submissions WHERE id=? AND student_id=?)",[b.id,u.id]));
  await d.batch(writes);
  const saved=await readAcademicReceipt<{id:string}>(d,u.id,"submit",b.id,b);
  if(!saved)throw new ClassError(409,"Tugas atau kiriman terbaru berubah, masih ditinjau, ditutup, atau batas percobaan revisi ini tercapai. Muat ulang.");
  return saved;
}
export async function reviewProject(d:PlatformDatabase,u:ClassUser,raw:unknown){
  await requirePermission(d,u,"tutor");
  const b=projectMutation.parse(raw);if(b.action!=="review")throw new ClassError(400,"Aksi tidak sesuai.");
  const row=await d.prepare("SELECT s.*,a.class_id,a.assessment_revision AS currentRevision,c.course_id FROM project_submissions s JOIN class_assignments a ON a.id=s.assignment_id JOIN cohorts c ON c.id=a.class_id WHERE s.id=?").bind(b.submissionId).first<{student_id:string;class_id:string;course_id:string;assignment_id:string;assessment_revision:number;lesson_revision:number;requirement_revision:number;currentRevision:number;snapshot:string}>();
  if(!row)throw new ClassError(404,"Kiriman tidak ditemukan.");
  const {guard}=await classAccess(d,u,row.class_id,"staff");
  const target=await authorizationGuard(d,{id:row.student_id},"studentClass",row.class_id).catch(()=>{throw new ClassError(409,"Keanggotaan peserta berubah.");});
  guard.sql+=` AND ${target.sql}`;guard.binds.push(...target.binds);
  const requestId=b.requestId||crypto.randomUUID();
  const prior=await readAcademicReceipt<{ok:boolean}>(d,u.id,"review",requestId,b);if(prior)return prior;
  const binding=await d.prepare("SELECT * FROM class_assignment_requirements WHERE assignment_id=?").bind(row.assignment_id).first<BindingRow>();
  let currentLessonRevision=0,currentRequirementRevision=0;
  if(binding){
    const ctx=await loadGraduationContext(d,{id:row.student_id},row.course_id,row.class_id);
    const minimumScore=courseReviewThreshold(ctx.course);
    if(!Number.isFinite(minimumScore))throw new ClassError(409,"Standar kelulusan course perlu diperiksa Tim Kurikulum.");
    if(b.status==="accepted"&&(b.score===null||b.score<minimumScore))throw new ClassError(400,`Tugas wajib hanya dapat Diterima dengan nilai minimal ${minimumScore}.`);
    const lesson=ctx.course.lessons.find(l=>l.id===binding.lesson_id),requirement=lesson?.reviewRequirements?.find(r=>r.id===binding.requirement_id);
    if(!lesson||!requirement||requirement.revision!==binding.requirement_revision)throw new ClassError(409,"Pemetaan tugas perlu diperbarui sebelum menilai.");
    currentLessonRevision=lesson.revision;currentRequirementRevision=requirement.revision;
    guard.sql+=` AND ${ctx.guard.sql} AND EXISTS(SELECT 1 FROM class_assignment_requirements WHERE assignment_id=? AND version=? AND requirement_revision=?)`;
    guard.binds.push(...ctx.guard.binds,binding.assignment_id,binding.version,binding.requirement_revision);
  }
  if(Number(row.assessment_revision)!==Number(row.currentRevision)||Number(row.lesson_revision)!==currentLessonRevision||Number(row.requirement_revision)!==currentRequirementRevision)throw new ClassError(409,"Instruksi penilaian berubah; peserta perlu mengirim versi terbaru sebelum dinilai.");
  const reviewId=crypto.randomUUID(),time=new Date().toISOString();
  const latest=`s.attempt=(SELECT max(attempt) FROM project_submissions WHERE assignment_id=s.assignment_id AND student_id=s.student_id)`;
  const writes=[d.prepare(`INSERT INTO project_reviews(id,submission_id,sequence,reviewer_id,reviewer_name,status,score,feedback,snapshot,request_id,created_at) SELECT ?,s.id,COALESCE((SELECT max(sequence) FROM project_reviews WHERE submission_id=s.id),0)+1,?,?,?,?,?,?,?,? FROM project_submissions s WHERE s.id=? AND s.version=? AND ${latest} AND ${guard.sql} AND EXISTS(SELECT 1 FROM class_assignments a WHERE a.id=s.assignment_id AND a.assessment_revision=? AND ${activeStaff}) AND NOT EXISTS(SELECT 1 FROM academic_mutation_receipts WHERE actor_id=? AND action='review' AND request_id=?)`).bind(reviewId,u.id,u.name,b.status,b.score,b.feedback,row.snapshot,requestId,time,b.submissionId,b.version,...guard.binds,row.currentRevision,u.id,u.id,requestId),
    d.prepare(`UPDATE project_submissions AS s SET status=?,feedback=?,score=?,reviewer_name=?,reviewed_at=?,version=version+1 WHERE s.id=? AND s.version=? AND EXISTS(SELECT 1 FROM project_reviews WHERE id=?) AND ${guard.sql}`).bind(b.status,b.feedback,b.score,u.name,time,b.submissionId,b.version,reviewId,...guard.binds),
    d.prepare("DELETE FROM project_reviews WHERE id=? AND NOT EXISTS(SELECT 1 FROM project_submissions WHERE id=? AND version=? AND reviewed_at=?)").bind(reviewId,b.submissionId,b.version+1,time),
    academicReceipt(d,u.id,"review",requestId,b,{ok:true},"EXISTS(SELECT 1 FROM project_reviews WHERE id=?)",[reviewId])];
  await d.batch(writes);
  const saved=await readAcademicReceipt<{ok:boolean}>(d,u.id,"review",requestId,b);
  if(!saved)throw new ClassError(409,"Kiriman atau hak akses berubah. Muat ulang sebelum menilai kembali.");
  return saved;
}

export type DashboardProject = {
  id: string;
  title: string;
  classId: string;
  className: string;
  courseTitle: string;
  dueAt: string | null;
  taskStatus: "published" | "closed";
  status: "not_submitted" | "submitted" | "changes_requested" | "accepted" | "stale" | "configuration_required";
  attempt: number;
  submittedAt: string | null;
  reviewedAt: string | null;
  score: number | null;
  late: boolean;
  overdue: boolean;
  needsWork: boolean;
};
export async function dashboardProjects(
  d: PlatformDatabase,
  u: ClassUser,
  at = new Date().toISOString(),
): Promise<DashboardProject[]> {
  const guard=await authorizationGuard(d,u,'student'),before=await classReadSnapshot(d,u);
  const rows = (
    await d
      .prepare(
        `SELECT a.id,a.title,a.class_id AS classId,c.name AS className,c.course_id AS courseId,${courseTitleSql(d, "k.data")} AS courseTitle,a.due_at AS dueAt,a.status AS taskStatus,s.status,s.attempt,s.submitted_at AS submittedAt,s.reviewed_at AS reviewedAt,s.score,s.late
 FROM cohort_members m JOIN cohorts c ON c.id=m.class_id JOIN courses k ON k.id=c.course_id JOIN class_assignments a ON a.class_id=c.id
 LEFT JOIN project_submissions s ON s.assignment_id=a.id AND s.student_id=m.user_id AND s.attempt=(SELECT max(attempt) FROM project_submissions WHERE assignment_id=a.id AND student_id=m.user_id)
 WHERE m.user_id=? AND m.status='approved' AND c.status!='archived' AND a.status!='draft' AND ${policySql('student')}`,
      )
      .bind(u.id,u.id)
      .all<Omit<DashboardProject,"late"|"needsWork"|"overdue"|"status">&{courseId:string;status:DashboardProject["status"]|null;late:number|null}>()
  ).results;
  await assertClassRead(d,u,before,rows.map(r=>r.classId));
  if(!await d.prepare(`SELECT 1 WHERE ${guard.sql}`).bind(...guard.binds).first())throw new AccessError(403,'Hak akun berubah. Muat ulang tugas.');
  const contexts=new Map<string,Awaited<ReturnType<typeof loadGraduationContext>>>();
  for(const r of rows)if(!contexts.has(r.classId))contexts.set(r.classId,await loadGraduationContext(d,u,r.courseId,r.classId));
  const result: DashboardProject[] = rows.map((r) => {
    const grade=contexts.get(r.classId)?.state.lessons.flatMap(l=>l.requiredReviews).find(x=>x.assignmentId===r.id);
    const status:DashboardProject["status"] = grade?.status==="stale"?"stale":grade?.status==="configuration_required"?"configuration_required":r.status||"not_submitted";
    const needsWork =
      r.taskStatus === "published" &&
      (["not_submitted","changes_requested","stale","configuration_required"].includes(status));
    return {
      id: r.id,
      title: r.title,
      classId: r.classId,
      className: r.className,
      courseTitle: r.courseTitle,
      dueAt: r.dueAt,
      taskStatus: r.taskStatus,
      status,
      attempt: r.attempt || 0,
      submittedAt: r.submittedAt || null,
      reviewedAt: r.reviewedAt || null,
      score: r.score ?? null,
      late: !!r.late,
      needsWork,
      overdue: needsWork && !!r.dueAt && Date.parse(r.dueAt) < Date.parse(at),
    };
  });
  for(const ctx of contexts.values())await assertAcademicRead(d,ctx);
  return result.sort((a, b) => {
    const rank = (x: DashboardProject) =>
      x.needsWork
        ? x.status === "changes_requested"
          ? 0
          : 1
        : x.status === "submitted"
          ? 2
          : x.status === "accepted"
            ? 3
            : 4;
    return (
      rank(a) - rank(b) ||
      (a.dueAt || "9999").localeCompare(b.dueAt || "9999") ||
      a.className.localeCompare(b.className) ||
      a.id.localeCompare(b.id)
    );
  });
}
