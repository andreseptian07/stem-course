import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import sharp from 'sharp';
import {seedAccessUser} from './authorization-fixture.mjs';
import {databaseSql} from '../lib/database.ts';
import {readAccessContext,requirePermission,changePermission,permissionEvents} from '../lib/authorization.ts';
import {sampleCourse} from '../lib/seed.ts';
import {listClasses,classAccess,classDetail,saveClass,setMembership,requestJoin,addPost,addFeedback,saveClassSession,resetClassAttempts,classAgenda} from '../lib/classes.ts';
import {accountData,enrollCourse} from '../lib/account-data.ts';
import {readLearningCourse,readProgress,initializeProgress,completeLesson,submitQuiz} from '../lib/course-data.ts';
import {readPreview,previewList} from '../lib/preview.ts';
import {curriculumOverview,mutateCurriculum} from '../lib/curriculum.ts';
import {tutorDashboard} from '../lib/tutor-dashboard.ts';
import {notificationFeed} from '../lib/notifications.ts';
import {saveAssignment,submitProject,reviewProject,projectList,dashboardProjects} from '../lib/projects.ts';
import {uploadProjectFile,downloadProjectFile,removeProjectFile} from '../lib/project-files.ts';
import {uploadMedia,readMedia,clearPhoto,photoInfo,ownPhoto,courseMediaList} from '../lib/media-data.ts';
import {startAttempt,readAttempt} from '../lib/code-attempts.ts';
import {listCertificates,issueCertificate,ownedCertificate,certificateStatus,ownedCertificatePdf} from '../lib/certificates.ts';
import {setRsvp,learningSessions,publicSessions,enrolledSessions} from '../lib/session-data.ts';
import {studioHistory,studioDiscussion,adminStudioData,personalStudioData,resetStudioAttempts} from '../lib/studio-data.ts';
import {setRegistration} from '../lib/registration.ts';
import {emailSettingsOverview,updateEmailSettings} from '../lib/email-settings.ts';
import {updateAccess,accessOverview,registerIdentity} from '../lib/access.ts';
import {createTutorInvitation,activateTutorInvitation,revokeTutorInvitation,tutorOverview} from '../lib/tutors.ts';
import {encode} from '../lib/judge.ts';
const status=n=>e=>e.status===n;
const tables=['account_principals','staff_grants','authorization_events','user_access','cohorts','cohort_members','enrollments','progress','learning_progress_revisions','project_reviews','academic_mutation_receipts','assignment_revisions','academic_change_events','class_assignment_requirements','attempts','rsvps','curriculum_drafts','curriculum_events','curriculum_members','class_assignments','project_submissions','project_files','media_files','certificates','profiles','cohort_posts','cohort_sessions','cohort_feedback','access_events','tutor_invitations'];
async function fingerprint(d){const rows=[];for(const table of tables){const data=(await d.prepare(`SELECT * FROM ${table}`).all()).results.map(r=>JSON.stringify(r)).sort();rows.push([table,data]);}return createHash('sha256').update(JSON.stringify(rows)).digest('hex');}
// Barrier is immediately before the selected database mutation, not a timing delay.
function beforeWrite(d,needle,mutate){let changed=false;const originals=new WeakMap();async function barrier(){if(!changed){changed=true;await mutate();}}return {dialect:d.dialect,prepare(q){const stmt=d.prepare(q);if(!q.includes(needle))return stmt;return {bind(...args){const b=stmt.bind(...args),proxy=new Proxy(b,{get(t,key){if(key==='run')return async()=>{await barrier();return b.run();};const v=Reflect.get(t,key);return typeof v==='function'?v.bind(t):v;}});originals.set(proxy,b);return proxy;}};},async batch(statements){if(statements.some(s=>originals.has(s)))await barrier();return d.batch(statements.map(s=>originals.get(s)||s));}};}

// Run a deterministic mutation after a selected read returns, so stale read
// responses and asynchronous file completion can be tested without timers.
function readBarrier(d,needle,mutate,after){
  let changed=false;
  const wrap=stmt=>new Proxy(stmt,{get(t,key){
    if(key==='bind')return (...args)=>wrap(stmt.bind(...args));
    if(key==='first'||key==='all')return async(...args)=>{
      if(!after&&!changed){changed=true;await mutate();}
      const result=await stmt[key](...args);
      if(after&&!changed){changed=true;await mutate();}
      return result;
    };
    const value=Reflect.get(t,key);return typeof value==='function'?value.bind(t):value;
  }});
  return new Proxy(d,{get(t,key){if(key==='prepare')return q=>q.includes(needle)?wrap(d.prepare(q)):d.prepare(q);const value=Reflect.get(t,key);return typeof value==='function'?value.bind(t):value;}});
}
const afterRead=(d,needle,mutate)=>readBarrier(d,needle,mutate,true);
const beforeRead=(d,needle,mutate)=>readBarrier(d,needle,mutate,false);

export async function authorizationScenarios(t,d){
 const prefix='az-'+randomUUID().slice(0,8),u={},courses={},time='2026-10-09T00:00:00Z';
 const priorOwner=await d.prepare("SELECT value FROM settings WHERE `key`='owner'").first();
 const oldRoot=process.env.UPLOAD_STORAGE_DIR,root=await mkdtemp(tmpdir()+'/stem-authorization-');process.env.UPLOAD_STORAGE_DIR=root;
 for(const [alias,kind,caps,status] of [['O','staff',[],'active'],['S1','student',[],'active'],['S2','student',[],'active'],['TA','staff',['tutor'],'active'],['TB','staff',['tutor'],'active'],['Q1','staff',['curriculum'],'active'],['Q2','staff',['curriculum'],'active'],['TQ','staff',['tutor','curriculum'],'active'],['F0','staff',[],'active'],['P','student',[],'pending'],['X','staff',['tutor'],'suspended'],['M','unclassified',[],'active']]){const id=prefix+'-'+alias;await seedAccessUser(d,id,kind,caps,status);u[alias]={id,name:alias,role:alias==='O'?'owner':kind};await d.prepare('INSERT INTO auth_credentials(user_id,email,display_name,password_hash,password_version,created_at,updated_at) VALUES(?,?,?,?,1,?,?)').bind(id,(id+'@fixture.invalid').toLowerCase(),alias,'fixture-not-a-login-hash',time,time).run();}
 await d.prepare(databaseSql(d,"INSERT INTO settings(`key`,value) VALUES('owner',?) ON CONFLICT(`key`) DO UPDATE SET value=excluded.value","INSERT INTO settings(`key`,value) VALUES('owner',?) ON DUPLICATE KEY UPDATE value=VALUES(value)")).bind(u.O.id).run();
 const cls=key=>prefix+'-'+key, task=key=>prefix+'-'+key;
 try{
  for(const key of ['C1','C2','C3']){courses[key]={...structuredClone(sampleCourse),id:prefix+'-'+key,title:key,version:1,published:key!=='C3',sample:false,certificateEnabled:true};await d.prepare('INSERT INTO courses(id,data,version) VALUES(?,?,1)').bind(courses[key].id,JSON.stringify(courses[key])).run();}
  for(const [key,course,mentor,state] of [['K1','C1','TA','active'],['K2','C1','TB','active'],['K3','C2','TB','open'],['K4','C1','TA','archived'],['K5','C1','TQ','active']])await d.prepare('INSERT INTO cohorts(id,course_id,mentor_id,name,description,capacity,status,created_at) VALUES(?,?,?,?,?,10,?,?)').bind(cls(key),courses[course].id,u[mentor].id,key,'PRIVATE-'+key,state,time).run();
  for(const [alias,course] of [['Q1','C1'],['Q2','C2'],['TQ','C2']])await d.prepare('INSERT INTO curriculum_members(user_id,course_id,active,version,grant_version,granted_by,updated_at,proof) VALUES(?,?,1,1,1,?,?,?)').bind(u[alias].id,courses[course].id,u.O.id,time,'fixture:'+alias).run();
  for(const [alias,key] of [['S1','K1'],['S1','K4'],['S2','K2'],['O','K1'],['TA','K1'],['Q1','K1'],['TQ','K1'],['F0','K1']])await d.prepare("INSERT INTO cohort_members(class_id,user_id,status,created_at) VALUES(?,?,'approved',?)").bind(cls(key),u[alias].id,time).run();
  for(const alias of ['S1','S2','O','TA','Q1','TQ','F0'])await d.prepare('INSERT INTO enrollments(user_id,course_id,created_at,authorization_id) VALUES(?,?,?,?)').bind(u[alias].id,courses.C1.id,time,'fixture:'+alias).run();
  for(const key of ['K1','K2','K4']){await d.prepare("INSERT INTO cohort_sessions(id,class_id,title,kind,starts_at,duration,location,url,version) VALUES(?,?,?,'online','2099-01-01T00:00:00Z',60,'',?,1)").bind(task(key+'-session'),cls(key),'PRIVATE-'+key,'https://example.invalid/PRIVATE-'+key).run();await d.prepare("INSERT INTO class_assignments(id,class_id,title,instructions,status,version,created_at) VALUES(?,?,?,?,'published',1,?)").bind(task(key+'-task'),cls(key),'Task '+key,'PRIVATE-INSTRUCTION-'+key,time).run();}
  async function denied(run,n){const before=await fingerprint(d);await assert.rejects(run,status(n));assert.equal(await fingerprint(d),before,'Unauthorized request changed domain data');}
  await t.test('T2-001/002/003/005: persisted context and restricted gates',async()=>{for(const alias of ['O','S1','TA','Q1','TQ','F0'])assert.equal((await readAccessContext(d,u[alias])).kind,alias==='S1'?'student':'staff');for(const alias of ['P','X','M'])await denied(()=>requirePermission(d,u[alias],'account'),403);await denied(()=>requirePermission(d,{...u.S1,role:'owner'},'owner'),403);});
  await t.test('T2-013/014/019/020/021: learner and preview have separate, sanitized scopes',async()=>{const p=await readLearningCourse(d,courses.C1.id,u.S1);assert.equal(p.id,courses.C1.id);await denied(()=>readLearningCourse(d,courses.C2.id,u.S1),404);await denied(()=>readLearningCourse(d,courses.C3.id,u.S1),404);const preview=await readPreview(d,u.TA,courses.C1.id);assert.ok(preview.course.lessons.every(l=>!l.locked));assert.equal(JSON.stringify(preview).includes('"correct"'),false);assert.equal(JSON.stringify(preview).includes('"hidden":true'),false);await denied(()=>readPreview(d,u.TA,courses.C2.id),404);await readPreview(d,u.Q1,courses.C1.id);await denied(()=>readPreview(d,u.Q1,courses.C2.id),404);await readPreview(d,u.O,courses.C3.id);assert.equal((await previewList(d,u.F0)).length,0);});
  await t.test('T2-015/016/029/050: historical learner rows never permit staff personal actions',async()=>{for(const alias of ['O','TA','Q1','TQ','F0']){await denied(()=>enrollCourse(d,u[alias],courses.C2.id),403);await denied(()=>completeLesson(d,u[alias],courses.C1.id,'embedded'),403);await denied(()=>submitQuiz(d,u[alias],courses.C1.id,'sensor',{}),403);await denied(()=>requestJoin(d,u[alias],cls('K3')),403);await denied(()=>listCertificates(d,u[alias],false),403);await denied(()=>issueCertificate(d,u[alias],courses.C1.id,cls('K1'),true),403);await denied(()=>ownedCertificate(d,u[alias],'RS-FAKE'),403);}assert.equal((await accountData(d,u.TA)).courses.length,0);});
  await t.test('T2-027/028/031/032/033: class list, agenda and private tasks isolate same-course classes',async()=>{const ta=await listClasses(d,u.TA);assert.deepEqual(ta.classes.map(c=>c.id).sort(),[cls('K1'),cls('K4')].sort());assert.deepEqual((await classAgenda(d,u.TA)).map(s=>s.classId),[cls('K1')]);assert.deepEqual((await classAgenda(d,u.S1)).map(s=>s.classId),[cls('K1')]);assert.equal((await tutorDashboard(d,u.TA)).sessions.length,1);await denied(()=>classAccess(d,u.TA,cls('K2'),'member'),404);await denied(()=>projectList(d,u.S1,cls('K2')),404);await denied(()=>projectList(d,u.Q1,cls('K1')),403);await denied(()=>classDetail(d,u.F0,cls('K1')),403);});
  await t.test('T2-026/030/036/039: explicit target grants and student seats',async()=>{const shape={id:cls('new'),version:0,courseId:courses.C1.id,mentorId:u.S1.id,targetGrantVersion:1,name:'New',description:'',capacity:10,status:'open',startsAt:null,endsAt:null};await denied(()=>saveClass(d,u.O,shape),403);await denied(()=>saveClass(d,u.O,{...shape,mentorId:u.Q1.id}),403);await saveClass(d,u.O,{...shape,mentorId:u.TA.id});await denied(()=>setMembership(d,u.TA,cls('new'),u.S2.id,'approved'),403);await denied(()=>setMembership(d,u.O,cls('new'),u.Q1.id,'approved'),403);const view=await curriculumOverview(d,u.O);assert.equal(view.people.some(p=>p.id===u.S1.id),false);await denied(()=>mutateCurriculum(d,u.O,{action:'member',courseId:courses.C1.id,userId:u.S1.id,active:true,version:0,targetGrantVersion:1}),403);const detail=await classDetail(d,u.TA,cls('K1'));assert.equal(detail.class.count,1);assert.ok(detail.members.every(m=>m.userId===u.S1.id));});
  await t.test('T2-038/040: curriculum feature gates, collaboration and owner review',async()=>{await denied(()=>curriculumOverview(d,u.S1),403);await denied(()=>curriculumOverview(d,u.TA),403);await denied(()=>curriculumOverview(d,u.F0),403);assert.equal((await curriculumOverview(d,u.Q1)).items.length,1);await mutateCurriculum(d,u.Q1,{action:'start',courseId:courses.C1.id,version:1});await denied(()=>mutateCurriculum(d,u.Q1,{action:'start',courseId:courses.C2.id,version:1}),404);await denied(()=>mutateCurriculum(d,u.Q1,{action:'publish',courseId:courses.C1.id,version:1}),403);});
  await t.test('T2-045/046: unsubmitted attachments are private even from Owner; submitted files follow teaching scope',async()=>{const f=await uploadProjectFile(d,u.S1,task('K1-task'),'private.txt',Buffer.from('PRIVATE-FILE-S1'));assert.equal(Buffer.from((await downloadProjectFile(d,u.S1,f.id)).bytes).toString(),'PRIVATE-FILE-S1');for(const alias of ['O','TA','S2','TB','Q1'])await denied(()=>downloadProjectFile(d,u[alias],f.id),404);await submitProject(d,u.S1,{action:'submit',id:task('submission'),assignmentId:task('K1-task'),assignmentVersion:1,previousId:null,previousVersion:0,body:'PRIVATE-SUBMISSION-S1',url:'',attachmentIds:[f.id]});for(const alias of ['O','TA','S1'])assert.equal(Buffer.from((await downloadProjectFile(d,u[alias],f.id)).bytes).toString(),'PRIVATE-FILE-S1');for(const alias of ['TB','S2'])await denied(()=>downloadProjectFile(d,u[alias],f.id),404);await denied(()=>removeProjectFile(d,u.S1,f.id),404);});
  await t.test('T2-035: archived history is readable, all operational writes are denied',async()=>{assert.ok((await projectList(d,u.TA,cls('K4'))).tasks.length);await denied(()=>addPost(d,u.TA,cls('K4'),'announcement','No'),409);await denied(()=>setMembership(d,u.O,cls('K4'),u.S2.id,'approved'),409);await denied(()=>saveAssignment(d,u.TA,{id:task('archive-write'),classId:cls('K4'),version:0,title:'No',instructions:'No',status:'published',dueAt:null}),409);});
  await t.test('T2-023: staff RSVP and unrelated sessions leave reservations unchanged',async()=>{const sid=task('live');await d.prepare("INSERT INTO sessions(id,course_id,title,kind,starts_at,duration,location,url,capacity) VALUES(?,?,'Live','online','2099-01-01T00:00:00Z',60,'','https://example.invalid/private',10)").bind(sid,courses.C1.id).run();for(const alias of ['O','TA','Q1','F0'])await denied(()=>setRsvp(d,u[alias],sid,true),403);await setRsvp(d,u.S1,sid,true);await setRsvp(d,u.S1,sid,false);});
  await t.test('T2-035: every archived operational branch rejects writes and preserves history',async()=>{
    // Prepare a historical submission before archiving; direct fixture setup is
    // separate from the operations whose authorization is being tested.
    await d.prepare("UPDATE cohorts SET status='active' WHERE id=?").bind(cls('K4')).run();
    await submitProject(d,u.S1,{action:'submit',id:task('archived-submission'),assignmentId:task('K4-task'),assignmentVersion:1,previousId:null,previousVersion:0,body:'Historical work',url:'',attachmentIds:[]});
    await d.prepare("UPDATE cohorts SET status='archived',version=version+1 WHERE id=?").bind(cls('K4')).run();
    for(const actor of [u.TA,u.O]){
      await denied(()=>addFeedback(d,actor,cls('K4'),u.S1.id,'Forbidden archive feedback'),409);
      await denied(()=>saveClassSession(d,actor,{id:task('archive-session-write'),classId:cls('K4'),version:0,title:'Forbidden archive schedule',kind:'online',startsAt:'2099-01-01T00:00:00Z',duration:60,location:'',url:'https://example.invalid/live'}),409);
      await denied(()=>resetClassAttempts(d,actor,cls('K4'),u.S1.id,'embedded'),409);
      await denied(()=>reviewProject(d,actor,{action:'review',submissionId:task('archived-submission'),version:1,status:'accepted',feedback:'Forbidden archive review',score:90}),409);
    }
    await denied(()=>requestJoin(d,u.S1,cls('K4')),409);
    await denied(()=>addPost(d,u.S1,cls('K4'),'discussion','Forbidden archive discussion'),409);
    await denied(()=>submitProject(d,u.S1,{action:'submit',id:task('archive-resubmit'),assignmentId:task('K4-task'),assignmentVersion:1,previousId:task('archived-submission'),previousVersion:1,body:'Forbidden archive resubmission',url:'',attachmentIds:[]}),409);
    // canUpload uses a feature 403 when a task is unavailable for submission.
    await denied(()=>uploadProjectFile(d,u.S1,task('K4-task'),'archive.txt',Buffer.from('Forbidden archive upload')),403);
    assert.ok((await projectList(d,u.S1,cls('K4'))).tasks.length);
  });
  await t.test('T2-037/041: CAS guards reject class/grant/assignment ABA at the write barrier',async()=>{const raced=beforeWrite(d,'INSERT INTO cohort_posts',()=>d.prepare('UPDATE cohorts SET version=version+2 WHERE id=?').bind(cls('K1')).run());await assert.rejects(addPost(raced,u.TA,cls('K1'),'announcement','FORBIDDEN-RACE'),status(409));assert.equal((await d.prepare('SELECT count(*) n FROM cohort_posts WHERE body=?').bind('FORBIDDEN-RACE').first()).n,0);const draft=(await curriculumOverview(d,u.Q1)).items[0].draft;const r=beforeWrite(d,'UPDATE curriculum_drafts SET data=',()=>d.prepare('UPDATE curriculum_members SET version=version+2 WHERE user_id=? AND course_id=?').bind(u.Q1.id,courses.C1.id).run());await assert.rejects(mutateCurriculum(r,u.Q1,{action:'save',course:draft.course,version:draft.version}),status(409));assert.equal((await d.prepare('SELECT version FROM curriculum_drafts WHERE course_id=?').bind(courses.C1.id).first()).version,draft.version);});
  await t.test('T2-024/025: delayed completion and judge submit/poll cannot publish after suspension and restoration',async()=>{await initializeProgress(d,u.S1.id,courses.C1.id,'embedded',1);const raced=beforeWrite(d,'UPDATE learning_progress_revisions SET complete=',()=>d.prepare('UPDATE user_access SET version=version+2 WHERE user_id=?').bind(u.S1.id).run());await assert.rejects(completeLesson(raced,u.S1,courses.C1.id,'embedded'),status(403));assert.equal((await d.prepare("SELECT complete FROM learning_progress_revisions WHERE user_id=? AND course_id=? AND lesson_id='embedded'").bind(u.S1.id,courses.C1.id).first()).complete,0);await completeLesson(d,u.S1,courses.C1.id,'embedded');await initializeProgress(d,u.S1.id,courses.C1.id,'sensor',1);await d.prepare("UPDATE learning_progress_revisions SET complete=1,quiz_passed=1 WHERE user_id=? AND course_id=? AND lesson_id='sensor'").bind(u.S1.id,courses.C1.id).run();const lesson=courses.C1.lessons.find(l=>l.exercise);await initializeProgress(d,u.S1.id,courses.C1.id,lesson.id,lesson.revision);const cfg={url:'https://judge.example.com',token:'fixture-only',languageIds:{python:71,javascript:63,cpp:54}};const id=randomUUID();await assert.rejects(startAttempt(d,cfg,u.S1.id,courses.C1.id,lesson,'print(1)',id,async()=>{await d.prepare('UPDATE user_access SET version=version+2 WHERE user_id=?').bind(u.S1.id).run();return Response.json(lesson.exercise.tests.map((_,i)=>({token:'race-'+i})));}),status(403));const a=await d.prepare('SELECT * FROM attempts WHERE id=?').bind(id).first();assert.equal(a.state,'error');assert.equal((await d.prepare('SELECT code_attempts FROM learning_progress_revisions WHERE user_id=? AND course_id=? AND lesson_id=?').bind(u.S1.id,courses.C1.id,lesson.id).first()).code_attempts,0);const second=randomUUID();await startAttempt(d,cfg,u.S1.id,courses.C1.id,lesson,'print(1)',second,async()=>Response.json(lesson.exercise.tests.map((_,i)=>({token:'poll-'+i}))));const pending=await d.prepare('SELECT * FROM attempts WHERE id=?').bind(second).first();await assert.rejects(readAttempt(d,cfg,u.S1.id,pending,lesson.revision,async()=>{await d.prepare('UPDATE user_access SET version=version+2 WHERE user_id=?').bind(u.S1.id).run();return Response.json({submissions:lesson.exercise.tests.map((x,i)=>({token:'poll-'+i,status:{id:3},stdout:encode(x.expected)}))});}),status(403));const state=(await readProgress(d,u.S1.id,courses.C1.id)).find(p=>p.lessonId===lesson.id);assert.equal(state.codePassed,0);assert.equal(state.codeAttempts,0);});
  await t.test('T2-009/010: revoking Tutor on a dual staff preserves curriculum and requires class reassignment',async()=>{
    let ctx=await readAccessContext(d,u.TQ);
    await requirePermission(d,ctx,'tutor',cls('K5'));
    await changePermission(d,u.O,{action:'setGrant',targetId:ctx.id,capability:'tutor',active:false,principalVersion:ctx.principalVersion,grantVersion:ctx.grantVersions.tutor,reason:'Revoke teaching only'});
    await requirePermission(d,u.TQ,'curriculum',courses.C2.id);
    await denied(()=>requirePermission(d,u.TQ,'tutor',cls('K5')),404);
    ctx=await readAccessContext(d,u.TQ);
    await changePermission(d,u.O,{action:'setGrant',targetId:ctx.id,capability:'tutor',active:true,principalVersion:ctx.principalVersion,grantVersion:ctx.grantVersions.tutor,reason:'Regrant teaching only'});
    await denied(()=>requirePermission(d,u.TQ,'tutor',cls('K5')),404);
    ctx=await readAccessContext(d,u.TQ);
    await saveClass(d,u.O,{id:cls('K5'),version:1,courseId:courses.C1.id,mentorId:ctx.id,targetGrantVersion:ctx.grantVersions.tutor,name:'K5',description:'PRIVATE-K5',capacity:10,status:'active',startsAt:null,endsAt:null});
    await requirePermission(d,u.TQ,'tutor',cls('K5'));
    await requirePermission(d,u.TQ,'curriculum',courses.C2.id);
  });
  await t.test('T2-009/010/052: dual grants revoke independently; old assignments never revive',async()=>{let ctx=await readAccessContext(d,u.TQ);await changePermission(d,u.O,{action:'setGrant',targetId:ctx.id,capability:'curriculum',active:false,principalVersion:ctx.principalVersion,grantVersion:ctx.grantVersions.curriculum,reason:'Test revoke curriculum'});await requirePermission(d,u.TQ,'tutor');assert.equal((await notificationFeed(d,ctx)).items.some(n=>n.kind==='curriculum'),false);ctx=await readAccessContext(d,u.TQ);await changePermission(d,u.O,{action:'setGrant',targetId:ctx.id,capability:'curriculum',active:true,principalVersion:ctx.principalVersion,grantVersion:ctx.grantVersions.curriculum,reason:'Test regrant'});assert.equal((await curriculumOverview(d,u.TQ)).items.length,0);await denied(()=>requirePermission(d,u.TQ,'curriculum',courses.C2.id),404);});
  await t.test('T2-008/023: forged display roles and historical staff reservations do not grant meeting access or consume seats',async()=>{
    const sid=task('capacity-session');
    await d.prepare("INSERT INTO sessions(id,course_id,title,kind,starts_at,duration,location,url,capacity) VALUES(?,?,'Capacity','online','2099-01-01T00:00:00Z',60,'','https://example.invalid/SECRET-MEETING',1)").bind(sid,courses.C1.id).run();
    await d.prepare('INSERT INTO rsvps(session_id,user_id) VALUES(?,?)').bind(sid,u.TA.id).run();
    const listed=(await learningSessions(d,{...u.S1,role:'owner'})).find(s=>s.id===sid);
    assert.equal(listed.url,'');assert.equal(Number(listed.count),0);
    assert.equal(Number((await publicSessions(d)).find(s=>s.id===sid).count),0);
    await setRsvp(d,u.S1,sid,true);
    assert.equal((await learningSessions(d,u.S1)).find(s=>s.id===sid).url,'https://example.invalid/SECRET-MEETING');
    assert.equal(Number((await publicSessions(d)).find(s=>s.id===sid).count),1);
  });
  await t.test('T2-030/037/044: class, target and submission generations reject delayed operational writes',async()=>{
    const membership=beforeWrite(d,'INSERT INTO cohort_members',()=>d.prepare('UPDATE user_access SET version=version+2 WHERE user_id=?').bind(u.S2.id).run());
    await assert.rejects(setMembership(membership,u.O,cls('new'),u.S2.id,'approved'),status(409));
    assert.equal(await d.prepare('SELECT 1 FROM cohort_members WHERE class_id=? AND user_id=?').bind(cls('new'),u.S2.id).first(),null);
    const join=beforeWrite(d,'INTO cohort_members',()=>d.prepare('UPDATE cohorts SET version=version+2 WHERE id=?').bind(cls('K3')).run());
    await assert.rejects(requestJoin(join,u.S1,cls('K3')),status(409));
    assert.equal(await d.prepare('SELECT 1 FROM cohort_members WHERE class_id=? AND user_id=?').bind(cls('K3'),u.S1.id).first(),null);
    const feedback=beforeWrite(d,'INSERT INTO cohort_feedback',()=>d.prepare('UPDATE cohort_members SET authorization_version=authorization_version+2 WHERE class_id=? AND user_id=?').bind(cls('K1'),u.S1.id).run());
    await assert.rejects(addFeedback(feedback,u.TA,cls('K1'),u.S1.id,'MUST-NOT-SAVE'),status(409));
    assert.equal(Number((await d.prepare('SELECT count(*) n FROM cohort_feedback WHERE body=?').bind('MUST-NOT-SAVE').first()).n),0);
    const session=beforeWrite(d,'INSERT INTO cohort_sessions',()=>d.prepare('UPDATE cohorts SET version=version+2 WHERE id=?').bind(cls('K1')).run());
    await assert.rejects(saveClassSession(session,u.TA,{id:task('new-session'),version:0,classId:cls('K1'),title:'Blocked',kind:'online',startsAt:'2099-01-02T00:00:00Z',duration:60,location:'',url:'https://example.invalid'}),status(409));
    await initializeProgress(d,u.S1.id,courses.C1.id,'embedded',1);
    await d.prepare("UPDATE learning_progress_revisions SET quiz_attempts=3 WHERE user_id=? AND course_id=? AND lesson_id='embedded'").bind(u.S1.id,courses.C1.id).run();
    const reset=beforeWrite(d,'UPDATE learning_progress_revisions SET quiz_attempts=0',()=>d.prepare('UPDATE user_access SET version=version+2 WHERE user_id=?').bind(u.S1.id).run());
    await assert.rejects(resetClassAttempts(reset,u.TA,cls('K1'),u.S1.id,'embedded'),status(409));
    assert.equal(Number((await d.prepare("SELECT quiz_attempts FROM learning_progress_revisions WHERE user_id=? AND course_id=? AND lesson_id='embedded'").bind(u.S1.id,courses.C1.id).first()).quiz_attempts),3);
    const review=beforeWrite(d,'UPDATE project_submissions AS s SET',()=>d.prepare('UPDATE cohort_members SET authorization_version=authorization_version+2 WHERE class_id=? AND user_id=?').bind(cls('K1'),u.S1.id).run());
    await assert.rejects(reviewProject(review,u.TA,{action:'review',submissionId:task('submission'),version:1,status:'accepted',score:80,feedback:'Blocked review'}),status(409));
    assert.equal((await d.prepare('SELECT status,version FROM project_submissions WHERE id=?').bind(task('submission')).first()).status,'submitted');
  });
  await t.test('T2-045/046/048/049: upload completion and byte reads cannot outlive scope authority',async()=>{
    const media=await uploadMedia(d,u.Q1,{purpose:'course',courseId:courses.C1.id},'private.txt',Buffer.from('PRIVATE-COURSE-MEDIA'));
    assert.equal(Buffer.from((await readMedia(d,u.Q1,media.id)).bytes).toString(),'PRIVATE-COURSE-MEDIA');
    for(const alias of ['S1','TA','Q2'])await denied(()=>readMedia(d,u[alias],media.id),404);
    const mediaRace=beforeWrite(d,'UPDATE media_files SET ready=1',()=>d.prepare('UPDATE curriculum_members SET version=version+2 WHERE user_id=? AND course_id=?').bind(u.Q1.id,courses.C1.id).run());
    const beforeMedia=Number((await d.prepare('SELECT count(*) n FROM media_files WHERE owner_id=?').bind(u.Q1.id).first()).n);
    await assert.rejects(uploadMedia(mediaRace,u.Q1,{purpose:'course',courseId:courses.C1.id},'blocked.txt',Buffer.from('BLOCKED')),status(403));
    assert.equal(Number((await d.prepare('SELECT count(*) n FROM media_files WHERE owner_id=?').bind(u.Q1.id).first()).n),beforeMedia);
    const finalMedia=beforeRead(d,'SELECT 1 FROM media_files WHERE',()=>d.prepare('UPDATE curriculum_members SET version=version+2 WHERE user_id=? AND course_id=?').bind(u.Q1.id,courses.C1.id).run());
    await assert.rejects(readMedia(finalMedia,u.Q1,media.id),status(404));
    const attachment=(await d.prepare('SELECT id FROM project_files WHERE owner_id=? AND submission_id IS NOT NULL').bind(u.S1.id).first()).id;
    const finalFile=beforeRead(d,'AND EXISTS(SELECT 1 FROM account_principals snap',()=>d.prepare('UPDATE cohorts SET version=version+2 WHERE id=?').bind(cls('K1')).run());
    await assert.rejects(downloadProjectFile(finalFile,u.TA,attachment),status(404));
    const revoked=afterRead(d,'SELECT * FROM media_files WHERE',()=>d.prepare('UPDATE curriculum_members SET active=0,version=version+1 WHERE user_id=? AND course_id=?').bind(u.Q1.id,courses.C1.id).run());
    await assert.rejects(readMedia(revoked,u.Q1,media.id),e=>[403,404].includes(e.status));
    await d.prepare('UPDATE curriculum_members SET active=1,version=version+1 WHERE user_id=? AND course_id=?').bind(u.Q1.id,courses.C1.id).run();
    const fileRace=beforeWrite(d,'UPDATE project_files SET ready=1',()=>d.prepare('UPDATE cohort_members SET authorization_version=authorization_version+2 WHERE class_id=? AND user_id=?').bind(cls('K2'),u.S2.id).run());
    await assert.rejects(uploadProjectFile(fileRace,u.S2,task('K2-task'),'blocked.txt',Buffer.from('BLOCKED-FILE')),status(403));
    assert.equal(Number((await d.prepare('SELECT count(*) n FROM project_files WHERE owner_id=?').bind(u.S2.id).first()).n),0);
  });
  await t.test('T2-052: notification scope snapshots filter revoked and regranted class/course data',async()=>{
    assert.deepEqual((await notificationFeed(d,u.Q1)).navigation,{classes:false,curriculum:true});
    assert.deepEqual((await notificationFeed(d,u.TA)).navigation,{classes:true,curriculum:false});
    const student=afterRead(d,'SELECT a.id,a.title,a.version',()=>d.prepare('UPDATE cohort_members SET authorization_version=authorization_version+2 WHERE class_id=? AND user_id=?').bind(cls('K1'),u.S1.id).run());
    assert.equal((await notificationFeed(student,u.S1)).items.some(n=>n.href.includes(cls('K1'))),false);
    await d.prepare("INSERT INTO curriculum_events(id,course_id,actor_id,kind,detail,created_at) VALUES(?,?,?,'submit','PRIVATE-CURRICULUM-EVENT',?)").bind(task('notification-race'),courses.C1.id,u.Q1.id,time).run();
    const curriculum=afterRead(d,'SELECT e.id,e.course_id AS courseId',()=>d.prepare('UPDATE curriculum_members SET version=version+2 WHERE user_id=? AND course_id=?').bind(u.Q1.id,courses.C1.id).run());
    assert.equal((await notificationFeed(curriculum,u.Q1)).items.some(n=>n.description==='PRIVATE-CURRICULUM-EVENT'),false);
  });
  await t.test('T2-027/031/037: aggregate class reads retain scope generations until the response',async()=>{
    const summary=afterRead(d,'SELECT count(*) AS n FROM cohort_members',()=>d.prepare('UPDATE account_principals SET version=version+2 WHERE user_id=?').bind(u.S1.id).run());
    await assert.rejects(classDetail(summary,u.S1,cls('K3')),status(404));
    const teaching=afterRead(d,'SELECT c.id,c.name,c.status',()=>d.prepare('UPDATE cohorts SET version=version+2 WHERE id=?').bind(cls('K1')).run());
    await assert.rejects(tutorDashboard(teaching,u.TA),status(403));
    const agenda=afterRead(d,'AS id,c.course_id AS courseId',()=>d.prepare('UPDATE cohort_members SET authorization_version=authorization_version+2 WHERE class_id=? AND user_id=?').bind(cls('K1'),u.S1.id).run());
    await assert.rejects(classAgenda(agenda,u.S1),status(403));
    const listed=afterRead(d,'SELECT c.*,',()=>d.prepare('UPDATE cohorts SET version=version+2 WHERE id=?').bind(cls('K1')).run());
    await assert.rejects(listClasses(listed,u.TA),status(403));
    const projects=afterRead(d,'SELECT a.id,a.title,a.class_id AS classId',()=>d.prepare('UPDATE cohort_members SET authorization_version=authorization_version+2 WHERE class_id=? AND user_id=?').bind(cls('K1'),u.S1.id).run());
    await assert.rejects(dashboardProjects(projects,u.S1),status(403));
  });
  await t.test('T2-043/047: active staff may manage only their own avatar; restricted and stale upload completion are denied',async()=>{
    const png=await sharp({create:{width:12,height:12,channels:4,background:{r:40,g:80,b:120,alpha:1}}}).png().toBuffer();
    for(const alias of ['O','TA','Q1','TQ','F0']) {
      const photo=await uploadMedia(d,u[alias],{purpose:'avatar',previousId:null},'fixture.png',png);
      assert.equal((await readMedia(d,u[alias],photo.id)).mime,'image/png');
      await denied(()=>readMedia(d,u.S1,photo.id),404);
      await clearPhoto(d,u[alias],photo.id);assert.equal(await photoInfo(d,u[alias].id),null);
    }
    for(const alias of ['P','X','M'])await denied(()=>uploadMedia(d,u[alias],{purpose:'avatar',previousId:null},'fixture.png',png),403);
    const prior=await uploadMedia(d,u.Q1,{purpose:'avatar',previousId:null},'before.png',png);
    const raced=beforeWrite(d,'UPDATE media_files SET ready=1',()=>d.prepare('UPDATE user_access SET version=version+2 WHERE user_id=?').bind(u.Q1.id).run());
    await assert.rejects(uploadMedia(raced,u.Q1,{purpose:'avatar',previousId:prior.id},'blocked.png',png),status(403));
    assert.equal((await photoInfo(d,u.Q1.id)).id,prior.id);assert.equal((await readMedia(d,u.Q1,prior.id)).mime,'image/png');
    await clearPhoto(d,u.Q1,prior.id);
  });
  await t.test('T2-003: legacy accounts without principals never acquire a role from identity refresh',async()=>{
    const id=prefix+'-missing';await seedAccessUser(d,id,'student');
    await d.prepare('DELETE FROM account_principals WHERE user_id=?').bind(id).run();
    await d.prepare("UPDATE users SET role='owner' WHERE id=?").bind(id).run();
    const refreshed=await registerIdentity(d,{userId:id,displayName:'Legacy missing principal'},false);
    assert.equal(refreshed.kind,'unclassified');
    assert.equal(await d.prepare('SELECT 1 FROM account_principals WHERE user_id=?').bind(id).first(),null);
    await denied(()=>requirePermission(d,refreshed,'student'),403);await denied(()=>requirePermission(d,refreshed,'owner'),403);
  });
  await t.test('T2-041/062: management and curriculum reads recheck authority after selecting private records',async()=>{
    for(const [needle,read] of [
      ['SELECT u.id,u.name,CASE',()=>accessOverview],
      ['SELECT i.id,i.email,i.display_name',()=>tutorOverview],
      ['SELECT id,actor_id AS actorId,target_id AS targetId',()=>permissionEvents],
    ]){
      const raced=afterRead(d,needle,()=>d.prepare('UPDATE account_principals SET version=version+2 WHERE user_id=?').bind(u.O.id).run());
      await assert.rejects(read()(raced,u.O),status(403));
    }
    const draft=afterRead(d,'SELECT * FROM curriculum_drafts WHERE',()=>d.prepare('UPDATE curriculum_members SET version=version+2 WHERE user_id=? AND course_id=?').bind(u.Q1.id,courses.C1.id).run());
    await assert.rejects(curriculumOverview(draft,u.Q1),status(403));
  });
  await t.test('T2-011/062: unchanged permission requests still require current Owner authority',async()=>{
    const target=await readAccessContext(d,u.TA),before=await fingerprint(d);
    const raced=beforeRead(d,'AND EXISTS(SELECT 1 FROM account_principals snap',()=>d.prepare('UPDATE account_principals SET version=version+2 WHERE user_id=?').bind(u.O.id).run());
    await assert.rejects(changePermission(raced,u.O,{action:'setGrant',targetId:target.id,capability:'tutor',active:true,principalVersion:target.principalVersion,grantVersion:target.grantVersions.tutor,reason:'No-op must recheck Owner'}),status(403));
    assert.equal((await readAccessContext(d,u.TA)).grantVersions.tutor,target.grantVersions.tutor);
    assert.notEqual(await fingerprint(d),before,'The deterministic barrier changed only the Owner generation');
  });
  await t.test('T2-005/006: database email policy controls access without overriding account restrictions',async()=>{
    const oldUrl=process.env.APP_URL,oldRequired=process.env.AUTH_REQUIRE_EMAIL_VERIFICATION;
    const origin='https://authorization-email.fixture.invalid',key='account_mail:'+createHash('sha256').update(origin).digest('hex').slice(0,24);
    const previous=await d.prepare('SELECT value FROM settings WHERE `key`=?').bind(key).first();
    try {
      process.env.APP_URL=origin;process.env.AUTH_REQUIRE_EMAIL_VERIFICATION='true';
      await requirePermission(d,u.O,'owner');
      await assert.rejects(requirePermission(d,u.S1,'student'),status(403));
      const email=(await d.prepare('SELECT email FROM auth_credentials WHERE user_id=?').bind(u.S1.id).first()).email;
      await d.prepare('INSERT INTO auth_email_status(user_id,email,verified_at) VALUES(?,?,?)').bind(u.S1.id,email,time).run();
      await requirePermission(d,u.S1,'student');
      await d.prepare('UPDATE auth_email_status SET email=? WHERE user_id=?').bind('obsolete@fixture.invalid',u.S1.id).run();
      await assert.rejects(requirePermission(d,u.S1,'student'),status(403));
      await d.prepare(databaseSql(d,'INSERT INTO settings(`key`,value) VALUES(?,?) ON CONFLICT(`key`) DO UPDATE SET value=excluded.value','INSERT INTO settings(`key`,value) VALUES(?,?) ON DUPLICATE KEY UPDATE value=VALUES(value)')).bind(key,JSON.stringify({required:false})).run();
      await requirePermission(d,u.S1,'student');
      for(const alias of ['P','X','M'])await assert.rejects(requirePermission(d,u[alias],'account'),status(403));
      await d.prepare('UPDATE settings SET value=? WHERE `key`=?').bind(JSON.stringify({required:true}),key).run();
      await assert.rejects(requirePermission(d,u.S1,'student'),status(403));
    }finally {
      await d.prepare('DELETE FROM auth_email_status WHERE user_id=?').bind(u.S1.id).run();
      if(previous)await d.prepare('UPDATE settings SET value=? WHERE `key`=?').bind(previous.value,key).run();else await d.prepare('DELETE FROM settings WHERE `key`=?').bind(key).run();
      if(oldUrl===undefined)delete process.env.APP_URL;else process.env.APP_URL=oldUrl;
      if(oldRequired===undefined)delete process.env.AUTH_REQUIRE_EMAIL_VERIFICATION;else process.env.AUTH_REQUIRE_EMAIL_VERIFICATION=oldRequired;
    }
  });
  await t.test('T2-025: submitting attempts validate persisted authority before returning pending',async()=>{
    await completeLesson(d,u.S1,courses.C1.id,'embedded');await initializeProgress(d,u.S1.id,courses.C1.id,'sensor',1);await d.prepare("UPDATE learning_progress_revisions SET complete=1,quiz_passed=1 WHERE user_id=? AND course_id=? AND lesson_id='sensor'").bind(u.S1.id,courses.C1.id).run();
    const lesson=courses.C1.lessons.find(l=>l.exercise),cfg={url:'https://judge.example.com',token:'fixture-only',languageIds:{python:71,javascript:63,cpp:54}},id=randomUUID();
    await initializeProgress(d,u.S1.id,courses.C1.id,lesson.id,lesson.revision);
    await assert.rejects(startAttempt(d,cfg,u.S1.id,courses.C1.id,lesson,'print(1)',id,async()=>{
      const submitting=await d.prepare('SELECT * FROM attempts WHERE id=?').bind(id).first();assert.equal(submitting.state,'submitting');
      await d.prepare('UPDATE user_access SET version=version+2 WHERE user_id=?').bind(u.S1.id).run();
      await assert.rejects(readAttempt(d,cfg,u.S1.id,submitting,lesson.revision),status(403));
      return Response.json(lesson.exercise.tests.map((_,i)=>({token:'submit-'+i})));
    }),status(403));
    assert.equal((await d.prepare('SELECT state FROM attempts WHERE id=?').bind(id).first()).state,'error');
    assert.equal(Number((await d.prepare('SELECT code_attempts FROM learning_progress_revisions WHERE user_id=? AND course_id=? AND lesson_id=?').bind(u.S1.id,courses.C1.id,lesson.id).first()).code_attempts),0);
  });
  await t.test('T2-061/062: changed Owner and recipient snapshots reject invitation and access mutations atomically',async()=>{
    const targetBefore=await d.prepare('SELECT status,version FROM user_access WHERE user_id=?').bind(u.S2.id).first();
    const eventBefore=Number((await d.prepare('SELECT count(*) n FROM access_events WHERE target_id=?').bind(u.S2.id).first()).n);
    const ownerRace=beforeWrite(d,'UPDATE user_access SET status=',()=>d.prepare('UPDATE account_principals SET version=version+2 WHERE user_id=?').bind(u.O.id).run());
    await assert.rejects(updateAccess(ownerRace,u.O,{userId:u.S2.id,version:targetBefore.version,status:'suspended',reason:'Should not commit'}),status(409));
    assert.deepEqual(await d.prepare('SELECT status,version FROM user_access WHERE user_id=?').bind(u.S2.id).first(),targetBefore);
    assert.equal(Number((await d.prepare('SELECT count(*) n FROM access_events WHERE target_id=?').bind(u.S2.id).first()).n),eventBefore);
    const email=(await d.prepare('SELECT email FROM auth_credentials WHERE user_id=?').bind(u.S2.id).first()).email;
    const invite=await createTutorInvitation(d,u.O,{email,displayName:'S2',classId:null,capability:'curriculum',courseId:null},{APP_URL:'https://authorization.fixture.invalid'});
    const token=new URL(invite.url).hash.slice('#invite='.length);
    const signed={userId:u.S2.id,email,displayName:'S2'};
    const recipientRace=beforeWrite(d,'UPDATE tutor_invitations SET accepted_user_id=',()=>d.prepare('UPDATE account_principals SET version=version+2 WHERE user_id=?').bind(u.S2.id).run());
    await assert.rejects(activateTutorInvitation(recipientRace,{token,email},signed),status(409));
    assert.equal((await readAccessContext(d,u.S2)).kind,'student');
    assert.equal((await d.prepare('SELECT accepted_at FROM tutor_invitations WHERE id=?').bind(invite.id).first()).accepted_at,null);
    const revokeRace=beforeWrite(d,'UPDATE tutor_invitations SET revoked_at=',()=>d.prepare('UPDATE account_principals SET version=version+2 WHERE user_id=?').bind(u.O.id).run());
    await assert.rejects(revokeTutorInvitation(revokeRace,u.O,invite.id),status(409));
    assert.equal((await d.prepare('SELECT revoked_at FROM tutor_invitations WHERE id=?').bind(invite.id).first()).revoked_at,null);
    await activateTutorInvitation(d,{token,email},signed);
    const recipient=await readAccessContext(d,u.S2);assert.equal(recipient.kind,'staff');assert.equal(recipient.capabilities.curriculum,true);
  });
  await t.test('T2-061: Tutor invitation adds teaching to curriculum staff without replacing their course grant',async()=>{
    const ctx=await readAccessContext(d,u.Q2),email=(await d.prepare('SELECT email FROM auth_credentials WHERE user_id=?').bind(ctx.id).first()).email;
    const prior=await d.prepare('SELECT * FROM curriculum_members WHERE user_id=? AND course_id=?').bind(ctx.id,courses.C2.id).first();
    const invite=await createTutorInvitation(d,u.O,{email,displayName:'Q2 dual',classId:null,capability:'tutor',courseId:null},{APP_URL:'https://authorization.fixture.invalid'});
    await activateTutorInvitation(d,{token:new URL(invite.url).hash.slice('#invite='.length),email},{userId:ctx.id,email,displayName:'Q2'});
    const dual=await readAccessContext(d,u.Q2);
    assert.equal(dual.kind,'staff');assert.equal(dual.capabilities.tutor,true);assert.equal(dual.capabilities.curriculum,true);
    assert.equal(dual.grantVersions.curriculum,ctx.grantVersions.curriculum);
    assert.deepEqual(await d.prepare('SELECT * FROM curriculum_members WHERE user_id=? AND course_id=?').bind(ctx.id,courses.C2.id).first(),prior);
    await requirePermission(d,u.Q2,'curriculum',courses.C2.id);
    await denied(()=>enrollCourse(d,u.Q2,courses.C1.id),403);
  });
  await t.test('T2-013/022/023/024/054/062: studio, dashboard and session reads reject changed authority before returning data',async()=>{
    await initializeProgress(d,u.S1.id,courses.C1.id,'embedded',1);
    await setRsvp(d,u.S1,task('capacity-session'),true);
    const accountABA=()=>d.prepare('UPDATE user_access SET version=version+2 WHERE user_id=?').bind(u.S1.id).run();
    const enrollmentABA=()=>d.prepare('UPDATE enrollments SET authorization_id=? WHERE user_id=? AND course_id=?').bind(randomUUID(),u.S1.id,courses.C1.id).run();
    const courseABA=()=>d.prepare('UPDATE courses SET version=version+2 WHERE id=?').bind(courses.C1.id).run();
    await assert.rejects(studioHistory(afterRead(d,'SELECT id,kind,state,score',accountABA),u.S1,courses.C1.id,'embedded'),status(403));
    await assert.rejects(studioDiscussion(afterRead(d,'SELECT id,course_id AS courseId,lesson_id',enrollmentABA),u.S1,courses.C1.id,'embedded'),status(403));
    await assert.rejects(personalStudioData(afterRead(d,'SELECT lesson_id AS lessonId',courseABA),u.S1,false),status(403));
    await assert.rejects(accountData(afterRead(d,'SELECT lesson_id AS lessonId',enrollmentABA),u.S1),status(403));
    await assert.rejects(learningSessions(afterRead(d,"CASE WHEN EXISTS(SELECT 1 FROM rsvps",enrollmentABA),u.S1),status(403));
    await assert.rejects(enrolledSessions(afterRead(d,'FROM rsvps r JOIN sessions s',enrollmentABA),u.S1),status(403));
    const ownerABA=()=>d.prepare('UPDATE account_principals SET version=version+2 WHERE user_id=?').bind(u.O.id).run();
    await assert.rejects(adminStudioData(afterRead(d,'SELECT p.*,u.name FROM learning_progress_revisions',ownerABA),u.O,false),status(403));
    await assert.rejects(studioDiscussion(afterRead(d,'SELECT id,course_id AS courseId,lesson_id',ownerABA),u.O,courses.C1.id,'embedded'),status(403));
    await assert.rejects(learningSessions(afterRead(d,'0 AS joined FROM sessions',ownerABA),u.O),status(403));
    await denied(()=>personalStudioData(d,u.Q1,false),403);
    await denied(()=>adminStudioData(d,u.S1,false),403);
    assert.ok((await personalStudioData(d,u.S1,false)).courses.length);
    assert.ok((await adminStudioData(d,u.O,false)).courses.length);
  });
  await t.test('T2-054/062: stale registration/reset cannot claim success or send an email after Owner changes',async()=>{
    const ownerABA=()=>d.prepare('UPDATE account_principals SET version=version+2 WHERE user_id=?').bind(u.O.id).run();
    await assert.rejects(setRegistration(beforeWrite(d,'INSERT INTO settings',ownerABA),u.O,{enabled:true}),status(409));
    assert.equal(await d.prepare("SELECT 1 FROM settings WHERE `key`='student_registration_enabled'").first(),null);
    await d.prepare("UPDATE learning_progress_revisions SET code_attempts=3 WHERE user_id=? AND course_id=? AND lesson_id='embedded'").bind(u.S1.id,courses.C1.id).run();
    await assert.rejects(resetStudioAttempts(beforeWrite(d,'UPDATE learning_progress_revisions SET quiz_attempts=0',ownerABA),u.O,{userId:u.S1.id,courseId:courses.C1.id,lessonId:'embedded'}),status(403));
    assert.equal(Number((await d.prepare("SELECT code_attempts FROM learning_progress_revisions WHERE user_id=? AND course_id=? AND lesson_id='embedded'").bind(u.S1.id,courses.C1.id).first()).code_attempts),3);
    const env={APP_URL:'https://email-guard.fixture.invalid',SMTP_HOST:'smtp.example.com',SMTP_PORT:'587',SMTP_USER:'fixture',SMTP_PASSWORD:'fixture',MAIL_FROM:'owner@example.com',MAIL_DELIVERY:'smtp'};
    await assert.rejects(emailSettingsOverview(afterRead(d,'SELECT value FROM settings WHERE `key`=?',ownerABA),u.O,env),status(403));
    let sent=0;
    await assert.rejects(updateEmailSettings(afterRead(d,'SELECT email FROM auth_credentials',ownerABA),u.O,{action:'test',version:1},env,async()=>{sent++;}),status(409));
    assert.equal(sent,0);
  });
  await t.test('T2-024: a quiz cannot publish answers, pass or quota under an old principal generation',async()=>{
    await completeLesson(d,u.S1,courses.C1.id,'embedded');
    const lesson=courses.C1.lessons.find(l=>l.quiz),answers=Object.fromEntries(lesson.quiz.questions.map(q=>[q.id,q.correct]));
    await initializeProgress(d,u.S1.id,courses.C1.id,lesson.id,lesson.revision);
    const prior=await d.prepare('SELECT * FROM learning_progress_revisions WHERE user_id=? AND course_id=? AND lesson_id=?').bind(u.S1.id,courses.C1.id,lesson.id).first();
    const count=Number((await d.prepare("SELECT count(*) n FROM attempts WHERE user_id=? AND course_id=? AND lesson_id=? AND kind='quiz'").bind(u.S1.id,courses.C1.id,lesson.id).first()).n);
    const raced=beforeWrite(d,'INSERT INTO attempts',()=>d.prepare('UPDATE account_principals SET version=version+2 WHERE user_id=?').bind(u.S1.id).run());
    await assert.rejects(submitQuiz(raced,u.S1,courses.C1.id,lesson.id,answers),status(403));
    assert.deepEqual(await d.prepare('SELECT * FROM learning_progress_revisions WHERE user_id=? AND course_id=? AND lesson_id=?').bind(u.S1.id,courses.C1.id,lesson.id).first(),prior);
    assert.equal(Number((await d.prepare("SELECT count(*) n FROM attempts WHERE user_id=? AND course_id=? AND lesson_id=? AND kind='quiz'").bind(u.S1.id,courses.C1.id,lesson.id).first()).n),count);
  });
  await t.test('T2-019/041/043/049/050: preview, media metadata and certificate responses pin authority until delivery',async()=>{
    const scopeABA=()=>d.prepare('UPDATE curriculum_members SET version=version+2 WHERE user_id=? AND course_id=?').bind(u.Q1.id,courses.C1.id).run();
    await assert.rejects(readPreview(afterRead(d,'SELECT data,version FROM courses WHERE id=? AND',scopeABA),u.Q1,courses.C1.id),status(403));
    await assert.rejects(previewList(afterRead(d,"SELECT id,json_extract(data,'$.title')",scopeABA),u.Q1),status(403));
    await assert.rejects(courseMediaList(afterRead(d,'SELECT id,name,mime,size,ready,bound',scopeABA),u.Q1,courses.C1.id),status(403));
    const accountABA=()=>d.prepare('UPDATE user_access SET version=version+2 WHERE user_id=?').bind(u.S1.id).run();
    await assert.rejects(ownPhoto(afterRead(d,'SELECT f.id,f.name,f.mime,f.size',accountABA),u.S1),status(403));
    const number='RS-2026-'+randomUUID().replaceAll('-','').toUpperCase();
    await d.prepare('INSERT INTO certificates(number,user_id,course_id,class_id,course_version,recipient_name,course_title,class_name,evidence,issued_at) VALUES(?,?,?,?,1,?,?,?,?,?)').bind(number,u.S1.id,courses.C1.id,cls('K1'),'S1','C1','K1','{}',time).run();
    await assert.rejects(ownedCertificate(afterRead(d,'FROM certificates WHERE number=? AND user_id=?',accountABA),u.S1,number),status(403));
    await assert.rejects(listCertificates(afterRead(d,'FROM certificates WHERE user_id=?',accountABA),u.S1),status(403));
    const ownerABA=()=>d.prepare('UPDATE account_principals SET version=version+2 WHERE user_id=?').bind(u.O.id).run();
    await assert.rejects(listCertificates(afterRead(d,'FROM certificates  ORDER BY',ownerABA),u.O,true),status(403));
    const membershipABA=()=>d.prepare('UPDATE cohort_members SET authorization_version=authorization_version+2 WHERE class_id=? AND user_id=?').bind(cls('K1'),u.S1.id).run();
    await assert.rejects(certificateStatus(afterRead(d,'FROM class_assignment_requirements b JOIN class_assignments',membershipABA),u.S1,courses.C1.id),status(403));
    await assert.rejects(issueCertificate(afterRead(d,'FROM certificates WHERE user_id=? AND course_id=?',membershipABA),u.S1,courses.C1.id,cls('K1'),true),status(403));
    await assert.rejects(ownedCertificatePdf(d,u.S1,number,'https://certificate.fixture.invalid',async()=>{await accountABA();return new Uint8Array([1]);}),status(403));
    await assert.rejects(ownedCertificatePdf(d,u.S1,number,'https://certificate.fixture.invalid',async()=>{await d.prepare('UPDATE certificates SET revoked_at=? WHERE number=?').bind(time,number).run();return new Uint8Array([1]);}),status(410));
  });
 }finally{if(priorOwner)await d.prepare("UPDATE settings SET value=? WHERE `key`='owner'").bind(priorOwner.value).run();else await d.prepare("DELETE FROM settings WHERE `key`='owner'").run();if(oldRoot===undefined)delete process.env.UPLOAD_STORAGE_DIR;else process.env.UPLOAD_STORAGE_DIR=oldRoot;await rm(root,{recursive:true,force:true});}
}
