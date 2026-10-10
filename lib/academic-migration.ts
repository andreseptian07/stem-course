import {createHash} from "node:crypto";
import {databaseSql,type PlatformDatabase} from "./database.ts";
import type {Course} from "./model.ts";
const hash=(rows:unknown)=>createHash("sha256").update(JSON.stringify(rows)).digest("hex");
// Read-only inventory: never infer a task binding or reviewer from a display name.
export async function academicInventory(d:PlatformDatabase,writerState:"unknown"|"drained"="unknown"){
  const courses=(await d.prepare("SELECT id,data,version FROM courses ORDER BY id").all<{id:string;data:string;version:number}>()).results;
  const duplicates=(await d.prepare("SELECT assignment_id,student_id,attempt,count(*) AS count FROM project_submissions GROUP BY assignment_id,student_id,attempt HAVING count(*)>1").all()).results;
  const progress=(await d.prepare("SELECT * FROM progress ORDER BY user_id,course_id,lesson_id").all()).results;
  const certificates=(await d.prepare("SELECT * FROM certificates ORDER BY number").all()).results;
  const pending=(await d.prepare("SELECT id,course_id,lesson_id,revision FROM attempts WHERE kind='code' AND state IN ('pending','submitting') ORDER BY id").all()).results;
  const legacyReviews=(await d.prepare("SELECT s.id,s.assignment_id,s.status,s.score,s.reviewer_name,s.reviewed_at FROM project_submissions s WHERE s.status IN ('accepted','changes_requested') AND NOT EXISTS(SELECT 1 FROM project_reviews r WHERE r.submission_id=s.id AND r.sequence=(SELECT max(sequence) FROM project_reviews WHERE submission_id=s.id) AND r.status=s.status AND (r.score=s.score OR (r.score IS NULL AND s.score IS NULL)) AND length(trim(r.reviewer_id))>0 AND length(trim(r.created_at))>0) ORDER BY s.id").all<{id:string;assignment_id:string;status:string;score:number|null;reviewer_name:string|null;reviewed_at:string|null}>()).results;
  const needsMapping=courses.filter(row=>{const c=JSON.parse(row.data) as Course;return c.graduationPolicyVersion!==2||c.policyState!=="ready";}).map(row=>({id:row.id,version:row.version}));
  return {writerState,mayActivate:writerState==="drained"&&!pending.length&&!duplicates.length&&!needsMapping.length&&!legacyReviews.length,needsMapping,duplicateAttempts:duplicates,pendingJudge:pending,
    legacyReviews:legacyReviews.map(r=>({id:r.id,assignmentId:r.assignment_id,status:r.status,score:r.score,requiresEvidence:true,reason:r.status==="accepted"&&(r.score===null||r.score<80)?"below_required_score":"reviewer_and_revision_must_be_mapped"})),
    baseline:{progress:{count:progress.length,hash:hash(progress)},certificates:{count:certificates.length,hash:hash(certificates)},courses:{count:courses.length,hash:hash(courses)}}};
}
// Additive, transactional, replayable copy. Existing native evidence is never overwritten.
export async function backfillAcademicHistory(d:PlatformDatabase){
  const inventory=await academicInventory(d);
  if(inventory.duplicateAttempts.length)throw new Error("Duplikasi percobaan harus direkonsiliasi sebelum backfill/constraint; tidak ada data dihapus.");
  const insert=databaseSql(d,"INSERT OR IGNORE","INSERT");
  const [progress,assignments]=await d.batch([
    d.prepare(`${insert} INTO learning_progress_revisions(user_id,course_id,lesson_id,revision,complete,quiz_passed,code_passed,quiz_attempts,code_attempts,score,provenance) SELECT user_id,course_id,lesson_id,revision,complete,quiz_passed,code_passed,quiz_attempts,code_attempts,score,'legacy' FROM progress ${databaseSql(d,"","ON DUPLICATE KEY UPDATE user_id=learning_progress_revisions.user_id")}`),
    d.prepare(`${insert} INTO assignment_revisions(assignment_id,version,assessment_revision,content_revision,data,actor_id,created_at) SELECT id,version,assessment_revision,content_revision,json_object('title',title,'instructions',instructions,'rubric',rubric,'status',status,'dueAt',due_at,'provenance','legacy_current_snapshot'),'legacy_unknown',created_at FROM class_assignments ${databaseSql(d,"","ON DUPLICATE KEY UPDATE assignment_id=assignment_revisions.assignment_id")}`),
  ]);
  const after=await academicInventory(d);
  if(JSON.stringify(inventory.baseline)!==JSON.stringify(after.baseline))throw new Error("Sumber lama berubah selama backfill; periksa writer dan checkpoint sebelum aktivasi.");
  return {progressCopied:progress.meta.changes,assignmentsCopied:assignments.meta.changes,baseline:after.baseline};
}
