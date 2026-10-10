import type {PlatformDatabase} from './database.ts';
import {AccessError} from './access-error.ts';
import {policySql,requirePermission} from './authorization.ts';
export const curriculumPredicate=policySql('curriculum','?');
export const curriculumBindings=(id:string,courseId:string)=>[id,courseId];
export async function hasCurriculumAccess(d:PlatformDatabase,u:{id:string},courseId:string){
  return !!await d.prepare(`SELECT 1 WHERE ${curriculumPredicate}`).bind(...curriculumBindings(u.id,courseId)).first();
}
export async function requireCurriculumAccess(d:PlatformDatabase,u:{id:string},courseId:string){
  await requirePermission(d,u,'curriculum');
  if(!await hasCurriculumAccess(d,u,courseId))throw new AccessError(404,'Course tidak tersedia untuk akun ini.');
}
export async function curriculumEnabled(d:PlatformDatabase,u:{id:string}){
  return !!await d.prepare(`SELECT 1 WHERE ${policySql('curriculum')}`).bind(u.id).first();
}
