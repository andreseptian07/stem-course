import assert from 'node:assert/strict';
import {authorizationInventory,backfillAuthorization} from '../lib/authorization-migration.ts';
import {readAccessContext,changePermission} from '../lib/authorization.ts';
export async function migrationScenarios(t,d){
 const time='2026-10-09',owner='migration-owner';
 await d.prepare("INSERT INTO settings(`key`,value) VALUES('owner',?)").bind(owner).run();
 for(const [id,role] of [[owner,'owner'],['legacy-tutor','tutor'],['legacy-revoked','student'],['legacy-cur','student'],['legacy-wrong','student'],['legacy-student','student']]){
  await d.prepare('INSERT INTO users(id,name,role) VALUES(?,?,?)').bind(id,id,role).run();
  await d.prepare("INSERT INTO user_access(user_id,status,version,created_at,updated_at) VALUES(?,'active',1,?,?)").bind(id,time,time).run();
 }
 await d.prepare("INSERT INTO courses(id,data,version) VALUES('migration-course','{}',1)").run();
 for(const [id,active,revoked] of [['legacy-tutor',1,null],['legacy-revoked',0,time]])await d.prepare('INSERT INTO tutor_accounts(user_id,active,granted_by,granted_at,revoked_at) VALUES(?,?,?,?,?)').bind(id,active,owner,time,revoked).run();
 await d.prepare("INSERT INTO cohorts(id,course_id,mentor_id,name,capacity,status,created_at) VALUES('migration-class','migration-course','legacy-tutor','Legacy',10,'active',?)").bind(time).run();
 for(const id of ['legacy-cur','legacy-wrong'])await d.prepare("INSERT INTO curriculum_members(user_id,course_id,active,version,granted_by,updated_at,proof) VALUES(?,'migration-course',1,3,?,?,?)").bind(id,owner,time,'source:'+id).run();
 for(const id of ['legacy-tutor','legacy-student'])await d.prepare("INSERT INTO enrollments(user_id,course_id,created_at) VALUES(?,'migration-course',?)").bind(id,time).run();
 await d.prepare("INSERT INTO progress(user_id,course_id,lesson_id,revision,complete,score) VALUES('legacy-tutor','migration-course','one',2,1,88)").run();
 const progressBefore=(await d.prepare('SELECT * FROM progress').all()).results;
 const noClassification=async()=>{assert.equal(Number((await d.prepare('SELECT count(*) n FROM account_principals').first()).n),0);assert.equal(Number((await d.prepare('SELECT count(*) n FROM authorization_events').first()).n),0);assert.equal(Number((await d.prepare("SELECT count(*) n FROM enrollments WHERE authorization_id!=''").first()).n),0);assert.equal(Number((await d.prepare("SELECT count(*) n FROM settings WHERE `key` LIKE 'authorization_backfill_guard:%'").first()).n),0);};
 const planFor=inv=>({sourceHash:inv.sourceHash,overrides:[{userId:'legacy-cur',kind:'staff',capabilities:['curriculum'],classIds:[],courseIds:['migration-course'],reason:'Reviewed curriculum staff'},{userId:'legacy-wrong',kind:'student',capabilities:[],classIds:[],courseIds:[],reason:'Incorrect source assignment; keep learner'}]});
 let inv;
 await t.test('T2-063/066: dry run finds ambiguity and does not change authorization or history',async()=>{
  inv=await authorizationInventory(d);await noClassification();assert.equal(inv.rows.find(x=>x.userId==='legacy-cur').kind,'unclassified');assert.equal(inv.rows.find(x=>x.userId==='legacy-revoked').kind,'staff');
  await assert.rejects(backfillAuthorization(d,{sourceHash:inv.sourceHash,overrides:[]}),e=>e.status===409);await noClassification();
 });
 await t.test('T2-066: orphan identities and courses prevent classification without guessing permissions',async()=>{
  await d.prepare("INSERT INTO curriculum_members(user_id,course_id,active,version,granted_by,updated_at,proof) VALUES('orphan-user','missing-course',1,1,?,?,'orphan')").bind(owner,time).run();
  const broken=await authorizationInventory(d);assert.equal(broken.orphans.length,2);
  await assert.rejects(backfillAuthorization(d,planFor(broken)),e=>e.status===409);await noClassification();
  await d.prepare("DELETE FROM curriculum_members WHERE user_id='orphan-user'").run();
  inv=await authorizationInventory(d);
 });
 await t.test('T2-067: a database failure rolls back every principal, grant, audit and enrollment ID',async()=>{
  const failing={dialect:d.dialect,prepare:d.prepare.bind(d),batch:statements=>d.batch([...statements,d.prepare('INSERT INTO deliberately_missing_backfill_table(id) VALUES(?)').bind('abort')])};
  await assert.rejects(backfillAuthorization(failing,planFor(inv)));await noClassification();assert.deepEqual((await d.prepare('SELECT * FROM progress').all()).results,progressBefore);
 });
 await t.test('T2-066/067: source changes after inventory invalidate the whole transaction',async()=>{
  const raced={dialect:d.dialect,prepare:d.prepare.bind(d),async batch(statements){await d.prepare("UPDATE cohorts SET version=version+1 WHERE id='migration-class'").run();return d.batch(statements);}};
  await assert.rejects(backfillAuthorization(raced,planFor(inv)),e=>e.status===409);await noClassification();
  inv=await authorizationInventory(d);
 });
 await t.test('T2-064/065: reviewed backfill preserves history; retry cannot resurrect revoked staff permissions',async()=>{
  const first=await backfillAuthorization(d,planFor(inv));assert.equal(first.created,6);
  assert.deepEqual((await d.prepare('SELECT * FROM progress').all()).results,progressBefore);
  assert.equal((await readAccessContext(d,{id:'legacy-wrong'})).kind,'student');assert.equal((await readAccessContext(d,{id:'legacy-revoked'})).kind,'staff');assert.equal((await readAccessContext(d,{id:'legacy-cur'})).capabilities.curriculum,true);
  const enrollment=(await d.prepare('SELECT * FROM enrollments ORDER BY user_id').all()).results;assert.ok(enrollment.every(e=>e.authorization_id&&e.created_at===time));
  const tutor=await readAccessContext(d,{id:'legacy-tutor'});
  await changePermission(d,{id:owner},{action:'setGrant',targetId:tutor.id,capability:'tutor',principalVersion:tutor.principalVersion,grantVersion:tutor.grantVersions.tutor,active:false,reason:'Explicit revoke after migration'});
  const events=Number((await d.prepare('SELECT count(*) n FROM authorization_events').first()).n);
  assert.equal((await backfillAuthorization(d,planFor(inv))).created,0);assert.equal((await readAccessContext(d,tutor)).capabilities.tutor,false);assert.equal(Number((await d.prepare('SELECT count(*) n FROM authorization_events').first()).n),events);
  assert.deepEqual((await d.prepare('SELECT * FROM enrollments ORDER BY user_id').all()).results,enrollment);
  assert.equal(Number((await d.prepare("SELECT count(*) n FROM settings WHERE `key` LIKE 'authorization_backfill_guard:%'").first()).n),0);
 });
}
