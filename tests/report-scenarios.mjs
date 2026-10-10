import {seedPrincipal} from "./authorization-fixture.mjs";
import {databaseSql} from "../lib/database.ts";
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {managementReport} from '../lib/reports.ts';
import {reportCsv,csvCell} from '../lib/report-csv.ts';
export async function reportScenarios(t,d){
 const prefix='report-'+randomUUID(),now='2026-10-07T12:00:00.000Z',recent='2026-10-06T12:00:00.000Z',old='2026-06-01T12:00:00.000Z';
 const owner={id:prefix+'-owner',role:'owner'},tutor={id:prefix+'-tutor',role:'tutor'},alice={id:prefix+'-alice',role:'student'},bob={id:prefix+'-bob',role:'student'},empty={id:prefix+'-empty',role:'student'};
 for(const u of [owner,tutor,alice,bob,empty]){
  await d.prepare('INSERT INTO users(id,name,role) VALUES(?,?,?)').bind(u.id,u===alice?'=HYPERLINK("example")':u===tutor?'Tutor Uji':u.id,u.role).run();
  await d.prepare('INSERT INTO user_access(user_id,status,created_at,updated_at) VALUES(?,?,?,?)').bind(u.id,u===bob?'suspended':'active',old,old).run();
 }
 await d.prepare(databaseSql(d,"INSERT INTO settings(key,value) VALUES('owner',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value","INSERT INTO settings(`key`,value) VALUES('owner',?) ON DUPLICATE KEY UPDATE value=VALUES(value)")).bind(owner.id).run();
 for(const u of [owner,tutor,alice,bob,empty])await seedPrincipal(d,u.id,[owner,tutor].includes(u)?'staff':'student',u===tutor?['tutor']:[],u===bob?'suspended':'active');
 const first=prefix+'-first',second=prefix+'-second',sample=prefix+'-sample';
 for(const [id,isSample,lessons] of [[first,false,[{id:'one',revision:2,title:'Materi satu',minutes:10,module:'Dasar',blocks:[],quiz:{mode:'required',threshold:80,maxAttempts:0,feedback:'never',questions:[]}}]],[second,false,[]],[sample,true,[]]]){
  await d.prepare('INSERT INTO courses(id,data,version) VALUES(?,?,1)').bind(id,JSON.stringify({id,version:1,title:id===first?'Course "Sensor", Uji':id,description:'',category:'',level:'Pemula',published:id!==second,sample:isSample,graduationPolicyVersion:2,learningMode:"independent_allowed",policyState:"ready",lessons})).run();
 }
 for(const [user,course] of [[alice.id,first],[bob.id,first],[empty.id,first],[owner.id,first],[alice.id,second]])await d.prepare('INSERT INTO enrollments(user_id,course_id,created_at) VALUES(?,?,?)').bind(user,course,old).run();
 for(const [user,rev,complete,quiz] of [[alice.id,2,1,1],[bob.id,1,1,1],[owner.id,2,1,1]])await d.prepare('INSERT INTO learning_progress_revisions(user_id,course_id,lesson_id,revision,complete,quiz_passed) VALUES(?,?,\'one\',?,?,?)').bind(user,first,rev,complete,quiz).run();
 const activeClass=prefix+'-active',unassigned=prefix+'-unassigned',archived=prefix+'-archived';
 for(const [id,mentor,status] of [[activeClass,tutor.id,'active'],[unassigned,null,'active'],[archived,tutor.id,'archived']]){
  await d.prepare('INSERT INTO cohorts(id,course_id,mentor_id,name,description,capacity,status,created_at) VALUES(?,?,?,? ,\'\',10,?,?)').bind(id,first,mentor,id,status,old).run();
  for(const [user,status] of [[alice.id,'approved'],[bob.id,'pending']])await d.prepare('INSERT INTO cohort_members(class_id,user_id,status,created_at) VALUES(?,?,?,?)').bind(id,user,status,old).run();
  await d.prepare('INSERT INTO class_assignments(id,class_id,title,instructions,status,created_at) VALUES(?,?,\'Task\',\'Private instructions\',\'closed\',?)').bind(id+'-task',id,old).run();
 }
 const sub=async(id,cl,user,attempt,status,at,reviewed=null)=>d.prepare('INSERT INTO project_submissions(id,assignment_id,student_id,attempt,assignment_version,assessment_revision,instructions,body,url,submitted_at,status,feedback,reviewed_at) VALUES(?,?,?,?,1,1,\'Private instructions\',\'PRIVATE WORK\',\'https://private.example\',?,?,\'PRIVATE FEEDBACK\',?)').bind(id,cl+'-task',user,attempt,at,status,reviewed).run();
 await sub(prefix+'-s-old',activeClass,alice.id,1,'submitted',old);
 await sub(prefix+'-s-new',activeClass,alice.id,2,'submitted',recent);
 await sub(prefix+'-s-ineligible',activeClass,bob.id,1,'submitted',recent);
 await sub(prefix+'-s-unassigned',unassigned,alice.id,1,'submitted',recent);
 await sub(prefix+'-s-archived',archived,alice.id,1,'submitted',recent);
 await sub(prefix+'-s-review',activeClass,empty.id,1,'accepted',old,recent);
 for(const [id,user,kind,at] of [['quiz',alice.id,'quiz',recent],['code',alice.id,'code',old],['future',alice.id,'quiz','2027-01-01T00:00:00.000Z'],['owner',owner.id,'quiz',recent]])await d.prepare('INSERT INTO attempts(id,user_id,course_id,lesson_id,revision,kind,state,data,created_at) VALUES(?,?,?,\'one\',2,?,\'finished\',\'PRIVATE ANSWERS\',?)').bind(prefix+'-'+id,user,first,kind,at).run();
 await d.prepare('INSERT INTO messages(id,course_id,lesson_id,user_id,name,role,body,created_at) VALUES(?,?,\'one\',?,\'Name\',\'student\',\'PRIVATE DISCUSSION\',?)').bind(prefix+'-msg',first,alice.id,recent).run();
 let report;
 await t.test('reports reject non-owner access before querying data',async()=>{
  for(const u of [alice,tutor])await assert.rejects(managementReport(d,{...u,role:'owner'}),e=>e.status===403);
 });
 await t.test('completion deduplicates participants and ignores stale lessons, owner previews and empty courses',async()=>{
  report=await managementReport(d,owner,{courseId:first},now);assert.equal(report.summary.uniqueParticipants,3);assert.equal(report.summary.courseParticipants,3);assert.equal(report.summary.finished,1);
  const a=report.participants.find(p=>p.userId===alice.id),b=report.participants.find(p=>p.userId===bob.id);assert.equal(a.percent,100);assert.equal(b.percent,0);assert.equal(b.stale,1);assert.equal(b.accessStatus,'suspended');assert.equal(report.courses[0].notStarted,0);
  const zero=await managementReport(d,owner,{courseId:second},now);assert.equal(zero.participants[0].finished,false);assert.equal(zero.participants[0].percent,0);
  await d.prepare('UPDATE learning_progress_revisions SET quiz_passed=0 WHERE user_id=? AND course_id=?').bind(alice.id,first).run();assert.equal((await managementReport(d,owner,{courseId:first},now)).summary.finished,0);await d.prepare('UPDATE learning_progress_revisions SET quiz_passed=1 WHERE user_id=? AND course_id=?').bind(alice.id,first).run();
 });
 await t.test('activity applies the rolling window, excludes future events, and exposes no work, feedback or answer content',async()=>{
  const a=report.participants.find(p=>p.userId===alice.id);assert.equal(a.quizAttempts,1);assert.equal(a.codeAttempts,0);assert.equal(a.posts,1);assert.equal(a.submissions,3);assert.equal(a.lastActivityAt,recent);assert.equal(report.summary.activeParticipants,2);
  const serialized=JSON.stringify(report);for(const privateText of ['PRIVATE WORK','PRIVATE FEEDBACK','PRIVATE ANSWERS','PRIVATE DISCUSSION','Private instructions','https://private.example'])assert.equal(serialized.includes(privateText),false);
  const shorter=await managementReport(d,owner,{courseId:first,days:7},'2026-10-30T12:00:00.000Z');assert.equal(shorter.summary.activeParticipants,0);assert.equal(shorter.participants.find(p=>p.userId===alice.id).lastActivityAt,recent);
 });
 await t.test('Tutor backlog includes latest pending work, closed tasks and unassigned classes while excluding archived/ineligible work',async()=>{
  assert.equal(report.summary.pendingReviews,2);const t=report.tutors.find(t=>t.id===tutor.id),free=report.tutors.find(t=>t.id===null);
  assert.equal(t.classes,1);assert.equal(t.pendingReviews,1);assert.equal(t.approvedMemberships,1);assert.equal(t.oldestSubmittedAt,recent);assert.equal(t.reviewsInPeriod,1);assert.equal(free.pendingReviews,1);
 });
 await t.test('sample course visibility is explicit and unknown courses fail without leaking a broader report',async()=>{
  assert.equal((await managementReport(d,owner,{courseId:sample},now)).courses.length,0);assert.equal((await managementReport(d,owner,{courseId:sample,includeSamples:true},now)).courses.length,1);
  await assert.rejects(managementReport(d,owner,{courseId:prefix+'-absent'},now),e=>e.status===404);await assert.rejects(managementReport(d,owner,{days:1},now),e=>e.status===400);
 });
 await t.test('CSV exports protect formulas, retain Unicode, escape delimiters and preserve the selected reporting context',async()=>{
  const csv=reportCsv(report,'participants');assert.ok(csv.startsWith('\uFEFF'));assert.ok(csv.includes('"\'\t=HYPERLINK(""example"")"'));assert.ok(csv.includes('"Course ""Sensor"", Uji"'));assert.ok(csv.includes(report.periodStart));assert.ok(!csv.includes('PRIVATE'));
  for(const value of ['=1+1','+1','-2','@SUM(1)','  =1','\t=1','\r=1','\n=1','＝1','＋1','－1','＠SUM(1)'])assert.ok(csvCell(value).startsWith('"\'\t'));assert.equal(csvCell('A\nB'),'"A\nB"');assert.equal(csvCell(null),'""');
  for(const kind of ['courses','participants','tutors'])assert.ok(reportCsv(report,kind).includes('Waktu laporan (UTC)'));
 });
 await t.test('revoked or renewed grants do not attribute obsolete class assignments to an active Tutor',async()=>{
  await d.prepare("UPDATE staff_grants SET active=0,version=version+1 WHERE user_id=? AND capability='tutor'").bind(tutor.id).run();
  let changed=await managementReport(d,owner,{courseId:first},now);
  assert.equal(changed.tutors.some(row=>row.id===tutor.id),false);
  assert.equal(changed.tutors.find(row=>row.id===null).classes,2);
  assert.equal(changed.summary.pendingReviews,2);
  await d.prepare("UPDATE staff_grants SET active=1,version=version+1 WHERE user_id=? AND capability='tutor'").bind(tutor.id).run();
  changed=await managementReport(d,owner,{courseId:first},now);
  assert.equal(changed.tutors.find(row=>row.id===tutor.id).classes,0);
  assert.equal(changed.tutors.find(row=>row.id===null).classes,2);
 });

 await t.test('participant names follow the saved profile and remain protected in CSV exports',async()=>{
  await d.prepare('INSERT INTO profiles(user_id,data,version,updated_at) VALUES(?,?,1,?)').bind(alice.id,JSON.stringify({displayName:'=Profil Éléonore'}),recent).run();
  const changed=await managementReport(d,owner,{courseId:first},now);
  assert.equal(changed.participants.find(row=>row.userId===alice.id).name,'=Profil Éléonore');
  assert.ok(reportCsv(changed,'participants').includes("'\t=Profil Éléonore"));
 });

}
