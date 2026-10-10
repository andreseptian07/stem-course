import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { AccessError } from "./access-error.ts";
import { appOrigin } from "./auth-policy.ts";
import { databaseSql, type PlatformDatabase, type DatabaseValue } from "./database.ts";

export type AccountKind = "student" | "staff" | "unclassified";
export type StaffCapability = "tutor" | "curriculum";
export type AccessContext = {
  id: string; name: string; role: string; kind: AccountKind; owner: boolean;
  accessStatus: "active" | "pending" | "suspended"; accessVersion: number; principalVersion: number;
  capabilities: { tutor: boolean; curriculum: boolean };
  grantVersions: { tutor: number; curriculum: number };
};
export type Permission = "account" | "student" | "owner" | "tutor" | "curriculum" | "class" | "studentClass" | "preview";

// Identifiers here are code-owned SQL expressions, never request input.
export const ownerSql = (id: string) => `EXISTS(SELECT 1 FROM settings WHERE \`key\`='owner' AND value=${id})`;
export function emailSql(id: string) {
  const fallback = process.env.AUTH_REQUIRE_EMAIL_VERIFICATION === "true" ? 1 : 0;
  const key = process.env.APP_URL
    ? "account_mail:" + createHash("sha256").update(appOrigin()).digest("hex").slice(0, 24)
    : null;
  if (!key && !fallback) return "1=1";
  const required = key
    ? `COALESCE((SELECT CASE WHEN CAST(json_extract(value,'$.required') AS CHAR) IN ('1','true') THEN 1 ELSE 0 END FROM settings WHERE \`key\`='${key}'),${fallback})`
    : String(fallback);
  return `(${ownerSql(id)} OR ${required}=0 OR EXISTS(SELECT 1 FROM auth_email_status ev JOIN auth_credentials ec ON ec.user_id=ev.user_id AND ec.email=ev.email WHERE ev.user_id=${id} AND ev.verified_at IS NOT NULL))`;
}
export const readySql = (id: string) => `EXISTS(SELECT 1 FROM account_principals rp JOIN user_access ra ON ra.user_id=rp.user_id WHERE rp.user_id=${id} AND rp.kind IN ('student','staff') AND (ra.status='active' OR ${ownerSql(id)}) AND ${emailSql(id)})`;
export const studentSql = (id: string) => `(${readySql(id)} AND NOT ${ownerSql(id)} AND EXISTS(SELECT 1 FROM account_principals sp WHERE sp.user_id=${id} AND sp.kind='student'))`;
export const grantSql = (id: string, capability: StaffCapability) => `(${readySql(id)} AND EXISTS(SELECT 1 FROM account_principals gp JOIN staff_grants gg ON gg.user_id=gp.user_id WHERE gp.user_id=${id} AND gp.kind='staff' AND gg.capability='${capability}' AND gg.active=1))`;
export const teachingSql = (id: string, c = "c") => `(${readySql(id)} AND (${ownerSql(id)} OR (${grantSql(id,"tutor")} AND ${c}.mentor_id=${id} AND ${c}.mentor_grant_version=(SELECT version FROM staff_grants WHERE user_id=${id} AND capability='tutor' AND active=1))))`;
export const curriculumSql = (id: string, course: string) => `(${readySql(id)} AND (${ownerSql(id)} OR (${grantSql(id,"curriculum")} AND EXISTS(SELECT 1 FROM curriculum_members cm JOIN staff_grants cg ON cg.user_id=cm.user_id AND cg.capability='curriculum' AND cg.active=1 AND cg.version=cm.grant_version WHERE cm.user_id=${id} AND cm.course_id=${course} AND cm.active=1))))`;
export const studentClassSql = (id: string, c = "c") => `(${studentSql(id)} AND EXISTS(SELECT 1 FROM cohort_members sm WHERE sm.class_id=${c}.id AND sm.user_id=${id} AND sm.status='approved'))`;

export function policySql(mode: Permission, scope?: string) {
  const id = "ap.user_id";
  let gate = readySql(id);
  if (mode === "owner") gate += ` AND ${ownerSql(id)}`;
  if (mode === "student") {
    gate += ` AND ${studentSql(id)}`;
    if (scope) gate += ` AND EXISTS(SELECT 1 FROM enrollments en JOIN courses lc ON lc.id=en.course_id WHERE en.user_id=${id} AND en.course_id=${scope} AND en.authorization_id!='' AND CAST(json_extract(lc.data,'$.published') AS CHAR) IN ('1','true'))`;
  }
  if (mode === "tutor") gate += scope
    ? ` AND EXISTS(SELECT 1 FROM cohorts auth_cohort WHERE auth_cohort.id=${scope} AND ${teachingSql(id,"auth_cohort")})`
    : ` AND (${ownerSql(id)} OR ${grantSql(id,"tutor")})`;
  if (mode === "curriculum") gate += scope ? ` AND ${curriculumSql(id,scope)}` : ` AND (${ownerSql(id)} OR ${grantSql(id,"curriculum")})`;
  if (mode === "studentClass") gate += ` AND EXISTS(SELECT 1 FROM cohorts auth_cohort WHERE auth_cohort.id=${scope} AND ${studentClassSql(id,"auth_cohort")})`;
  if (mode === "class") gate += ` AND EXISTS(SELECT 1 FROM cohorts auth_cohort WHERE auth_cohort.id=${scope} AND (${teachingSql(id,"auth_cohort")} OR ${studentClassSql(id,"auth_cohort")}))`;
  if (mode === "preview") gate += scope
    ? ` AND (${ownerSql(id)} OR ${curriculumSql(id,scope)} OR EXISTS(SELECT 1 FROM cohorts auth_cohort WHERE auth_cohort.course_id=${scope} AND auth_cohort.status!='archived' AND ${teachingSql(id,'auth_cohort')} AND CAST(json_extract((SELECT data FROM courses WHERE id=auth_cohort.course_id),'$.published') AS CHAR) IN ('1','true')))`
    : " AND ap.kind='staff'";
  return `EXISTS(SELECT 1 FROM account_principals ap WHERE ap.user_id=? AND ${gate})`;
}
export async function readAccessContext(d: PlatformDatabase, user: { id: string }): Promise<AccessContext> {
  const r = await d.prepare(`SELECT u.id,u.name,p.data AS profileData,a.status,a.version AS accessVersion,ap.kind,ap.version AS principalVersion,
    ${ownerSql("u.id")} AS isOwner,
    COALESCE((SELECT active FROM staff_grants WHERE user_id=u.id AND capability='tutor'),0) AS tutor,
    COALESCE((SELECT version FROM staff_grants WHERE user_id=u.id AND capability='tutor'),0) AS tutorVersion,
    COALESCE((SELECT active FROM staff_grants WHERE user_id=u.id AND capability='curriculum'),0) AS curriculum,
    COALESCE((SELECT version FROM staff_grants WHERE user_id=u.id AND capability='curriculum'),0) AS curriculumVersion
    FROM users u LEFT JOIN account_principals ap ON ap.user_id=u.id LEFT JOIN user_access a ON a.user_id=u.id LEFT JOIN profiles p ON p.user_id=u.id WHERE u.id=?`).bind(user.id).first<{
      id:string;name:string;profileData:string|null;status:AccessContext["accessStatus"]|null;accessVersion:number|null;kind:AccountKind|null;principalVersion:number|null;
      isOwner:number;tutor:number;tutorVersion:number;curriculum:number;curriculumVersion:number;
    }>();
  if (!r) throw new AccessError(401,"Silakan masuk kembali.");
  const kind = r.kind && ["student","staff"].includes(r.kind) ? r.kind : "unclassified";
  const owner = !!Number(r.isOwner);
  const capabilities = { tutor: kind === "staff" && !!Number(r.tutor), curriculum: kind === "staff" && !!Number(r.curriculum) };
  return { id:r.id,name:r.profileData ? JSON.parse(r.profileData).displayName || r.name : r.name,
    kind,owner,role:owner ? "owner" : kind === "student" ? "student" : capabilities.tutor ? "tutor" : capabilities.curriculum ? "curriculum" : kind,
    accessStatus: owner && kind === "staff" ? "active" : r.status || "pending",accessVersion:Number(r.accessVersion || 0),principalVersion:Number(r.principalVersion || 0),
    capabilities,grantVersions:{tutor:Number(r.tutorVersion),curriculum:Number(r.curriculumVersion)} };
}
export async function requirePermission(d: PlatformDatabase, u: { id:string }, mode: Permission, scope?: string) {
  const context = await readAccessContext(d,u);
  const sql = policySql(mode,scope ? "?" : undefined);
  // preview repeats the course expression three times; use the exact placeholder count.
  const count = (sql.match(/\?/g) || []).length;
  if (!await d.prepare(`SELECT 1 WHERE ${sql}`).bind(u.id,...Array(count-1).fill(scope)).first())
    throw new AccessError(scope ? 404 : 403,scope ? "Objek tidak tersedia untuk akun ini." : "Fitur ini tidak tersedia untuk akun ini.");
  return context;
}
export async function authorizationGuard(d: PlatformDatabase, u: { id:string }, mode: Permission, scope?: string) {
  const context = await requirePermission(d,u,mode,scope);
  const sql = policySql(mode,scope ? "?" : undefined);
  const binds: DatabaseValue[] = [u.id,...Array((sql.match(/\?/g)||[]).length-1).fill(scope)];
  let predicate = `${sql} AND EXISTS(SELECT 1 FROM account_principals snap JOIN user_access sa ON sa.user_id=snap.user_id WHERE snap.user_id=? AND snap.version=? AND sa.version=?)`;
  binds.push(u.id,context.principalVersion,context.accessVersion);
  if ((mode === "tutor" || mode === "curriculum") && !context.owner) {
    predicate += " AND EXISTS(SELECT 1 FROM staff_grants WHERE user_id=? AND capability=? AND active=1 AND version=?)";
    binds.push(u.id,mode,context.grantVersions[mode]);
  }
  if(context.owner) {predicate+=` AND ${ownerSql("?")}`;binds.push(u.id);}
  if(!context.owner&&context.kind==='staff'&&['account','class','preview'].includes(mode))for(const cap of ['tutor','curriculum'] as const){predicate+=" AND COALESCE((SELECT version FROM staff_grants WHERE user_id=? AND capability=?),0)=?";binds.push(u.id,cap,context.grantVersions[cap]);}
  if(mode==='curriculum'&&scope&&!context.owner){const member=await d.prepare('SELECT version FROM curriculum_members WHERE user_id=? AND course_id=? AND active=1').bind(u.id,scope).first<{version:number}>();if(!member)throw new AccessError(404,'Penugasan course tidak tersedia.');predicate+=' AND EXISTS(SELECT 1 FROM curriculum_members WHERE user_id=? AND course_id=? AND active=1 AND version=?)';binds.push(u.id,scope,member.version);}
  if(scope&&['class','tutor','studentClass'].includes(mode)){
    const row=await d.prepare('SELECT version FROM cohorts WHERE id=?').bind(scope).first<{version:number}>();
    if(!row)throw new AccessError(404,'Kelas tidak tersedia.');
    predicate+=' AND EXISTS(SELECT 1 FROM cohorts WHERE id=? AND version=?)';binds.push(scope,row.version);
    if(context.kind==='student'&&!context.owner){
      const member=await d.prepare("SELECT authorization_version FROM cohort_members WHERE class_id=? AND user_id=? AND status='approved'").bind(scope,u.id).first<{authorization_version:number}>();
      if(!member)throw new AccessError(404,'Keanggotaan kelas tidak tersedia.');
      predicate+=" AND EXISTS(SELECT 1 FROM cohort_members WHERE class_id=? AND user_id=? AND status='approved' AND authorization_version=?)";binds.push(scope,u.id,member.authorization_version);
    }
  }
  if(mode==='preview'&&scope&&!context.owner){
    const member=context.capabilities.curriculum?await d.prepare('SELECT version FROM curriculum_members WHERE user_id=? AND course_id=? AND active=1 AND grant_version=?').bind(u.id,scope,context.grantVersions.curriculum).first<{version:number}>():null;
    if(member){predicate+=' AND EXISTS(SELECT 1 FROM curriculum_members WHERE user_id=? AND course_id=? AND active=1 AND version=? AND grant_version=?)';binds.push(u.id,scope,member.version,context.grantVersions.curriculum);}
    else{
      const assignment=await d.prepare("SELECT id,version FROM cohorts WHERE course_id=? AND mentor_id=? AND mentor_grant_version=? AND status!='archived' ORDER BY id LIMIT 1").bind(scope,u.id,context.grantVersions.tutor).first<{id:string;version:number}>();
      if(!assignment)throw new AccessError(404,'Penugasan pratinjau tidak tersedia.');
      predicate+=" AND EXISTS(SELECT 1 FROM cohorts WHERE id=? AND version=? AND mentor_id=? AND mentor_grant_version=? AND status!='archived')";binds.push(assignment.id,assignment.version,u.id,context.grantVersions.tutor);
    }
  }
  return { context,sql:predicate,binds };
}

// Multi-class reads retain each assignment/membership generation until their
// final authority check. Global account grants alone cannot pin class scope.
export async function classReadSnapshot(d:PlatformDatabase,u:{id:string}) {
  const rows=(await d.prepare(`SELECT c.id,c.version,COALESCE((SELECT authorization_version FROM cohort_members WHERE class_id=c.id AND user_id=?),0) AS membershipVersion FROM cohorts c WHERE ${policySql('class','c.id')}`).bind(u.id,u.id).all<{id:string;version:number;membershipVersion:number}>()).results;
  return new Map(rows.map(r=>[r.id,JSON.stringify([r.version,r.membershipVersion])]));
}
export async function assertClassRead(d:PlatformDatabase,u:{id:string},before:Map<string,string>,ids:string[]) {
  if(!ids.length)return;
  const after=await classReadSnapshot(d,u);
  if(ids.some(id=>!before.has(id)||before.get(id)!==after.get(id)))throw new AccessError(403,'Penugasan atau keanggotaan berubah. Muat ulang halaman.');
}

export async function permissionEvents(d:PlatformDatabase,u:{id:string}) {
  const guard=await authorizationGuard(d,u,'owner');
  const events=(await d.prepare(`SELECT id,actor_id AS actorId,target_id AS targetId,kind,capability,scope_id AS scopeId,reason,data,created_at AS createdAt FROM authorization_events WHERE ${guard.sql} ORDER BY created_at DESC,id DESC LIMIT 100`).bind(...guard.binds).all()).results;
  if(!await d.prepare(`SELECT 1 WHERE ${guard.sql}`).bind(...guard.binds).first())throw new AccessError(403,'Hak pengelola berubah. Muat ulang halaman.');
  return {events};
}

const id = z.string().min(1).max(80).regex(/^[a-zA-Z0-9_-]+$/);
const fields = { targetId:id,capability:z.enum(["tutor","curriculum"]),principalVersion:z.number().int().positive(),grantVersion:z.number().int().nonnegative(),reason:z.string().trim().min(1).max(1000) };
export const permissionMutation = z.discriminatedUnion("action",[
  z.object({action:z.literal("makeStaff"),...fields}).strict(),
  z.object({action:z.literal("setGrant"),...fields,active:z.boolean()}).strict(),
]);
export async function changePermission(d: PlatformDatabase, actor: { id:string }, raw:unknown) {
  const b = permissionMutation.parse(raw), guard = await authorizationGuard(d,actor,"owner");
  const target = await readAccessContext(d,{id:b.targetId});
  if (target.owner || target.kind === "unclassified") throw new AccessError(400,"Pilih akun yang sudah diklasifikasi dan bukan Super Admin.");
  if (target.principalVersion !== b.principalVersion || target.grantVersions[b.capability] !== b.grantVersion)
    throw new AccessError(409,"Hak akses berubah. Muat ulang sebelum melanjutkan.");
  if (b.action === "makeStaff" ? target.kind !== "student" : target.kind !== "staff")
    throw new AccessError(400,"Jenis akun tidak sesuai dengan tindakan ini.");
  const active = b.action === "makeStaff" || b.active;
  if (active) await requirePermission(d,target,"account");
  if (b.action === "setGrant" && target.capabilities[b.capability] === active) {
    if(!await d.prepare(`SELECT 1 WHERE ${guard.sql}`).bind(...guard.binds).first())throw new AccessError(403,'Hak pengelola berubah. Muat ulang halaman.');
    return {saved:true,unchanged:true,user:target};
  }
  const proof = randomUUID(), time=new Date().toISOString();
  const targetGuard = `EXISTS(SELECT 1 FROM account_principals tp WHERE tp.user_id=? AND tp.version=? AND tp.kind=?) AND ${active ? readySql("?") : "1=1"}`;
  const tb:DatabaseValue[]=[target.id,b.principalVersion,target.kind];
  if (active) tb.push(...Array((readySql("?").match(/\?/g)||[]).length).fill(target.id));
  const writes=[];
  const grant = b.grantVersion
    ? d.prepare(`UPDATE staff_grants SET active=?,version=version+1,granted_by=?,updated_at=?,proof=? WHERE user_id=? AND capability=? AND version=? AND ${guard.sql} AND ${targetGuard}`).bind(active?1:0,actor.id,time,proof,target.id,b.capability,b.grantVersion,...guard.binds,...tb)
    : d.prepare(databaseSql(d,`INSERT OR IGNORE INTO staff_grants(user_id,capability,active,version,granted_by,updated_at,proof) SELECT ?,?,?,1,?,?,? WHERE ${guard.sql} AND ${targetGuard}`,`INSERT INTO staff_grants(user_id,capability,active,version,granted_by,updated_at,proof) SELECT ?,?,?,1,?,?,? WHERE ${guard.sql} AND ${targetGuard} ON DUPLICATE KEY UPDATE user_id=user_id`)).bind(target.id,b.capability,active?1:0,actor.id,time,proof,...guard.binds,...tb);
  writes.push(grant);
  const succeeded="EXISTS(SELECT 1 FROM staff_grants WHERE user_id=? AND capability=? AND proof=?)";
  const sb=[target.id,b.capability,proof];
  if (b.action === "makeStaff") writes.push(d.prepare(`UPDATE account_principals SET kind='staff',version=version+1,updated_by=?,updated_at=?,proof=? WHERE user_id=? AND version=? AND ${succeeded}`).bind(actor.id,time,proof,target.id,b.principalVersion,...sb));
  if (!active && b.capability === "tutor") writes.push(d.prepare(`UPDATE tutor_invitations SET revoked_at=? WHERE email=(SELECT email FROM auth_credentials WHERE user_id=?) AND accepted_at IS NULL AND revoked_at IS NULL AND ${succeeded}`).bind(time,target.id,...sb));
  writes.push(d.prepare(`INSERT INTO authorization_events(id,actor_id,target_id,kind,capability,reason,data,created_at) SELECT ?,?,?,?,?,?,?,? WHERE ${succeeded}`).bind(proof,actor.id,target.id,b.action,b.capability,b.reason,JSON.stringify({before:{kind:target.kind,grantVersion:b.grantVersion},after:{kind:"staff",active,grantVersion:b.grantVersion+1}}),time,...sb));
  const result=await d.batch(writes);
  if (!result[0].meta.changes) throw new AccessError(409,"Hak akses berubah. Muat ulang sebelum melanjutkan.");
  const user=await readAccessContext(d,target);
  if(!await d.prepare(`SELECT 1 WHERE ${guard.sql}`).bind(...guard.binds).first())throw new AccessError(403,'Hak pengelola berubah. Muat ulang untuk memeriksa hasil perubahan.');
  return {saved:true,user};
}
