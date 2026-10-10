import {courseReviewThreshold} from "./grading-policy.ts";
import {loadGraduationContext,academicProofPredicate,assertAcademicRead} from "./graduation-data.ts";
import {requirePermission,authorizationGuard} from "./authorization.ts";
import {learningAuthorization} from './learning-access.ts';
import {certificatePdf} from './certificate-pdf.ts';
import { validateCertificateText } from "./certificate-pdf.ts";
import { randomUUID } from "node:crypto";
import { databaseSql, type PlatformDatabase } from "./database.ts";
import { profileNameSql } from "./profile-name-sql.ts";
import { AccessError } from "./access.ts";


import { certificateNumberPattern, type Certificate, type CertificateStatus } from "./certificate-model.ts";
type User = {
  id: string;
  role: string;
};
const columns = "number,course_id AS courseId,class_id AS classId,course_version AS courseVersion,recipient_name AS recipientName,course_title AS courseTitle,class_name AS className,issued_at AS issuedAt,revoked_at AS revokedAt";
async function activeName(d: PlatformDatabase, u: User) {
  await requirePermission(d,u,"student");
  const row = await d.prepare(`SELECT ${profileNameSql(d)} AS name FROM users u JOIN user_access a ON a.user_id=u.id WHERE u.id=? AND a.status='active'`).bind(u.id).first<{
    name: string;
  }>();
  if (!row)
    throw new AccessError(403, "Akun aktif diperlukan untuk sertifikat.");
  return row.name;
}
async function existing(d: PlatformDatabase, u: User, courseId: string, classId: string) {
  return d.prepare(`SELECT ${columns} FROM certificates WHERE user_id=? AND course_id=? AND class_id=?`).bind(u.id, courseId, classId).first<Certificate>();
}
export async function certificateStatus(d:PlatformDatabase,u:User,courseId:string):Promise<CertificateStatus>{
  const base=await loadGraduationContext(d,u,courseId);
  const name=await activeName(d,u);
  const classes=[];
  for(const cl of base.state.classes){
    const ctx=await loadGraduationContext(d,u,courseId,cl.id);
    const tasks=ctx.state.lessons.flatMap(l=>l.requiredReviews).map(r=>({id:r.assignmentId||r.id,title:r.title,accepted:r.passed}));
    classes.push({id:cl.id,name:cl.name,tasks,eligible:!!ctx.course.certificateEnabled&&ctx.course.published&&!ctx.course.sample&&ctx.state.passed,certificate:await existing(d,u,courseId,cl.id),blockers:ctx.state.lessons.flatMap(l=>l.blockers)});
    await assertAcademicRead(d,ctx);
  }
  await assertAcademicRead(d,base);
  return {reviewPassThreshold:courseReviewThreshold(base.course),enabled:!!base.course.certificateEnabled&&base.course.published&&!base.course.sample,recipientName:name,lessons:base.state.lessons.map(l=>({id:l.lessonId,title:base.course.lessons.find(p=>p.id===l.lessonId)!.title,...l.platform})),classes};
}
export async function issueCertificate(d:PlatformDatabase,u:User,courseId:string,classId:string,consent:boolean){
  if(consent!==true)throw new AccessError(400,"Setujui nama dan informasi sertifikat sebelum menerbitkan.");
  await requirePermission(d,u,"student");
  const access=await learningAuthorization(d,u,courseId),classGuard=await authorizationGuard(d,u,"studentClass",classId);
  const classRow=await d.prepare("SELECT name,version FROM cohorts WHERE id=? AND course_id=?").bind(classId,courseId).first<{name:string;version:number}>();
  if(!classRow)throw new AccessError(404,"Kelas tidak tersedia.");
  const prior=await existing(d,u,courseId,classId);
  if(prior){
    if(prior.revokedAt)throw new AccessError(409,"Sertifikat kelas ini telah dicabut. Hubungi pengelola.");
    if(!await d.prepare(`SELECT 1 WHERE ${access.sql} AND ${classGuard.sql}`).bind(...access.binds,...classGuard.binds).first())throw new AccessError(403,"Hak akses berubah.");
    return prior;
  }
  const ctx=await loadGraduationContext(d,u,courseId,classId),c=ctx.course;
  if(!c.published||c.sample||!c.certificateEnabled)throw new AccessError(403,"Sertifikat belum diaktifkan untuk course ini.");
  if(!ctx.state.passed)throw new AccessError(403,`Selesaikan seluruh kegiatan, tes dan review wajib dengan nilai minimal ${courseReviewThreshold(c)} serta status Diterima pada kelas ini.`);
  const name=await activeName(d,u);await validateCertificateText(name,c.title);
  const guard=academicProofPredicate(ctx);
  const issuedAt=new Date().toISOString(),number=`RS-${issuedAt.slice(0,4)}-${randomUUID().replaceAll('-','').toUpperCase()}`;
  const evidence=JSON.stringify({ruleVersion:2,reviewPassThreshold:courseReviewThreshold(c),classId,courseVersion:c.version,lessons:c.lessons.map(l=>({id:l.id,assessmentRevision:l.revision,contentRevision:l.contentRevision,platform:ctx.progress.find(p=>p.lessonId===l.id&&p.revision===l.revision)})),reviews:ctx.reviews});
  await d.prepare(`${databaseSql(d,"INSERT OR IGNORE","INSERT")} INTO certificates(number,user_id,course_id,class_id,course_version,recipient_name,course_title,class_name,evidence,issued_at) SELECT ?,?,?,?,?,?,?,?,?,? WHERE ${guard.sql} AND EXISTS(SELECT 1 FROM users u WHERE u.id=? AND ${profileNameSql(d)}=?) AND EXISTS(SELECT 1 FROM cohorts WHERE id=? AND version=? AND name=?) ${databaseSql(d,"","ON DUPLICATE KEY UPDATE number=number")}`).bind(number,u.id,courseId,classId,c.version,name,c.title,classRow.name,evidence,issuedAt,...guard.binds,u.id,name,classId,classRow.version,classRow.name).run();
  const saved=await existing(d,u,courseId,classId);
  if(!saved||saved.revokedAt)throw new AccessError(409,"Materi, tugas, hasil review atau akses berubah saat penerbitan.");
  await assertAcademicRead(d,ctx);
  return saved;
}
export async function listCertificates(d: PlatformDatabase, u: User, admin = false) {
  const guard=await authorizationGuard(d,u,admin?'owner':'student');
  const rows=(await d.prepare(`SELECT ${columns} FROM certificates ${admin ? '' : 'WHERE user_id=?'} ORDER BY issued_at DESC,number DESC LIMIT 200`).bind(...(admin ? [] : [u.id])).all<Certificate>()).results;
  if(!await d.prepare(`SELECT 1 WHERE ${guard.sql}`).bind(...guard.binds).first())throw new AccessError(403,'Hak akses berubah. Muat ulang sertifikat.');return rows;
}
export async function ownedCertificate(d: PlatformDatabase, u: User, number: string) {
  const guard=await authorizationGuard(d,u,'student');
  const cert = await d.prepare(`SELECT ${columns} FROM certificates WHERE number=? AND user_id=?`).bind(number, u.id).first<Certificate>();
  if (!cert)
    throw new AccessError(404, "Sertifikat tidak ditemukan.");
  if (cert.revokedAt)
    throw new AccessError(410, "Sertifikat telah dicabut.");
  if(!await d.prepare(`SELECT 1 WHERE ${guard.sql}`).bind(...guard.binds).first())throw new AccessError(403,'Hak akses berubah. Muat ulang sertifikat.');return cert;
}
export async function ownedCertificatePdf(d:PlatformDatabase,u:User,number:string,origin:string,render=certificatePdf){
  const guard=await authorizationGuard(d,u,'student'),certificate=await ownedCertificate(d,u,number),bytes=await render(certificate,origin);
  if(!await d.prepare(`SELECT 1 WHERE ${guard.sql}`).bind(...guard.binds).first())throw new AccessError(403,'Hak akses berubah. Muat ulang sertifikat.');
  if(!await d.prepare('SELECT 1 FROM certificates WHERE number=? AND user_id=? AND revoked_at IS NULL').bind(number,u.id).first())throw new AccessError(410,'Sertifikat telah dicabut.');
  return {certificate,bytes};
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
  const guard=await authorizationGuard(d,u,"owner");
  const r = await d.prepare(`UPDATE certificates SET revoked_at=?,revoked_by=?,revoke_reason=? WHERE number=? AND revoked_at IS NULL AND ${guard.sql}`).bind(new Date().toISOString(),u.id,reason,number,...guard.binds).run();
  if (!r.meta.changes)
    throw new AccessError(409, "Sertifikat sudah dicabut, tidak ditemukan, atau akses pengelola berubah.");
  return { ok: true };
}
