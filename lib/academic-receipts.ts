import {createHash} from "node:crypto";
import type {PlatformDatabase} from "./database.ts";
import {AccessError} from "./access-error.ts";
function canonical(value:unknown):unknown{
  if(Array.isArray(value))return value.map(canonical);
  if(value&&typeof value==="object")return Object.fromEntries(Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,canonical(v)]));
  return value;
}
export function mutationDigest(payload:unknown){return createHash("sha256").update(JSON.stringify(canonical(payload))).digest("hex");}
export async function readAcademicReceipt<T>(d:PlatformDatabase,actorId:string,action:string,requestId:string,payload:unknown):Promise<T|null>{
  const row=await d.prepare("SELECT digest,result FROM academic_mutation_receipts WHERE actor_id=? AND action=? AND request_id=?").bind(actorId,action,requestId).first<{digest:string;result:string}>();
  if(!row)return null;
  if(row.digest!==mutationDigest(payload))throw new AccessError(409,"ID permintaan sudah digunakan untuk isian berbeda. Muat ulang hasil penyimpanan.");
  return JSON.parse(row.result) as T;
}
export function academicReceipt(d:PlatformDatabase,actorId:string,action:string,requestId:string,payload:unknown,result:unknown,predicate:string,binds:(string|number|boolean|null)[]){
  return d.prepare(`INSERT INTO academic_mutation_receipts(actor_id,action,request_id,digest,result,created_at) SELECT ?,?,?,?,?,? WHERE ${predicate} AND NOT EXISTS(SELECT 1 FROM academic_mutation_receipts WHERE actor_id=? AND action=? AND request_id=?)`).bind(actorId,action,requestId,mutationDigest(payload),JSON.stringify(result),new Date().toISOString(),...binds,actorId,action,requestId);
}
