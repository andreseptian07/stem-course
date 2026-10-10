import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { AccessError } from "./access-error.ts";
import { databaseSql, type PlatformDatabase } from "./database.ts";

const mapping = z.object({
  userId:z.string().min(1).max(191),kind:z.enum(["student","staff"]),
  capabilities:z.array(z.enum(["tutor","curriculum"])).max(2),
  classIds:z.array(z.string()).default([]),courseIds:z.array(z.string()).default([]),
  reason:z.string().trim().min(1).max(1000),
}).strict().refine(r => new Set(r.capabilities).size===r.capabilities.length && (r.kind === "staff" || !r.capabilities.length));
export const backfillPlan = z.object({sourceHash:z.string().regex(/^[a-f0-9]{64}$/),overrides:z.array(mapping)}).strict();

export async function authorizationInventory(d: PlatformDatabase) {
  const owner=await d.prepare("SELECT value FROM settings WHERE `key`='owner'").first<{value:string}>();
  if (!owner) throw new AccessError(503,"Owner belum tersedia.");
  const users=(await d.prepare("SELECT id,role FROM users ORDER BY id").all<{id:string;role:string}>()).results;
  const tutors=(await d.prepare("SELECT user_id,active,granted_by,granted_at,revoked_at FROM tutor_accounts ORDER BY user_id").all<{user_id:string;active:number;granted_by:string;granted_at:string;revoked_at:string|null}>()).results;
  const mentors=(await d.prepare("SELECT id,course_id,mentor_id,status,version FROM cohorts WHERE mentor_id IS NOT NULL ORDER BY id").all<{id:string;course_id:string;mentor_id:string;status:string;version:number}>()).results;
  const members=(await d.prepare("SELECT user_id,course_id,active,version,granted_by FROM curriculum_members ORDER BY user_id,course_id").all<{user_id:string;course_id:string;active:number;version:number;granted_by:string}>()).results;
  const courses=(await d.prepare('SELECT id FROM courses ORDER BY id').all<{id:string}>()).results;
  const userIds=new Set(users.map(u=>u.id)),courseIds=new Set(courses.map(c=>c.id));
  const orphans=[...(!userIds.has(owner.value)?[{table:'settings',field:'owner',id:owner.value}]:[]),
    ...tutors.filter(t=>!userIds.has(t.user_id)).map(t=>({table:'tutor_accounts',field:'user_id',id:t.user_id})),
    ...mentors.flatMap(c=>[...(!userIds.has(c.mentor_id)?[{table:'cohorts',field:'mentor_id',id:c.id}]:[]),...(!courseIds.has(c.course_id)?[{table:'cohorts',field:'course_id',id:c.id}]:[])]),
    ...members.flatMap(m=>[...(!userIds.has(m.user_id)?[{table:'curriculum_members',field:'user_id',id:m.user_id}]:[]),...(!courseIds.has(m.course_id)?[{table:'curriculum_members',field:'course_id',id:m.course_id}]:[])])];
  const sourceHash=createHash('sha256').update(JSON.stringify({owner:owner.value,users,tutors,mentors,members,courses})).digest('hex');
  const rows=users.map(u=>{
    const t=tutors.find(t=>t.user_id===u.id), classes=mentors.filter(c=>c.mentor_id===u.id).map(c=>c.id), courses=members.filter(m=>m.user_id===u.id&&Number(m.active)).map(m=>m.course_id);
    let kind:"student"|"staff"|"unclassified"="student", capabilities:("tutor"|"curriculum")[]=[];
    let reason="Akun biasa tanpa bukti staf.";
    if (u.id===owner.value) {kind="staff";reason="Owner otoritatif dari settings.";}
    else if (t?.granted_by===owner.value && !courses.length) {kind="staff";capabilities=Number(t.active)?["tutor"]:[];reason="Pemberian/riwayat Tutor sah; riwayat tetap staf.";}
    else if (courses.length || classes.length || t || u.role!=="student") {kind="unclassified";reason="Penugasan/role legacy perlu pemetaan eksplisit.";}
    return {userId:u.id,kind,capabilities,classIds:capabilities.includes("tutor")?classes:[],courseIds:[],reason,evidence:{legacyRole:u.role,tutorRecord:!!t,mentorClassIds:classes,curriculumCourseIds:courses}};
  });
  return {sourceHash,ownerId:owner.value,rows,orphans,source:{users,tutors,mentors,members,courses}};
}

// Called only by the operator migration command, not an HTTP route. A complete,
// source-bound plan is required before any classification mutation begins.
export async function backfillAuthorization(d: PlatformDatabase, raw:unknown) {
  const plan=backfillPlan.parse(raw), inventory=await authorizationInventory(d);
  if(inventory.orphans.length)throw new AccessError(409,'Referensi sumber memiliki akun atau course yang hilang. Tidak ada perubahan klasifikasi.');
  if (plan.sourceHash!==inventory.sourceHash) throw new AccessError(409,"Source inventaris berubah. Buat ulang dry run.");
  if (new Set(plan.overrides.map(r=>r.userId)).size!==plan.overrides.length || plan.overrides.some(r=>!inventory.rows.some(i=>i.userId===r.userId)))
    throw new AccessError(400,"Pemetaan memiliki ID ganda atau tidak dikenal.");
  const rows=inventory.rows.map(r=>plan.overrides.find(o=>o.userId===r.userId)||r);
  if (rows.some(r=>r.kind==="unclassified")) throw new AccessError(409,"Klasifikasi ambigu belum dipetakan; tidak ada perubahan data.");
  for (const r of rows) {
    if (r.userId===inventory.ownerId && (r.kind!=="staff" || r.capabilities.length)) throw new AccessError(400,"Owner tidak dapat diubah oleh mapping grant.");
    const evidence=inventory.rows.find(i=>i.userId===r.userId)!.evidence;
    if (r.classIds.some(id=>!evidence.mentorClassIds.includes(id)) || r.courseIds.some(id=>!evidence.curriculumCourseIds.includes(id)) || (r.classIds.length&&!r.capabilities.includes("tutor")) || (r.courseIds.length&&!r.capabilities.includes("curriculum")))
      throw new AccessError(400,"Scope pemetaan tidak cocok dengan penugasan sumber.");
  }
  // The adapter serializes application writers. Validate the complete source
  // inside that same transaction before any classification. A duplicate marker
  // deliberately aborts and rolls back the batch if the operator's plan is stale.
  const predicates=["EXISTS(SELECT 1 FROM settings WHERE `key`='owner' AND value=?)"],sourceBinds: (string|number|null)[]=[inventory.ownerId];
  const sources=[
    {table:'users',where:'1=1',rows:inventory.source.users,keys:['id','role']},
    {table:'tutor_accounts',where:'1=1',rows:inventory.source.tutors,keys:['user_id','active','granted_by','granted_at','revoked_at']},
    {table:'cohorts',where:'mentor_id IS NOT NULL',rows:inventory.source.mentors,keys:['id','course_id','mentor_id','status','version']},
    {table:'curriculum_members',where:'1=1',rows:inventory.source.members,keys:['user_id','course_id','active','version','granted_by']},
    {table:'courses',where:'1=1',rows:inventory.source.courses,keys:['id']},
  ];
  for(const source of sources){
    predicates.push(`(SELECT count(*) FROM ${source.table} WHERE ${source.where})=?`);sourceBinds.push(source.rows.length);
    for(const row of source.rows){
      predicates.push(`EXISTS(SELECT 1 FROM ${source.table} WHERE ${source.keys.map(key=>databaseSql(d,`${key} IS ?`,`${key} <=> ?`)).join(' AND ')})`);
      for(const key of source.keys)sourceBinds.push((row as Record<string,string|number|null>)[key]);
    }
  }
  const marker='authorization_backfill_guard:'+randomUUID(),time=new Date().toISOString(),writes=[
    d.prepare("INSERT INTO settings(`key`,value) VALUES(?,?)").bind(marker,inventory.sourceHash),
    d.prepare(`INSERT INTO settings(\`key\`,value) SELECT ?,? WHERE NOT (${predicates.join(' AND ')})`).bind(marker,inventory.sourceHash,...sourceBinds),
  ],principalIndexes:number[]=[];
  for (const r of rows) {
    const existing=await d.prepare("SELECT kind FROM account_principals WHERE user_id=?").bind(r.userId).first<{kind:string}>();
    if (existing) {
      if (existing.kind!==r.kind) throw new AccessError(409,"Principal sudah diklasifikasi berbeda. Gunakan alur perubahan akses.");
      continue;
    }
    const proof=randomUUID();
    principalIndexes.push(writes.length);
    writes.push(d.prepare(databaseSql(d,
      "INSERT OR IGNORE INTO account_principals(user_id,kind,version,updated_by,updated_at,proof) SELECT ?,?,1,?,?,? WHERE ?=(SELECT value FROM settings WHERE key='owner')",
      "INSERT INTO account_principals(user_id,kind,version,updated_by,updated_at,proof) SELECT ?,?,1,?,?,? WHERE ?=(SELECT value FROM settings WHERE `key`='owner') ON DUPLICATE KEY UPDATE user_id=user_id"))
      .bind(r.userId,r.kind,inventory.ownerId,time,proof,inventory.ownerId));
    const inserted="EXISTS(SELECT 1 FROM account_principals WHERE user_id=? AND proof=?)";
    for (const cap of r.capabilities) writes.push(d.prepare(`INSERT INTO staff_grants(user_id,capability,active,version,granted_by,updated_at,proof) SELECT ?,?,1,1,?,?,? WHERE ${inserted}`).bind(r.userId,cap,inventory.ownerId,time,proof,r.userId,proof));
    for (const id of r.classIds) writes.push(d.prepare(`UPDATE cohorts SET mentor_grant_version=1 WHERE id=? AND mentor_id=? AND ${inserted}`).bind(id,r.userId,r.userId,proof));
    for (const id of r.courseIds) writes.push(d.prepare(`UPDATE curriculum_members SET grant_version=1 WHERE course_id=? AND user_id=? AND active=1 AND ${inserted}`).bind(id,r.userId,r.userId,proof));
    writes.push(d.prepare(`INSERT INTO authorization_events(id,actor_id,target_id,kind,reason,data,created_at) SELECT ?,?,?,'backfill',?,?,? WHERE ${inserted}`).bind(proof,inventory.ownerId,r.userId,r.reason,JSON.stringify({sourceHash:inventory.sourceHash,kind:r.kind,capabilities:r.capabilities,classIds:r.classIds,courseIds:r.courseIds}),time,r.userId,proof));
  }
  // IDs are deterministic per legacy relation and never refreshed on retry.
  const enrollments=(await d.prepare("SELECT user_id,course_id,created_at FROM enrollments WHERE authorization_id='' ORDER BY user_id,course_id").all<{user_id:string;course_id:string;created_at:string}>()).results;
  for (const e of enrollments) writes.push(d.prepare("UPDATE enrollments SET authorization_id=? WHERE user_id=? AND course_id=? AND authorization_id=''").bind(createHash("sha256").update(JSON.stringify([e.user_id,e.course_id,e.created_at])).digest("hex").slice(0,48),e.user_id,e.course_id));
  writes.push(d.prepare("DELETE FROM settings WHERE `key`=?").bind(marker));
  let results;
  try{results=await d.batch(writes);}catch(e){
    const code=e&&typeof e==='object'&&'code' in e?e.code:'';
    if(code==='ER_DUP_ENTRY'||(e instanceof Error&&e.message.includes('UNIQUE constraint failed: settings.key')))throw new AccessError(409,'Source inventaris atau klasifikasi berubah; transaksi dibatalkan. Buat ulang dry run.');
    throw e;
  }
  return {classified:rows.length,created:principalIndexes.reduce((n,i)=>n+Number(results[i].meta.changes),0),writes:writes.length-3,sourceHash:inventory.sourceHash};
}
