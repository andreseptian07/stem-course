import {authorizationGuard,policySql} from "./authorization.ts";
import {concurrentRead} from './concurrent-read.ts';
import {AccessError} from "./access-error.ts";
import type {PlatformDatabase} from "./database.ts";
import type {Course,PublicCourse} from "./model";
// Preview has no progress, attempt, enrollment, RSVP or certificate writes.
export function previewCourse(course:Course):PublicCourse{return {...course,lessons:course.lessons.map(({quiz,exercise,...lesson})=>({...lesson,locked:false,quiz:quiz?{...quiz,questions:quiz.questions.map(({id,prompt,options})=>({id,prompt,options}))}:undefined,exercise:exercise?{...exercise,tests:exercise.tests.filter(t=>!t.hidden),hiddenCount:exercise.tests.filter(t=>t.hidden).length}:undefined}))};}
export async function readPreview(d:PlatformDatabase,u:{id:string},courseId:string){
  const guard=await authorizationGuard(d,u,'preview',courseId);
  const row=await d.prepare(`SELECT data,version FROM courses WHERE id=? AND ${guard.sql}`).bind(courseId,...guard.binds).first<{data:string;version:number}>();
  if(!row)throw new AccessError(404,'Pratinjau tidak tersedia.');
  if(!await d.prepare(`SELECT 1 FROM courses WHERE id=? AND version=? AND ${guard.sql}`).bind(courseId,row.version,...guard.binds).first())throw new AccessError(403,'Penugasan atau materi berubah. Muat ulang pratinjau.');
  return {course:previewCourse({...JSON.parse(row.data),version:row.version}),mode:'preview'};
}
export async function previewList(d:PlatformDatabase,u:{id:string}){
  const actor=await authorizationGuard(d,u,'preview');
  const scopes=(await d.prepare(`SELECT id,version FROM courses WHERE ${policySql('preview','courses.id')} ORDER BY id`).bind(u.id).all<{id:string;version:number}>()).results;
  const guards=new Map(await concurrentRead(scopes,async c=>{
    const guard=await authorizationGuard(d,u,'preview',c.id);
    guard.sql+=' AND EXISTS(SELECT 1 FROM courses WHERE id=? AND version=?)';guard.binds.push(c.id,c.version);return [c.id,guard] as const;
  }));
  const rows=(await d.prepare(`SELECT id,json_extract(data,'$.title') AS title FROM courses WHERE ${policySql('preview','courses.id')} AND ${actor.sql} ORDER BY id`).bind(u.id,...actor.binds).all<{id:string;title:string}>()).results.filter(c=>guards.has(c.id));
  for(const c of rows){const guard=guards.get(c.id)!;if(!await d.prepare(`SELECT 1 WHERE ${guard.sql}`).bind(...guard.binds).first())throw new AccessError(403,'Penugasan atau materi berubah. Muat ulang pratinjau.');}
  if(!await d.prepare(`SELECT 1 WHERE ${actor.sql}`).bind(...actor.binds).first())throw new AccessError(403,'Hak akun berubah. Muat ulang pratinjau.');return rows;
}
