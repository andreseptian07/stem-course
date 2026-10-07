import { validateCertificateText } from "./certificate-pdf.ts";
import { randomUUID } from "node:crypto";
import { databaseSql, type PlatformDatabase, type DatabaseValue } from "./database.ts";
import { AccessError } from "./access.ts";
import { readCourse, readProgress } from "./course-data.ts";
import { canComplete, progressFor } from "./rules.ts";
import { certificateNumberPattern, type Certificate, type CertificateStatus } from "./certificate-model.ts";
type User = {
  id: string;
  role: string;
};
const columns = "number,course_id AS courseId,class_id AS classId,course_version AS courseVersion,recipient_name AS recipientName,course_title AS courseTitle,class_name AS className,issued_at AS issuedAt,revoked_at AS revokedAt";
async function activeName(d: PlatformDatabase, u: User) {
  const row = await d.prepare("SELECT u.name FROM users u JOIN user_access a ON a.user_id=u.id WHERE u.id=? AND a.status='active'").bind(u.id).first<{
    name: string;
  }>();
  if (!row)
    throw new AccessError(403, "Akun aktif diperlukan untuk sertifikat.");
  return row.name;
}
async function existing(d: PlatformDatabase, u: User, courseId: string, classId: string) {
  return d.prepare(`SELECT ${columns} FROM certificates WHERE user_id=? AND course_id=? AND class_id=?`).bind(u.id, courseId, classId).first<Certificate>();
}
async function classEvidence(d: PlatformDatabase, u: User, courseId: string, classId: string) {
  const classroom = await d.prepare("SELECT c.name,c.version FROM cohorts c JOIN cohort_members m ON m.class_id=c.id AND m.user_id=? AND m.status='approved' WHERE c.id=? AND c.course_id=?").bind(u.id, classId, courseId).first<{
    name: string;
    version: number;
  }>();
  if (!classroom)
    throw new AccessError(403, "Pilih kelas course yang keanggotaannya sudah disetujui.");
  const tasks = (await d.prepare(`SELECT a.id,a.title,a.version,s.id AS submissionId,s.version AS reviewVersion,s.attempt,s.status,s.reviewed_at AS reviewedAt,s.reviewer_name AS reviewerName,
  CASE WHEN s.instructions=a.instructions THEN 1 ELSE 0 END AS currentInstructions
  FROM class_assignments a LEFT JOIN project_submissions s ON s.assignment_id=a.id AND s.student_id=? AND s.attempt=(SELECT max(attempt) FROM project_submissions WHERE assignment_id=a.id AND student_id=?)
  WHERE a.class_id=? AND a.status IN ('published','closed') ORDER BY a.id`).bind(u.id, u.id, classId).all<{
    id: string;
    title: string;
    version: number;
    submissionId: string | null;
    reviewVersion: number | null;
    attempt: number | null;
    status: string | null;
    reviewedAt: string | null;
    reviewerName: string | null;
    currentInstructions: number;
  }>()).results;
  return { classroom, tasks: tasks.map(t => ({ ...t, accepted: t.status === 'accepted' && !!t.reviewedAt && !!t.reviewerName && !!t.currentInstructions })) };
}
export async function certificateStatus(d: PlatformDatabase, u: User, courseId: string): Promise<CertificateStatus> {
  const [name, c, progress] = await Promise.all([activeName(d, u), readCourse(d, courseId, u), readProgress(d, u.id, courseId)]);
  const lessons = c.lessons.map(l => { const p = progressFor(l, progress); return { id: l.id, title: l.title, complete: p?.complete === 1, quizPassed: l.quiz?.mode !== 'required' || p?.quizPassed === 1, codePassed: !l.exercise?.required || p?.codePassed === 1 }; });
  const lessonsDone = !!lessons.length && lessons.every(l => l.complete && l.quizPassed && l.codePassed);
  const classes = (await d.prepare("SELECT c.id FROM cohorts c JOIN cohort_members m ON m.class_id=c.id AND m.user_id=? AND m.status='approved' WHERE c.course_id=? ORDER BY c.id").bind(u.id, courseId).all<{
    id: string;
  }>()).results;
  return { enabled: !!c.certificateEnabled && c.published && !c.sample, recipientName: name, lessons, classes: await Promise.all(classes.map(async (cl) => {
      const { classroom, tasks } = await classEvidence(d, u, courseId, cl.id);
      return { id: cl.id, name: classroom.name, tasks: tasks.map(t => ({ id: t.id, title: t.title, accepted: t.accepted })), eligible: !!c.certificateEnabled && c.published && !c.sample && lessonsDone && !!tasks.length && tasks.every(t => t.accepted), certificate: await existing(d, u, courseId, cl.id) };
    })) };
}
export async function issueCertificate(d: PlatformDatabase, u: User, courseId: string, classId: string, consent: boolean) {
  if (consent !== true)
    throw new AccessError(400, "Setujui nama dan informasi sertifikat pada halaman verifikasi sebelum menerbitkan.");
  const name = await activeName(d, u);
  const prior = await existing(d, u, courseId, classId);
  if (prior) {
    if (prior.revokedAt)
      throw new AccessError(409, "Sertifikat kelas ini telah dicabut. Hubungi pengelola.");
    return prior;
  }
  const c = await readCourse(d, courseId, u);
  if (!c.published || c.sample || !c.certificateEnabled)
    throw new AccessError(403, "Sertifikat belum diaktifkan untuk course ini.");
  const rawCourse = await d.prepare("SELECT data FROM courses WHERE id=? AND version=?").bind(c.id, c.version).first<{
    data: string;
  }>();
  if (!rawCourse)
    throw new AccessError(409, "Course berubah. Muat ulang sebelum menerbitkan.");
  await validateCertificateText(name, c.title);
  const progress = await readProgress(d, u.id, courseId);
  if (!c.lessons.length || c.lessons.some(l => { const p = progressFor(l, progress); return p?.complete !== 1 || !canComplete(l, p); }))
    throw new AccessError(403, "Selesaikan seluruh materi versi terbaru dan lulus tes wajib.");
  const { classroom, tasks } = await classEvidence(d, u, courseId, classId);
  if (!tasks.length || tasks.some(t => !t.accepted))
    throw new AccessError(403, "Semua tugas terbit/ditutup pada kelas harus diterima Tutor sesuai instruksi terbaru; kelas perlu minimal satu tugas.");
  const issuedAt = new Date().toISOString(), number = `RS-${issuedAt.slice(0, 4)}-${randomUUID().replaceAll('-', '').toUpperCase()}`;
  const evidence = JSON.stringify({ ruleVersion: 1, lessons: c.lessons.map(l => ({ id: l.id, revision: l.revision, quizRequired: l.quiz?.mode === 'required', codeRequired: !!l.exercise?.required })), classVersion: classroom.version, tasks: tasks.map(t => ({ id: t.id, assignmentVersion: t.version, submissionId: t.submissionId, reviewVersion: t.reviewVersion, attempt: t.attempt, reviewedAt: t.reviewedAt })) });
  const predicates: string[] = [], values: DatabaseValue[] = [];
  for (const l of c.lessons) {
    predicates.push("EXISTS(SELECT 1 FROM progress p WHERE p.user_id=? AND p.course_id=? AND p.lesson_id=? AND p.revision=? AND p.complete=1 AND (?=0 OR p.quiz_passed=1) AND (?=0 OR p.code_passed=1))");
    values.push(u.id, c.id, l.id, l.revision, l.quiz?.mode === 'required' ? 1 : 0, l.exercise?.required ? 1 : 0);
  }
  for (const t of tasks) {
    predicates.push("EXISTS(SELECT 1 FROM class_assignments a JOIN project_submissions s ON s.assignment_id=a.id WHERE a.id=? AND a.class_id=? AND a.version=? AND a.status IN ('published','closed') AND s.id=? AND s.student_id=? AND s.version=? AND s.status='accepted' AND s.reviewed_at IS NOT NULL AND s.reviewer_name IS NOT NULL AND s.instructions=a.instructions AND s.attempt=(SELECT max(attempt) FROM project_submissions WHERE assignment_id=a.id AND student_id=?))");
    values.push(t.id, classId, t.version, t.submissionId, u.id, t.reviewVersion, u.id);
  }
  const sql = `${databaseSql(d, "INSERT OR IGNORE", "INSERT")} INTO certificates(number,user_id,course_id,class_id,course_version,recipient_name,course_title,class_name,evidence,issued_at)
  SELECT ?,?,?,?,?,u.name,?,?,?,? FROM users u JOIN user_access access ON access.user_id=u.id AND access.status='active'
  WHERE u.id=? AND u.name=? AND EXISTS(SELECT 1 FROM courses WHERE id=? AND version=? AND data=?)
  AND EXISTS(SELECT 1 FROM cohorts cl JOIN cohort_members m ON m.class_id=cl.id AND m.user_id=? AND m.status='approved' WHERE cl.id=? AND cl.course_id=? AND cl.version=?)
  AND (SELECT count(*) FROM class_assignments WHERE class_id=? AND status IN ('published','closed'))=?
  AND ${predicates.join(' AND ')} ${databaseSql(d, "", "ON DUPLICATE KEY UPDATE number=number")}`;
  // One statement rechecks course, progress, membership, task set and latest reviews.
  await d.prepare(sql).bind(number, u.id, c.id, classId, c.version, c.title, classroom.name, evidence, issuedAt, u.id, name, c.id, c.version, rawCourse.data, u.id, classId, c.id, classroom.version, classId, tasks.length, ...values).run();
  const saved = await existing(d, u, courseId, classId);
  if (!saved)
    throw new AccessError(409, "Materi, tugas atau akses berubah saat penerbitan. Muat ulang syarat kelulusan.");
  if (saved.revokedAt)
    throw new AccessError(409, "Sertifikat telah dicabut. Hubungi pengelola.");
  return saved;
}
export async function listCertificates(d: PlatformDatabase, u: User, admin = false) {
  if (admin && u.role !== 'owner')
    throw new AccessError(403, "Daftar pengelola hanya untuk Super Admin.");
  return (await d.prepare(`SELECT ${columns} FROM certificates ${admin ? '' : 'WHERE user_id=?'} ORDER BY issued_at DESC,number DESC LIMIT 200`).bind(...(admin ? [] : [u.id])).all<Certificate>()).results;
}
export async function ownedCertificate(d: PlatformDatabase, u: User, number: string) {
  const cert = await d.prepare(`SELECT ${columns} FROM certificates WHERE number=? AND user_id=?`).bind(number, u.id).first<Certificate>();
  if (!cert)
    throw new AccessError(404, "Sertifikat tidak ditemukan.");
  if (cert.revokedAt)
    throw new AccessError(410, "Sertifikat telah dicabut.");
  return cert;
}
export async function verifyCertificate(d: PlatformDatabase, number: string) {
  if (!certificateNumberPattern.test(number))
    return null;
  const c = await d.prepare(`SELECT ${columns} FROM certificates WHERE number=?`).bind(number).first<Certificate>();
  if (!c)
    return null;
  // Public verification contains no account/class IDs, scores, evidence or private reason.
  return c.revokedAt ? { number: c.number, status: 'revoked' as const, issuedAt: c.issuedAt, revokedAt: c.revokedAt } : { number: c.number, status: 'valid' as const, recipientName: c.recipientName, courseTitle: c.courseTitle, courseVersion: c.courseVersion, issuedAt: c.issuedAt };
}
export async function revokeCertificate(d: PlatformDatabase, u: User, number: string, reason: string) {
  if (u.role !== 'owner')
    throw new AccessError(403, "Pencabutan hanya untuk Super Admin.");
  const r = await d.prepare("UPDATE certificates SET revoked_at=?,revoked_by=?,revoke_reason=? WHERE number=? AND revoked_at IS NULL AND EXISTS(SELECT 1 FROM users u JOIN user_access a ON a.user_id=u.id WHERE u.id=? AND u.role='owner' AND a.status='active')").bind(new Date().toISOString(), u.id, reason, number, u.id).run();
  if (!r.meta.changes)
    throw new AccessError(409, "Sertifikat sudah dicabut, tidak ditemukan, atau akses pengelola berubah.");
  return { ok: true };
}
