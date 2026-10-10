import type {PlatformDatabase,DatabaseValue} from "./database.ts";
import type {Course,Progress,GraduationBlocker} from "./model.ts";
import {evaluateGraduation,type ReviewEvidence} from "./graduation.ts";
import {learningAuthorization} from "./learning-access.ts";
import {authorizationGuard} from "./authorization.ts";
import {AccessError} from "./access-error.ts";

export const academicProgressColumns="lesson_id AS lessonId,revision,complete,quiz_passed AS quizPassed,code_passed AS codePassed,quiz_attempts AS quizAttempts,code_attempts AS codeAttempts,score,version,quiz_evidence_id AS quizEvidenceId,code_evidence_id AS codeEvidenceId,provenance";
export async function academicProgress(d:PlatformDatabase,userId:string,courseId:string){
  return (await d.prepare(`SELECT ${academicProgressColumns} FROM learning_progress_revisions WHERE user_id=? AND course_id=? ORDER BY revision DESC`).bind(userId,courseId).all<Progress>()).results;
}
type Guard={sql:string;binds:DatabaseValue[]};
export async function loadGraduationContext(d:PlatformDatabase,user:{id:string},courseId:string,classId?:string|null,staffActor?:{id:string}){
  const guard:Guard=staffActor?await authorizationGuard(d,staffActor,classId?"tutor":"owner",classId||undefined):await learningAuthorization(d,user,courseId);
  const row=await d.prepare("SELECT data,version FROM courses WHERE id=?").bind(courseId).first<{data:string;version:number}>();
  if(!row)throw new AccessError(404,"Course tidak tersedia.");
  const course={...JSON.parse(row.data),version:row.version} as Course;
  guard.sql+=" AND EXISTS(SELECT 1 FROM courses WHERE id=? AND version=?)";guard.binds.push(courseId,row.version);
  const classes=(await d.prepare("SELECT c.id,c.name,c.version,c.status,m.authorization_version AS membershipVersion FROM cohorts c JOIN cohort_members m ON m.class_id=c.id WHERE c.course_id=? AND m.user_id=? AND m.status='approved' ORDER BY c.id").bind(courseId,user.id).all<{id:string;name:string;status:string;version:number;membershipVersion:number}>()).results;
  const selectable=classes.filter(c=>c.status!=="archived");
  const hasRequired=course.lessons.some(l=>l.reviewRequirements?.length);
  const needsClass=course.learningMode==="class_required"||hasRequired;
  let selected=classId?classes.find(c=>c.id===classId):undefined;
  if(classId&&!selected)throw new AccessError(404,"Kelas tidak tersedia.");
  if(!classId&&needsClass&&selectable.length===1)selected=selectable[0];
  let problem:GraduationBlocker|null=null;
  if(!selected&&needsClass)problem={code:"CLASS_CONTEXT_REQUIRED",message:selectable.length?"Pilih kelas untuk melanjutkan course ini.":"Bergabunglah ke kelas course ini dan tunggu persetujuan pengelola."};
  if(course.graduationPolicyVersion!==2||course.policyState!=="ready")problem={code:"GRADUATION_CONFIG_REQUIRED",message:"Pengelola perlu memetakan aturan kelulusan course ini sebelum belajar dilanjutkan."};
  if(selected?.status==="archived"&&!staffActor)problem={code:"CLASS_ARCHIVED",message:"Kelas ini telah diarsipkan. Riwayat tetap tersedia; kegiatan belajar baru ditutup."};
  if(selected){
    const membership=staffActor?{sql:"1=1",binds:[]}:await authorizationGuard(d,user,"studentClass",selected.id);
    guard.sql+=` AND ${membership.sql} AND EXISTS(SELECT 1 FROM cohorts c JOIN cohort_members m ON m.class_id=c.id WHERE c.id=? AND c.course_id=? AND c.version=? AND m.user_id=? AND m.authorization_version=?)`;
    guard.binds.push(...membership.binds,selected.id,courseId,selected.version,user.id,selected.membershipVersion);
  }
  const progress=await academicProgress(d,user.id,courseId);
  const bindings=selected?(await d.prepare("SELECT * FROM class_assignment_requirements WHERE class_id=? ORDER BY requirement_id").bind(selected.id).all<{class_id:string;requirement_id:string;course_id:string;lesson_id:string;assignment_id:string;requirement_revision:number;version:number}>()).results:[];
  const reviews:ReviewEvidence[]=selected?(await d.prepare(`SELECT b.requirement_id AS requirementId,b.lesson_id AS lessonId,b.requirement_revision AS requirementRevision,b.assignment_id AS assignmentId,b.version AS bindingVersion,a.status AS assignmentStatus,a.assessment_revision AS assignmentRevision,a.version AS assignmentVersion,
    s.id AS submissionId,s.version AS submissionVersion,s.assessment_revision AS submissionRevision,s.lesson_revision AS lessonRevision,s.requirement_revision AS submissionRequirementRevision,COALESCE(r.status,s.status) AS status,CASE WHEN r.id IS NOT NULL THEN r.score ELSE s.score END AS score,r.created_at AS reviewedAt,r.reviewer_id AS reviewerId,r.id AS reviewId,r.sequence AS reviewSequence
    FROM class_assignment_requirements b JOIN class_assignments a ON a.id=b.assignment_id AND a.class_id=b.class_id
    LEFT JOIN project_submissions s ON s.assignment_id=a.id AND s.student_id=? AND s.attempt=(SELECT max(attempt) FROM project_submissions WHERE assignment_id=a.id AND student_id=?)
    LEFT JOIN project_reviews r ON r.submission_id=s.id AND r.sequence=(SELECT max(sequence) FROM project_reviews WHERE submission_id=s.id)
    WHERE b.class_id=? AND b.course_id=? ORDER BY b.requirement_id`).bind(user.id,user.id,selected.id,courseId).all<ReviewEvidence&{assignmentVersion:number}>()).results:[];
  const state=evaluateGraduation({course,progress,reviews,classId:selected?.id||null,className:selected?.name,classes:selectable.map(({id,name})=>({id,name})),problem});
  const ctx={userId:user.id,course,progress,bindings,reviews,state,guard};
  await assertAcademicRead(d,ctx);
  return ctx;
}
export type GraduationContext=Awaited<ReturnType<typeof loadGraduationContext>>;
export function academicProofPredicate(ctx:GraduationContext,targetLessonId?:string,includeCurrent=false,omitCurrentProgress=false):Guard{
  const {course,userId,progress,reviews,bindings,state}=ctx;
  const sql=[ctx.guard.sql];const binds=[...ctx.guard.binds];
  const targetIndex=targetLessonId?course.lessons.findIndex(l=>l.id===targetLessonId):course.lessons.length;
  const relevant=targetLessonId?course.lessons.slice(0,targetIndex+(includeCurrent?1:0)):course.lessons;
  for(const l of relevant){
    // Completion mutates its own progress; pin its current reviews without
    // demanding the old progress version again when writing the receipt.
    if(omitCurrentProgress&&l.id===targetLessonId)continue;
    const p=progress.find(p=>p.lessonId===l.id&&p.revision===l.revision);
    if(p){sql.push("EXISTS(SELECT 1 FROM learning_progress_revisions WHERE user_id=? AND course_id=? AND lesson_id=? AND revision=? AND version=? AND complete=? AND quiz_passed=? AND code_passed=?)");binds.push(userId,course.id,l.id,l.revision,p.version||1,p.complete,p.quizPassed,p.codePassed);}
    else {sql.push("NOT EXISTS(SELECT 1 FROM learning_progress_revisions WHERE user_id=? AND course_id=? AND lesson_id=? AND revision=?)");binds.push(userId,course.id,l.id,l.revision);}
  }
  if(state.classId){
    sql.push("(SELECT count(*) FROM class_assignment_requirements WHERE class_id=?)=?");binds.push(state.classId,bindings.length);
    for(const b of bindings){sql.push("EXISTS(SELECT 1 FROM class_assignment_requirements WHERE class_id=? AND requirement_id=? AND assignment_id=? AND lesson_id=? AND course_id=? AND requirement_revision=? AND version=?)");binds.push(b.class_id,b.requirement_id,b.assignment_id,b.lesson_id,b.course_id,b.requirement_revision,b.version);}
    const wanted=new Set(relevant.map(l=>l.id));
    for(const r of reviews.filter(r=>wanted.has(r.lessonId))){
      sql.push("EXISTS(SELECT 1 FROM class_assignments WHERE id=? AND class_id=? AND version=? AND assessment_revision=? AND status=?)");binds.push(r.assignmentId,state.classId,r.assignmentVersion,r.assignmentRevision,r.assignmentStatus);
      if(r.submissionId){
        sql.push("EXISTS(SELECT 1 FROM project_submissions s WHERE s.id=? AND s.assignment_id=? AND s.student_id=? AND s.version=? AND s.attempt=(SELECT max(attempt) FROM project_submissions WHERE assignment_id=s.assignment_id AND student_id=s.student_id) AND (SELECT count(*) FROM project_submissions WHERE assignment_id=s.assignment_id AND student_id=s.student_id AND attempt=s.attempt)=1)");binds.push(r.submissionId,r.assignmentId,userId,r.submissionVersion);
        if(r.reviewId){sql.push("EXISTS(SELECT 1 FROM project_reviews r WHERE r.id=? AND r.submission_id=? AND r.sequence=(SELECT max(sequence) FROM project_reviews WHERE submission_id=r.submission_id))");binds.push(r.reviewId,r.submissionId);}
        else {sql.push("NOT EXISTS(SELECT 1 FROM project_reviews WHERE submission_id=?)");binds.push(r.submissionId);}
      }else {sql.push("NOT EXISTS(SELECT 1 FROM project_submissions WHERE assignment_id=? AND student_id=?)");binds.push(r.assignmentId,userId);}
    }
  }
  return {sql:sql.join(" AND "),binds};
}
export async function assertAcademicRead(d:PlatformDatabase,ctx:GraduationContext){
  if(!await d.prepare(`SELECT 1 WHERE ${ctx.guard.sql}`).bind(...ctx.guard.binds).first())throw new AccessError(403,"Hak akses berubah. Muat ulang halaman.");
  const guard=academicProofPredicate(ctx);
  if(!await d.prepare(`SELECT 1 WHERE ${guard.sql}`).bind(...guard.binds).first())throw new AccessError(409,"Akses, materi, atau hasil penilaian berubah. Muat ulang halaman.");
}
export function requireAcademicLesson(ctx:GraduationContext,lessonId:string){
  const lesson=ctx.course.lessons.find(l=>l.id===lessonId),status=ctx.state.lessons.find(l=>l.lessonId===lessonId);
  if(!lesson||!status)throw new AccessError(404,"Materi tidak ditemukan.");
  if(ctx.state.problem)throw new AccessError(409,`${ctx.state.problem.code}: ${ctx.state.problem.message}`);
  if(!status.unlocked)throw new AccessError(403,"PREREQUISITE_NOT_MET: Selesaikan seluruh syarat materi sebelumnya pada kelas ini.");
  return lesson;
}
