import {AccessError} from "./access-error.ts";
import type {PlatformDatabase} from './database.ts';
import {policySql,requirePermission,authorizationGuard} from './authorization.ts';
// Personal learning is independent of work preview and staff assignments.
export const learningCoursePredicate=(courseId:string)=>policySql('student',courseId);
export const learningCourseBindings=(id:string)=>[id];
export async function requireLearningCourse(d:PlatformDatabase,user:{id:string},courseId:string){
  await requirePermission(d,user,'student');
  return requirePermission(d,user,'student',courseId);
}

export type LearningProof={accessVersion:number;principalVersion:number;enrollmentId:string;courseVersion:number};
export async function learningAuthorization(d:PlatformDatabase,user:{id:string},courseId:string){
  await requirePermission(d,user,'student');
  const guard=await authorizationGuard(d,user,'student',courseId);
  const row=await d.prepare('SELECT e.authorization_id,c.version FROM enrollments e JOIN courses c ON c.id=e.course_id WHERE e.user_id=? AND e.course_id=?').bind(user.id,courseId).first<{authorization_id:string;version:number}>();
  if(!row)throw new AccessError(404,'Course tidak tersedia.');
  const proof:LearningProof={accessVersion:guard.context.accessVersion,principalVersion:guard.context.principalVersion,enrollmentId:row.authorization_id,courseVersion:Number(row.version)};
  const persisted=learningProofPredicate(user.id,courseId,proof);
  return {...guard,sql:persisted.sql,binds:persisted.binds,proof};
}
export function learningProofPredicate(userId:string,courseId:string,proof:LearningProof){
  const sql=`${policySql('student','?')} AND EXISTS(SELECT 1 FROM account_principals p JOIN user_access a ON a.user_id=p.user_id WHERE p.user_id=? AND p.version=? AND a.version=?) AND EXISTS(SELECT 1 FROM enrollments WHERE user_id=? AND course_id=? AND authorization_id=?) AND EXISTS(SELECT 1 FROM courses WHERE id=? AND version=?)`;
  return {sql,binds:[userId,courseId,userId,proof.principalVersion,proof.accessVersion,userId,courseId,proof.enrollmentId,courseId,proof.courseVersion]};
}

export async function learningReadSnapshot(d:PlatformDatabase,user:{id:string}) {
  const rows=(await d.prepare(`SELECT e.course_id,e.authorization_id,c.version FROM enrollments e JOIN courses c ON c.id=e.course_id WHERE e.user_id=? AND ${policySql('student','c.id')}`).bind(user.id,user.id).all<{course_id:string;authorization_id:string;version:number}>()).results;
  return new Map(rows.map(r=>[r.course_id,JSON.stringify([r.authorization_id,r.version])]));
}
export async function assertLearningRead(d:PlatformDatabase,user:{id:string},before:Map<string,string>,courseIds:string[]) {
  if(!courseIds.length)return;
  const current=await learningReadSnapshot(d,user);
  if(courseIds.some(id=>!before.has(id)||current.get(id)!==before.get(id)))throw new AccessError(403,'Hak atau materi belajar berubah. Muat ulang halaman.');
}
