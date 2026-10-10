import test from 'node:test';
import assert from 'node:assert/strict';
import { authorizationDatabase,seedAccessUser } from './authorization-fixture.mjs';
import { readAccessContext,requirePermission,changePermission,permissionMutation,authorizationGuard } from '../lib/authorization.ts';
import { authorizationInventory,backfillAuthorization } from '../lib/authorization-migration.ts';
const status=n=>e=>e.status===n;
async function fixture(){
  const f=authorizationDatabase(),{d}=f;
  await d.prepare("INSERT INTO settings(key,value) VALUES('owner','owner')").run();
  for(const [id,kind,caps] of [['owner','staff',[]],['s1','student',[]],['s2','student',[]],['ta','staff',['tutor']],['tb','staff',['tutor']],['q1','staff',['curriculum']],['q2','staff',['curriculum']],['tq','staff',['tutor','curriculum']],['f0','staff',[]],['m','unclassified',[]]])await seedAccessUser(d,id,kind,caps);
  for(const id of ['c1','c2'])await d.prepare('INSERT INTO courses(id,data,version) VALUES(?,?,1)').bind(id,JSON.stringify({id,published:true})).run();
  for(const [id,course,mentor] of [['k1','c1','ta'],['k2','c1','tb'],['k3','c2','tq']])await d.prepare("INSERT INTO cohorts(id,course_id,mentor_id,name,capacity,status,created_at) VALUES(?,?,?,?,10,'open','2026')").bind(id,course,mentor,id).run();
  for(const [id,course] of [['q1','c1'],['q2','c2'],['tq','c2']])await d.prepare("INSERT INTO curriculum_members(user_id,course_id,active,version,granted_by,updated_at,proof) VALUES(?,?,1,1,'owner','2026',?)").bind(id,course,`fixture:${id}`).run();
  for(const [user,cls] of [['s1','k1'],['s2','k2'],['ta','k1'],['owner','k1']])await d.prepare("INSERT INTO cohort_members(user_id,class_id,status,created_at) VALUES(?,?,'approved','2026')").bind(user,cls).run();
  for(const user of ['s1','ta','owner'])await d.prepare("INSERT INTO enrollments(user_id,course_id,created_at,authorization_id) VALUES(?,'c1','2026',?)").bind(user,`en:${user}`).run();
  return f;
}
test('T2-001/002/008: durable kind, independent grants and forged roles',async()=>{
  const {d,sql}=await fixture();
  try {
    const tq=await readAccessContext(d,{id:'tq'});assert.deepEqual(tq.capabilities,{tutor:true,curriculum:true});
    await d.prepare("UPDATE users SET role='owner' WHERE id='s1'").run();
    await assert.rejects(()=>requirePermission(d,{id:'s1',role:'owner'},'owner'),status(403));
    for(const id of ['owner','ta','q1','tq','f0'])await assert.rejects(()=>requirePermission(d,{id},'student'),status(403));
    await d.prepare("DELETE FROM cohorts WHERE mentor_id='ta'").run();
    assert.equal((await readAccessContext(d,{id:'ta'})).kind,'staff');await assert.rejects(()=>requirePermission(d,{id:'ta'},'student'),status(403));
    await assert.rejects(()=>requirePermission(d,{id:'m'},'account'),status(403));
  }finally{sql.close();}
});
test('T2-004/005/006/026/027/028: global and object policies reject unrelated scope',async()=>{
  const {d,sql}=await fixture();try{
    await requirePermission(d,{id:'s1'},'student','c1');await assert.rejects(()=>requirePermission(d,{id:'s2'},'student','c1'),status(404));
    await requirePermission(d,{id:'ta'},'tutor','k1');await assert.rejects(()=>requirePermission(d,{id:'ta'},'tutor','k2'),status(404));
    await requirePermission(d,{id:'q1'},'curriculum','c1');await assert.rejects(()=>requirePermission(d,{id:'q1'},'curriculum','c2'),status(404));
    await assert.rejects(()=>requirePermission(d,{id:'q1'},'tutor'),status(403));await assert.rejects(()=>requirePermission(d,{id:'s1'},'curriculum'),status(403));
    await requirePermission(d,{id:'ta'},'preview','c1');await assert.rejects(()=>requirePermission(d,{id:'ta'},'preview','c2'),status(404));
    await requirePermission(d,{id:'q1'},'preview','c1');await requirePermission(d,{id:'owner'},'preview','c2');
    await d.prepare("UPDATE user_access SET status='suspended',version=version+1 WHERE user_id='ta'").run();await assert.rejects(()=>requirePermission(d,{id:'ta'},'tutor','k1'),status(404));
  }finally{sql.close();}
});
test('T2-007/009/010/011: explicit promotion, independent revocation, generation and audit',async()=>{
  const {d,sql}=await fixture();try{
    const request={action:'makeStaff',targetId:'s1',capability:'tutor',principalVersion:1,grantVersion:0,reason:'Explicit staff conversion'};
    await assert.rejects(()=>changePermission(d,{id:'s2'},request),status(403));
    const promoted=await changePermission(d,{id:'owner'},request);assert.equal(promoted.user.kind,'staff');assert.equal(promoted.user.principalVersion,2);
    assert.equal((await d.prepare("SELECT count(*) n FROM enrollments WHERE user_id='s1'").first()).n,1);await assert.rejects(()=>requirePermission(d,{id:'s1'},'student','c1'),status(404));
    const revoke={action:'setGrant',targetId:'tq',capability:'tutor',active:false,principalVersion:1,grantVersion:1,reason:'Revoke tutor only'};
    await changePermission(d,{id:'owner'},revoke);await requirePermission(d,{id:'tq'},'curriculum','c2');await assert.rejects(()=>requirePermission(d,{id:'tq'},'tutor','k3'),status(404));
    await assert.rejects(()=>changePermission(d,{id:'owner'},revoke),status(409));
    await changePermission(d,{id:'owner'},{...revoke,active:true,grantVersion:2});await assert.rejects(()=>requirePermission(d,{id:'tq'},'tutor','k3'),status(404));
    await d.prepare("UPDATE cohorts SET mentor_grant_version=3 WHERE id='k3'").run();await requirePermission(d,{id:'tq'},'tutor','k3');
    const before=(await d.prepare('SELECT count(*) n FROM authorization_events').first()).n;
    const noop=await changePermission(d,{id:'owner'},{...revoke,active:true,grantVersion:3});assert.equal(noop.unchanged,true);assert.equal((await d.prepare('SELECT count(*) n FROM authorization_events').first()).n,before);
    assert.equal(permissionMutation.safeParse({...request,actorId:'owner'}).success,false);
  }finally{sql.close();}
});
test('T2-011/062: audit failure rolls back and owner revoked after precheck cannot mutate',async()=>{
  const {d,sql}=await fixture();try{
    const b={action:'setGrant',targetId:'ta',capability:'tutor',active:false,principalVersion:1,grantVersion:1,reason:'Test'};
    sql.exec("CREATE TRIGGER reject_auth_audit BEFORE INSERT ON authorization_events BEGIN SELECT RAISE(ABORT,'audit failure'); END");
    await assert.rejects(()=>changePermission(d,{id:'owner'},b));assert.equal((await readAccessContext(d,{id:'ta'})).capabilities.tutor,true);
    sql.exec('DROP TRIGGER reject_auth_audit');
    const racing={...d,async batch(statements){sql.exec("UPDATE settings SET value='s2' WHERE key='owner'");return d.batch(statements);}};
    await assert.rejects(()=>changePermission(racing,{id:'owner'},b),status(409));assert.equal((await readAccessContext(d,{id:'ta'})).capabilities.tutor,true);assert.equal((await d.prepare('SELECT count(*) n FROM authorization_events').first()).n,0);
  }finally{sql.close();}
});
test('T2-024/037: captured guard rejects revoke-and-return, unchanged grant stays usable',async()=>{
  const {d,sql}=await fixture();try{
    const guard=await authorizationGuard(d,{id:'ta'},'tutor','k1');
    assert.ok(await d.prepare(`SELECT 1 WHERE ${guard.sql}`).bind(...guard.binds).first());
    await d.prepare("UPDATE staff_grants SET version=3 WHERE user_id='ta' AND capability='tutor'").run();await d.prepare("UPDATE cohorts SET mentor_grant_version=3 WHERE id='k1'").run();
    assert.equal(await d.prepare(`SELECT 1 WHERE ${guard.sql}`).bind(...guard.binds).first(),null);await requirePermission(d,{id:'ta'},'tutor','k1');
  }finally{sql.close();}
});
test('T2-063/064/065/066: reviewed legacy backfill preserves history and is idempotent',async()=>{
  const {d,sql}=authorizationDatabase();try{
    await d.prepare("INSERT INTO settings(key,value) VALUES('owner','owner')").run();
    for(const id of ['owner','legacy-tutor','legacy-student'])await d.prepare('INSERT INTO users(id,name,role) VALUES(?,?,?)').bind(id,id,id==='owner'?'owner':'student').run();
    await d.prepare("INSERT INTO courses(id,data,version) VALUES('c1','{}',1)").run();
    await d.prepare("INSERT INTO tutor_accounts(user_id,active,granted_by,granted_at) VALUES('legacy-tutor',1,'owner','2026')").run();
    await d.prepare("INSERT INTO curriculum_members(user_id,course_id,active,version,granted_by,updated_at,proof) VALUES('legacy-student','c1',1,1,'owner','2026','legacy')").run();
    await d.prepare("INSERT INTO enrollments(user_id,course_id,created_at) VALUES('legacy-tutor','c1','2026')").run();
    const before=(await d.prepare('SELECT count(*) n FROM account_principals').first()).n, inv=await authorizationInventory(d);
    assert.equal((await d.prepare('SELECT count(*) n FROM account_principals').first()).n,before);assert.equal(inv.rows.find(r=>r.userId==='legacy-student').kind,'unclassified');
    await assert.rejects(()=>backfillAuthorization(d,{sourceHash:inv.sourceHash,overrides:[]}),status(409));assert.equal((await d.prepare('SELECT count(*) n FROM account_principals').first()).n,0);
    const plan={sourceHash:inv.sourceHash,overrides:[{userId:'legacy-student',kind:'student',capabilities:[],classIds:[],courseIds:[],reason:'Incorrect legacy curriculum assignment; retain student'}]};
    const first=await backfillAuthorization(d,plan);assert.equal(first.created,3);
    const enrollment=await d.prepare("SELECT * FROM enrollments WHERE user_id='legacy-tutor'").first();assert.ok(enrollment.authorization_id);assert.equal(enrollment.created_at,'2026');
    assert.equal((await readAccessContext(d,{id:'legacy-tutor'})).kind,'staff');assert.equal((await readAccessContext(d,{id:'legacy-student'})).kind,'student');
    const audit=(await d.prepare('SELECT count(*) n FROM authorization_events').first()).n;assert.equal((await backfillAuthorization(d,plan)).created,0);assert.equal((await d.prepare('SELECT count(*) n FROM authorization_events').first()).n,audit);assert.equal((await d.prepare("SELECT authorization_id FROM enrollments WHERE user_id='legacy-tutor'").first()).authorization_id,enrollment.authorization_id);
    await assert.rejects(()=>backfillAuthorization(d,{...plan,sourceHash:'a'.repeat(64)}),status(409));
  }finally{sql.close();}
});

test('T2-037/041/048: preview and member guards bind scope generations even when effective access returns',async()=>{
 const {d,sql}=await fixture();try{
  for(const [user,mode,scope,change] of [
   ['ta','preview','c1',"UPDATE cohorts SET version=version+2 WHERE id='k1'"],
   ['q1','preview','c1',"UPDATE curriculum_members SET version=version+2 WHERE user_id='q1' AND course_id='c1'"],
   ['s1','studentClass','k1',"UPDATE cohort_members SET authorization_version=authorization_version+2 WHERE class_id='k1' AND user_id='s1'"],
  ]){
   const captured=await authorizationGuard(d,{id:user},mode,scope);
   sql.exec(change);
   await requirePermission(d,{id:user},mode,scope);
   assert.equal(await d.prepare(`SELECT 1 WHERE ${captured.sql}`).bind(...captured.binds).first(),null);
  }
  await assert.rejects(requirePermission(d,{id:'s1'},'preview'),status(403));
  await requirePermission(d,{id:'f0'},'preview');
 }finally{sql.close();}
});
test('T2-005/006: live email policy never overrides pending, suspended or unclassified accounts',async()=>{
 const oldUrl=process.env.APP_URL,oldRequired=process.env.AUTH_REQUIRE_EMAIL_VERIFICATION;
 process.env.APP_URL='https://authorization.fixture.invalid';process.env.AUTH_REQUIRE_EMAIL_VERIFICATION='true';
 const {createHash}=await import('node:crypto');
 const key='account_mail:'+createHash('sha256').update(process.env.APP_URL).digest('hex').slice(0,24);
 const {d,sql}=await fixture();try{
  await requirePermission(d,{id:'owner'},'owner');
  await assert.rejects(requirePermission(d,{id:'s1'},'student'),status(403));
  await d.prepare("INSERT INTO auth_credentials(user_id,email,display_name,password_hash,password_version,created_at,updated_at) VALUES('s1','s1@fixture.invalid','S1','not-a-login-hash',1,'2026','2026')").run();
  await d.prepare("INSERT INTO auth_email_status(user_id,email,verified_at) VALUES('s1','s1@fixture.invalid','2026')").run();
  await requirePermission(d,{id:'s1'},'student');
  await d.prepare("UPDATE auth_email_status SET email='obsolete@fixture.invalid' WHERE user_id='s1'").run();
  await assert.rejects(requirePermission(d,{id:'s1'},'student'),status(403));
  await d.prepare('INSERT INTO settings(key,value) VALUES(?,?)').bind(key,JSON.stringify({required:false})).run();
  await requirePermission(d,{id:'s1'},'student');
  for(const state of ['pending','suspended']){await d.prepare('UPDATE user_access SET status=? WHERE user_id=?').bind(state,'s1').run();await assert.rejects(requirePermission(d,{id:'s1'},'student'),status(403));}
  await assert.rejects(requirePermission(d,{id:'m'},'account'),status(403));
  await d.prepare("UPDATE user_access SET status='active' WHERE user_id='s1'").run();
  await d.prepare('UPDATE settings SET value=? WHERE key=?').bind(JSON.stringify({required:true}),key).run();
  await assert.rejects(requirePermission(d,{id:'s1'},'student'),status(403));
 }finally{sql.close();if(oldUrl===undefined)delete process.env.APP_URL;else process.env.APP_URL=oldUrl;if(oldRequired===undefined)delete process.env.AUTH_REQUIRE_EMAIL_VERIFICATION;else process.env.AUTH_REQUIRE_EMAIL_VERIFICATION=oldRequired;}
});
