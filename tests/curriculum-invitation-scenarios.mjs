import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {seedAccessUser} from './authorization-fixture.mjs';
import {databaseSql} from '../lib/database.ts';
import {sampleCourse} from '../lib/seed.ts';
import {saveCourse} from '../lib/course-data.ts';
import {readAccessContext,requirePermission,changePermission} from '../lib/authorization.ts';
import {createTutorInvitation,activateTutorInvitation,inspectTutorInvitation,revokeTutorInvitation,tutorOverview} from '../lib/tutors.ts';
import {accountMailer,accountMailText} from '../lib/mailer.ts';
const status=n=>e=>e.status===n;
const secret=invite=>new URLSearchParams(new URL(invite.url).hash.slice(1)).get('invite');
function beforeBatch(d,mutate){return {dialect:d.dialect,prepare:d.prepare.bind(d),async batch(items){await mutate();return d.batch(items);}};}
export async function curriculumInvitationScenarios(t,d){
 const prefix='t3-'+randomUUID().slice(0,8),owner={id:prefix+'-owner'},writer={id:prefix+'-writer'},time=new Date().toISOString(),env={APP_URL:'https://curriculum.fixture.invalid'};
 const old=await d.prepare("SELECT value FROM settings WHERE `key`='owner'").first();
 let c1,c2,cls1,cls2;
 const email=prefix+'@staff.ci.example',signed={userId:writer.id,email,displayName:'Writer'};
 // Separate rate-limit windows for independent invitation cases; the production limit remains enabled.
 let clock=Date.now();
 const issue=(extra={})=>createTutorInvitation(d,owner,{email,displayName:'Writer',classId:null,capability:'curriculum',courseId:c1.id,...extra},env,clock+=3600001);
 try{
  await seedAccessUser(d,owner.id,'staff');await seedAccessUser(d,writer.id,'student');
  await d.prepare("INSERT INTO auth_credentials(user_id,email,display_name,password_hash,password_version,created_at,updated_at) VALUES(?,?,?,'fixture-not-a-password',1,?,?)").bind(writer.id,email,'Writer',time,time).run();
  await d.prepare(databaseSql(d,"INSERT INTO settings(`key`,value) VALUES('owner',?) ON CONFLICT(`key`) DO UPDATE SET value=excluded.value","INSERT INTO settings(`key`,value) VALUES('owner',?) ON DUPLICATE KEY UPDATE value=VALUES(value)")).bind(owner.id).run();
  c1=await saveCourse(d,owner,{...structuredClone(sampleCourse),id:prefix+'-c1',title:'Course pertama',version:0,published:true,sample:false});
  c2=await saveCourse(d,owner,{...structuredClone(sampleCourse),id:prefix+'-c2',title:'Course kedua',version:0,published:true,sample:false});
  await t.test('T3-01: curriculum invitation explains role and scope; existing student becomes only curriculum staff',async()=>{
   const i=await issue(),info=await inspectTutorInvitation(d,secret(i));
   assert.equal(i.delivery,'manual');assert.equal(info.capability,'curriculum');assert.equal(info.scopeName,c1.title);assert.equal(info.existingAccount,true);
   await assert.rejects(activateTutorInvitation(d,{token:secret(i),email},null),status(401));
   const done=await activateTutorInvitation(d,{token:secret(i),email},signed);
   assert.equal(done.destination,'/curriculum?course='+c1.id);
   const ctx=await readAccessContext(d,writer);assert.equal(ctx.kind,'staff');assert.equal(ctx.capabilities.curriculum,true);assert.equal(ctx.capabilities.tutor,false);
   assert.equal((await d.prepare('SELECT role FROM users WHERE id=?').bind(writer.id).first()).role,'curriculum');
   await requirePermission(d,writer,'curriculum',c1.id);await assert.rejects(requirePermission(d,writer,'curriculum',c2.id),status(404));
   await assert.rejects(requirePermission(d,writer,'owner'),status(403));await assert.rejects(requirePermission(d,writer,'tutor'),status(403));
   const overview=await tutorOverview(d,owner,env);assert.equal(overview.courses.find(c=>c.id===c1.id).title,c1.title);assert.equal(overview.invitations.find(v=>v.id===i.id).courseTitle,c1.title);
   await assert.rejects(inspectTutorInvitation(d,secret(i)),status(410));
  });
  await t.test('T3-02: additional course and teaching invitations preserve earlier effective assignments',async()=>{
   const before=await readAccessContext(d,writer),member=await d.prepare('SELECT * FROM curriculum_members WHERE user_id=? AND course_id=?').bind(writer.id,c1.id).first();
   const i=await issue({courseId:c2.id});await activateTutorInvitation(d,{token:secret(i),email},signed);
   const after=await readAccessContext(d,writer);assert.equal(after.principalVersion,before.principalVersion);assert.equal(after.grantVersions.curriculum,before.grantVersions.curriculum);
   assert.deepEqual(await d.prepare('SELECT * FROM curriculum_members WHERE user_id=? AND course_id=?').bind(writer.id,c1.id).first(),member);
   await requirePermission(d,writer,'curriculum',c1.id);await requirePermission(d,writer,'curriculum',c2.id);
   for(const n of [1,2])await d.prepare("INSERT INTO cohorts(id,course_id,mentor_id,name,description,capacity,status,version,created_at) VALUES(?,?,NULL,?,'',10,'open',1,?)").bind(prefix+'-k'+n,c1.id,'Class '+n,time).run();
   cls1=prefix+'-k1';cls2=prefix+'-k2';
   for(const classId of [cls1,cls2]){const ti=await issue({capability:'tutor',courseId:null,classId});const r=await activateTutorInvitation(d,{token:secret(ti),email},signed);assert.equal(r.destination,'/classes');}
   await requirePermission(d,writer,'tutor',cls1);await requirePermission(d,writer,'tutor',cls2);await requirePermission(d,writer,'curriculum',c1.id);
  });
  await t.test('T3-03: reactivation after revocation advances the generation and cannot revive old course assignments',async()=>{
   const before=await readAccessContext(d,writer);await changePermission(d,owner,{action:'setGrant',targetId:writer.id,capability:'curriculum',active:false,principalVersion:before.principalVersion,grantVersion:before.grantVersions.curriculum,reason:'Fixture revoke'});
   const revoked=await readAccessContext(d,writer),i=await issue({courseId:c2.id});await activateTutorInvitation(d,{token:secret(i),email},signed);
   const after=await readAccessContext(d,writer);assert.equal(after.grantVersions.curriculum,revoked.grantVersions.curriculum+1);
   await assert.rejects(requirePermission(d,writer,'curriculum',c1.id),status(404));await requirePermission(d,writer,'curriculum',c2.id);await requirePermission(d,writer,'tutor',cls1);
  });
  await t.test('T3-04: repeated invitations supersede only the same role; expiry and revocation reject the token',async()=>{
   const c=await issue({courseId:null}),tutor=await issue({capability:'tutor',courseId:null}),latest=await issue({courseId:null});
   await assert.rejects(inspectTutorInvitation(d,secret(c)),status(410));assert.equal((await inspectTutorInvitation(d,secret(tutor))).capability,'tutor');
   await revokeTutorInvitation(d,owner,latest.id);await assert.rejects(inspectTutorInvitation(d,secret(latest)),status(410));
   await assert.rejects(inspectTutorInvitation(d,secret(tutor),Date.now()+8*86400000),status(410));
  });
  await t.test('T3-05: course changes at the create/activate write barrier leave no partial grant or claim',async()=>{
   const raced=beforeBatch(d,()=>d.prepare('UPDATE courses SET version=version+1 WHERE id=?').bind(c1.id).run());
   await assert.rejects(createTutorInvitation(raced,owner,{email:prefix+'-race@staff.ci.example',displayName:'Race',classId:null,capability:'curriculum',courseId:c1.id},env),status(409));
   assert.equal((await d.prepare('SELECT count(*) n FROM tutor_invitations WHERE email=?').bind(prefix+'-race@staff.ci.example').first()).n,0);
   const i=await issue(),before=await readAccessContext(d,writer),activationRace=beforeBatch(d,()=>d.prepare('UPDATE courses SET version=version+1 WHERE id=?').bind(c1.id).run());
   await assert.rejects(activateTutorInvitation(activationRace,{token:secret(i),email},signed),status(409));
   assert.equal((await d.prepare('SELECT accepted_at FROM tutor_invitations WHERE id=?').bind(i.id).first()).accepted_at,null);assert.deepEqual(await readAccessContext(d,writer),before);
   await d.prepare('DELETE FROM courses WHERE id=?').bind(c1.id).run();await assert.rejects(activateTutorInvitation(d,{token:secret(i),email},signed),status(409));
   assert.equal((await d.prepare('SELECT accepted_at FROM tutor_invitations WHERE id=?').bind(i.id).first()).accepted_at,null);
  });
  await t.test('T3-06: disabled email creates nothing; uncertain delivery returns one usable manual link without retry',async()=>{
   const body={email:prefix+'-mail@staff.ci.example',displayName:'Mail',classId:null,capability:'curriculum',courseId:c2.id,delivery:'email'};
   await assert.rejects(createTutorInvitation(d,owner,body,env),status(503));assert.equal((await d.prepare('SELECT count(*) n FROM tutor_invitations WHERE email=?').bind(body.email).first()).n,0);
   let calls=0;const i=await createTutorInvitation(d,owner,body,env,Date.now(),async()=>{calls++;throw new Error('Unknown delivery outcome');});assert.equal(calls,1);assert.equal(i.delivery,'failed');assert.equal((await inspectTutorInvitation(d,secret(i))).capability,'curriculum');
   assert.equal((await d.prepare('SELECT count(*) n FROM tutor_invitations WHERE email=?').bind(body.email).first()).n,1);
  });
  await t.test('T3-07: actual local mail adapter writes a role-specific invitation to a private test inbox',async()=>{
   const dir=await mkdtemp(join(tmpdir(),'ruangstem-t3-mail-')),previous=process.cwd();
   try {process.chdir(dir);const local={APP_URL:'http://localhost:4330',AUTH_ALLOW_LOCAL_HTTP:'true',NODE_ENV:'development',MAIL_DELIVERY:'preview'};
    const i=await createTutorInvitation(d,owner,{email:prefix+'-inbox@staff.ci.example',displayName:'Inbox',classId:null,capability:'curriculum',courseId:c2.id,delivery:'email'},local,Date.now(),accountMailer(local));
    assert.equal(i.delivery,'preview');const files=await readdir(join(dir,'work/account-mail'));assert.equal(files.length,1);const mail=JSON.parse(await readFile(join(dir,'work/account-mail',files[0]),'utf8'));
    assert.equal(mail.to,i.email);assert.equal(mail.subject,'Undangan Tim Kurikulum Ruang STEM');assert.ok(mail.text.includes(i.url));assert.ok(mail.text.includes('7 hari'));assert.ok(mail.text.includes('fitur belajar pribadi siswa tidak tersedia'));
    assert.equal(accountMailText({purpose:'staffInvite',staffRole:'Tutor',to:'fixture@ci.example',url:i.url}).subject,'Undangan Tutor Ruang STEM');
   }finally{process.chdir(previous);await rm(dir,{recursive:true,force:true});}
  });
 }finally{if(old)await d.prepare("UPDATE settings SET value=? WHERE `key`='owner'").bind(old.value).run();else await d.prepare("DELETE FROM settings WHERE `key`='owner'").run();}
}
