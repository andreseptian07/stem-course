import {loadGraduationContext,requireAcademicLesson,academicProofPredicate} from "./graduation-data.ts";
import {AccessError} from "./access-error.ts";
import {requirePermission} from "./authorization.ts";
import {learningAuthorization,learningProofPredicate,type LearningProof} from "./learning-access.ts";
import { databaseSql, type PlatformDatabase, type DatabaseValue } from "./database.ts";
import {
  submitCode,
  pollCode,
  gradeCode,
  JudgeError,
  judgeFingerprint,
} from "./judge.ts";
import type { JudgeConfig } from "./judge.ts";
import type { Lesson } from "./model";
export class CodeError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
export type CodeAttemptRow = {
  id: string;
  user_id: string;
  course_id: string;
  lesson_id: string;
  revision: number;
  state: string;
  data: string;
  created_at: string;
  score: number | null;
};
const active = "state IN ('submitting','pending')";
export async function releaseAttempt(
  d: PlatformDatabase,
  id: string,
  userId: string,
) {
  // The database batch is transactional: the active state makes a refund happen at most once.
  await d.batch([
    d
      .prepare(
        `UPDATE learning_progress_revisions SET version=version+1,code_attempts=${databaseSql(d, "max(0,code_attempts-1)", "GREATEST(0,code_attempts-1)")} WHERE user_id=? AND EXISTS(SELECT 1 FROM attempts a WHERE a.id=? AND a.user_id=learning_progress_revisions.user_id AND a.course_id=learning_progress_revisions.course_id AND a.lesson_id=learning_progress_revisions.lesson_id AND a.revision=learning_progress_revisions.revision AND a.${active})`,
      )
      .bind(userId, id),
    d
      .prepare(
        `UPDATE attempts SET state='error',data=json_remove(data,'$.tokens','$.endpoint','$.hidden') WHERE id=? AND user_id=? AND ${active}`,
      )
      .bind(id, userId),
  ]);
}
async function digest(s: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)),
    ),
  )
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
export async function startAttempt(
  d: PlatformDatabase,
  cfg: JudgeConfig,
  userId: string,
  courseId: string,
  l: Lesson,
  source: string,
  id: string,
  fetcher: typeof fetch = fetch,
  classId?:string|null,
) {
  const context=await loadGraduationContext(d,{id:userId},courseId,classId);
  const current=requireAcademicLesson(context,l.id);
  if(current.revision!==l.revision)throw new AccessError(409,"Revisi penilaian berubah.");
  const academic=academicProofPredicate(context,l.id);
  const authorization:{sql:string;binds:DatabaseValue[];proof:LearningProof}=await learningAuthorization(d,{id:userId},courseId);
  authorization.sql+=` AND ${academic.sql}`;authorization.binds.push(...academic.binds);
  const hash = await digest(source),
    endpoint = await judgeFingerprint(cfg);
  const old = await d
    .prepare("SELECT * FROM attempts WHERE id=?")
    .bind(id)
    .first<CodeAttemptRow>();
  if (old) {
    const data = JSON.parse(old.data);
    if (
      old.user_id !== userId ||
      old.course_id !== courseId ||
      old.lesson_id !== l.id ||
      old.revision !== l.revision ||
      data.hash !== hash || data.classId !== context.state.classId
    )
      throw new CodeError(
        409,
        "ID pengiriman sudah digunakan. Muat ulang dan coba lagi.",
      );
    if(["submitting","pending"].includes(old.state) && JSON.stringify(data.authorization)!==JSON.stringify(authorization.proof)){await releaseAttempt(d,id,userId);throw new AccessError(409,"Hak belajar berubah. Gunakan pengiriman baru.");}
    if(["submitting","pending"].includes(old.state)&&(!data.academic||!await d.prepare(`SELECT 1 WHERE ${data.academic.sql}`).bind(...data.academic.binds).first())){await releaseAttempt(d,id,userId);throw new AccessError(409,"Syarat kelulusan berubah. Gunakan pengiriman baru.");}
    return { id, state: old.state === "submitting" ? "pending" : old.state };
  }
  const now = Date.now(),
    cutoff = new Date(now - 300000).toISOString();
  const expired = await d
    .prepare(
      `SELECT id FROM attempts WHERE user_id=? AND kind='code' AND ${active} AND created_at<?`,
    )
    .bind(userId, cutoff)
    .all<{ id: string }>();
  for (const row of expired.results) await releaseAttempt(d, row.id, userId);
  const reservationId=crypto.randomUUID();
  const reservation = await d.batch([
    d
      .prepare(
        `INSERT INTO attempts(id,user_id,course_id,lesson_id,revision,kind,state,data,created_at)
      SELECT ?,?,?,?,?,'code','submitting',?,? WHERE
      NOT EXISTS(SELECT 1 FROM attempts WHERE user_id=? AND kind='code' AND ${active})
      AND (SELECT count(*) FROM attempts WHERE user_id=? AND kind='code' AND created_at>?)<5
      AND (SELECT count(*) FROM attempts WHERE kind='code' AND ${active} AND created_at>?)<20 AND ${authorization.sql}
      AND EXISTS(SELECT 1 FROM learning_progress_revisions WHERE user_id=? AND course_id=? AND lesson_id=? AND revision=? AND (?=0 OR code_attempts<?))`,
      )
      .bind(
        id,
        userId,
        courseId,
        l.id,
        l.revision,
        JSON.stringify({hash,endpoint,authorization:authorization.proof,academic,classId:context.state.classId,reservationId}),
        new Date(now).toISOString(),
        userId,
        userId,
        new Date(now - 60000).toISOString(),
        cutoff,
        ...authorization.binds,
        userId,
        courseId,
        l.id,
        l.revision,
        l.exercise!.maxAttempts,
        l.exercise!.maxAttempts,
      ),
    d
      .prepare(
        `UPDATE learning_progress_revisions SET code_attempts=code_attempts+1,version=version+1 WHERE user_id=? AND course_id=? AND lesson_id=? AND revision=? AND EXISTS(SELECT 1 FROM attempts WHERE id=? AND user_id=? AND state='submitting' AND ${databaseSql(d,"json_extract(data,'$.reservationId')","json_unquote(json_extract(data,'$.reservationId'))")}=?)`,
      )
      .bind(userId, courseId, l.id, l.revision, id,userId,reservationId),
  ]);
  if (!reservation[0].meta.changes) {
    if(await d.prepare("SELECT 1 FROM attempts WHERE id=?").bind(id).first())
      return startAttempt(d,cfg,userId,courseId,l,source,id,fetcher,classId);
    throw new CodeError(
      429,
      "Tunggu pemeriksaan yang sedang berjalan atau coba kembali dalam satu menit. Jika batas percobaan habis, hubungi mentor.",
    );
  }
  try {
    const tokens = await submitCode(
      cfg,
      l.exercise!.language,
      source,
      l.exercise!.tests,
      fetcher,
    );
    await d
      .prepare(
        `UPDATE attempts SET state='pending',data=? WHERE id=? AND state='submitting' AND ${authorization.sql}`,
      )
      .bind(
        JSON.stringify({
          hash,
          endpoint,
          authorization:authorization.proof,
          academic,classId:context.state.classId,
          tokens,
          hidden: l.exercise!.tests.map((t) => t.hidden),
        }),
        id,
        ...authorization.binds,
      )
      .run();
    if(!await d.prepare(`SELECT 1 FROM attempts WHERE id=? AND state='pending' AND ${authorization.sql}`).bind(id,...authorization.binds).first())throw new AccessError(403,"Akses belajar berubah selama pemeriksaan.");
    return { id, state: "pending" };
  } catch(error) {
    await releaseAttempt(d,id,userId);
    if(error instanceof AccessError)throw error;
    throw new JudgeError();
  }
}
export async function readAttempt(
  d: PlatformDatabase,
  cfg: JudgeConfig | null,
  userId: string,
  a: CodeAttemptRow,
  currentRevision: number | undefined,
  fetcher: typeof fetch = fetch,
) {
  if(a.user_id!==userId)throw new CodeError(404,"Percobaan tidak ditemukan.");
  try{await requirePermission(d,{id:userId},"student",a.course_id);}catch(e){if(["submitting","pending"].includes(a.state))await releaseAttempt(d,a.id,userId);throw e;}
  if (a.state === "finished")
    return {
      id: a.id,
      state: "finished",
      score: a.score,
      ...JSON.parse(a.data).result,
      stale: currentRevision !== a.revision,
    };
  const failure = {
    id: a.id,
    state: "error",
    error:
      "Pemeriksaan belum berhasil. Kuota percobaan dikembalikan; coba lagi.",
  };
  if (a.state === "error") return failure;
  if (!cfg || Date.now() - Date.parse(a.created_at) > 300000) {
    await releaseAttempt(d, a.id, userId);
    return failure;
  }
  const data=JSON.parse(a.data);
  const proof=data.authorization as LearningProof|undefined;
  if(!proof||!Number.isInteger(proof.accessVersion)||!Number.isInteger(proof.principalVersion)||typeof proof.enrollmentId!=="string"||!Number.isInteger(proof.courseVersion)){await releaseAttempt(d,a.id,userId);return failure;}
  const authorization=learningProofPredicate(userId,a.course_id,proof);
  if(!data.academic||typeof data.academic.sql!=="string"||!Array.isArray(data.academic.binds)){await releaseAttempt(d,a.id,userId);return failure;}
  authorization.sql+=` AND ${data.academic.sql}`;authorization.binds.push(...data.academic.binds);
  if(!await d.prepare(`SELECT 1 WHERE ${authorization.sql}`).bind(...authorization.binds).first()){await releaseAttempt(d,a.id,userId);throw new AccessError(403,"Akses belajar berubah selama pemeriksaan.");}
  if (a.state === "submitting") return { id: a.id, state: "pending" };
  let endpoint:string;
  try {endpoint=await judgeFingerprint(cfg);} catch {
    await releaseAttempt(d,a.id,userId);return failure;
  }
  if (data.endpoint !== endpoint) {
    await releaseAttempt(d, a.id, userId);
    return failure;
  }
  const lease = await d
    .prepare(
      `UPDATE attempts SET poll_at=? WHERE id=? AND user_id=? AND state='pending' AND poll_at<=? AND ${authorization.sql}`,
    )
    .bind(Date.now()+16000,a.id,userId,Date.now(),...authorization.binds)
    .run();
  if (!lease.meta.changes) {
    if(!await d.prepare(`SELECT 1 WHERE ${authorization.sql}`).bind(...authorization.binds).first()){await releaseAttempt(d,a.id,userId);throw new AccessError(403,"Akses belajar berubah selama pemeriksaan.");}
    return { id: a.id, state: "pending" };
  }
  try {
    const output = gradeCode(
      await pollCode(cfg, data.tokens, fetcher),
      data.hidden,
    );
    if (!output) {
      await d
        .prepare(`UPDATE attempts SET poll_at=? WHERE id=? AND state='pending' AND ${authorization.sql}`)
        .bind(Date.now()+2000,a.id,...authorization.binds)
        .run();
      if(!await d.prepare(`SELECT 1 WHERE ${authorization.sql}`).bind(...authorization.binds).first()){await releaseAttempt(d,a.id,userId);throw new AccessError(403,"Akses belajar berubah selama pemeriksaan.");}
      return { id: a.id, state: "pending" };
    }
    const saved=await d.batch([
      d
        .prepare(
          `UPDATE learning_progress_revisions SET code_passed=1,code_evidence_id=?,version=version+1 WHERE user_id=? AND course_id=? AND lesson_id=? AND revision=? AND ?=1 AND EXISTS(SELECT 1 FROM attempts WHERE id=? AND state='pending') AND ${authorization.sql}`,
        )
        .bind(
          a.id,
          userId,
          a.course_id,
          a.lesson_id,
          a.revision,
          output.passed && currentRevision === a.revision ? 1 : 0,
          a.id,
          ...authorization.binds,
        ),
      d
        .prepare(
          `UPDATE attempts SET state='finished',score=?,data=? WHERE id=? AND state='pending' AND ${authorization.sql}`,
        )
        .bind(
          output.score,
          JSON.stringify({hash:data.hash,result:output,authorization:proof,academic:data.academic,classId:data.classId}),
          a.id,
          ...authorization.binds,
        ),
    ]);
    if(!saved[1].meta.changes){await releaseAttempt(d,a.id,userId);throw new AccessError(403,"Akses atau hasil pemeriksaan berubah sebelum disimpan.");}
    return {
      id: a.id,
      state: "finished",
      ...output,
      stale: currentRevision !== a.revision,
    };
  } catch(error) {
    await releaseAttempt(d,a.id,userId);
    if(error instanceof AccessError)throw error;
    return failure;
  }
}
