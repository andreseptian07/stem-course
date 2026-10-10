import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {seedAccessUser} from './authorization-fixture.mjs';
import {graduationCourse} from './graduation-scenarios.mjs';
import {databaseSql} from '../lib/database.ts';
import {saveCourse,completeLesson,submitQuiz,readProgress} from '../lib/course-data.ts';
import {saveClass,setMembership} from '../lib/classes.ts';
import {saveAssignment,submitProject,reviewProject,projectList} from '../lib/projects.ts';
import {loadGraduationContext} from '../lib/graduation-data.ts';
import {curriculumOverview,mutateCurriculum} from '../lib/curriculum.ts';
import {academicInventory} from '../lib/academic-migration.ts';
import {issueCertificate} from '../lib/certificates.ts';
const rejected=(...codes)=>e=>codes.includes(e.status);
export async function graduationAcceptance(t,d){
 const prefix='g4a-'+randomUUID().slice(0,8),owner={id:prefix+'-o',name:'Owner',role:'owner'},student={id:prefix+'-s',name:'Siswa',role:'student'},tutor={id:prefix+'-t',name:'Tutor',role:'student'};
 const old=await d.prepare("SELECT value FROM settings WHERE `key`='owner'").first();
 for(const [u,kind,caps] of [[owner,'staff',[]],[student,'student',[]],[tutor,'staff',['tutor']]])await seedAccessUser(d,u.id,kind,caps);
 await d.prepare(databaseSql(d,"INSERT INTO settings(key,value) VALUES('owner',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value","INSERT INTO settings(`key`,value) VALUES('owner',?) ON DUPLICATE KEY UPDATE value=VALUES(value)")).bind(owner.id).run();
 let c=graduationCourse();c.id=prefix+'-course';c.lessons[0].quiz={mode:'required',threshold:100,maxAttempts:10,feedback:'always',questions:Array.from({length:30},(_,i)=>({id:'q'+i,prompt:'Q'+i,options:['Benar','Salah'],correct:[0],explanation:''}))};c.lessons[1].reviewRequirements.push({...c.lessons[1].reviewRequirements[0],id:'review2',title:'Bukti kedua'});c=await saveCourse(d,owner,c);
 const A=prefix+'-A',B=prefix+'-B';
 for(const id of [A,B]){await saveClass(d,owner,{id,version:0,courseId:c.id,mentorId:tutor.id,targetGrantVersion:1,name:id,description:'',startsAt:null,endsAt:null,capacity:10,status:'active'});await setMembership(d,owner,id,student.id,'approved');for(const r of c.lessons[1].reviewRequirements)await saveAssignment(d,tutor,{id:id+'-'+r.id,classId:id,version:0,title:r.title,instructions:r.instructions,rubric:r.rubric,requirementId:r.id,dueAt:null,status:'published'});}
 const answer=wrong=>Object.fromEntries(c.lessons[0].quiz.questions.map((q,i)=>[q.id,[wrong&&i===29?1:0]]));
 const submit=async taskId=>{const payload={action:'submit',id:randomUUID(),assignmentId:taskId,assignmentVersion:1,previousId:null,previousVersion:0,body:'Bukti',url:'',attachmentIds:[]};await submitProject(d,student,payload);return payload;};
 const review=async(s,version,status='accepted',score=80)=>reviewProject(d,tutor,{action:'review',submissionId:s.id,version,status,score,feedback:'Bukti penerimaan',requestId:randomUUID()});
 try{
  await t.test('T4 course review standards differ by course; curriculum draft changes force regrading and retain issued evidence',async()=>{
   const curriculum={id:prefix+'-q',name:'Kurikulum',role:'curriculum'};await seedAccessUser(d,curriculum.id,'staff',['curriculum']);
   const fixtures=[];
   for(const threshold of [65,90]){
    let course=graduationCourse();course.id=prefix+'-threshold-'+threshold;course.reviewPassThreshold=threshold;course=await saveCourse(d,owner,course);
    const classId=course.id+'-A',taskId=classId+'-review';await saveClass(d,owner,{id:classId,version:0,courseId:course.id,mentorId:tutor.id,targetGrantVersion:1,name:classId,description:'',startsAt:null,endsAt:null,capacity:10,status:'active'});await setMembership(d,owner,classId,student.id,'approved');
    await saveAssignment(d,tutor,{id:taskId,classId,version:0,title:'Review standar course',instructions:'Kerjakan proyek',rubric:'Mengikuti standar course',requirementId:'review1',dueAt:null,status:'published'});
    await completeLesson(d,student,course.id,'intro',classId);const submission=await submit(taskId);
    const below=threshold-1;await assert.rejects(()=>review(submission,1,'accepted',below),rejected(400));
    await review(submission,1,'changes_requested',threshold);assert.equal((await loadGraduationContext(d,student,course.id,classId)).state.lessons[2].unlocked,false);
    await review(submission,2,'accepted',threshold);await completeLesson(d,student,course.id,'project',classId);await completeLesson(d,student,course.id,'next',classId);
    const certificate=await issueCertificate(d,student,course.id,classId,true);const evidence=(await d.prepare('SELECT evidence FROM certificates WHERE number=?').bind(certificate.number).first()).evidence;assert.equal(JSON.parse(evidence).reviewPassThreshold,threshold);
    assert.equal((await projectList(d,tutor,classId)).reviewPassThreshold,threshold);fixtures.push({course,classId,taskId,submission,certificate,evidence});
   }
   const low=fixtures[0],high=fixtures[1];await assert.rejects(()=>review(high.submission,3,'accepted',80),rejected(400));
   await mutateCurriculum(d,owner,{action:'member',courseId:low.course.id,userId:curriculum.id,version:0,active:true,targetGrantVersion:1});await mutateCurriculum(d,curriculum,{action:'start',courseId:low.course.id,version:1,draftVersion:0});
   const draft=(await curriculumOverview(d,curriculum)).items.find(i=>i.course.id===low.course.id).draft;const next=structuredClone(draft.course);next.reviewPassThreshold=90;next.lessons[1].change={kind:'editorial',reason:'Tidak boleh menghindari penilaian ulang'};
   await mutateCurriculum(d,curriculum,{action:'save',course:next,version:draft.version});assert.equal((await loadGraduationContext(d,student,low.course.id,low.classId)).state.passed,true);
   await mutateCurriculum(d,curriculum,{action:'submit',courseId:low.course.id,version:2,note:''});await assert.rejects(()=>mutateCurriculum(d,curriculum,{action:'publish',courseId:low.course.id,version:3,note:''}),rejected(403));await mutateCurriculum(d,owner,{action:'publish',courseId:low.course.id,version:3,note:''});
   const changed=await loadGraduationContext(d,student,low.course.id,low.classId);assert.equal(changed.course.reviewPassThreshold,90);assert.deepEqual(changed.course.lessons.map(l=>l.revision),[1,2,1]);assert.equal(changed.state.lessons[1].stagePassed,false);assert.equal(changed.state.lessons[2].unlocked,false);assert.equal(changed.state.lessons[1].requiredReviews[0].minimumScore,90);
   await assert.rejects(()=>review(low.submission,3,'accepted',90),rejected(409));
   const payload={action:'submit',id:randomUUID(),assignmentId:low.taskId,assignmentVersion:1,previousId:low.submission.id,previousVersion:3,body:'Standar baru',url:'',attachmentIds:[]};await submitProject(d,student,payload);await assert.rejects(()=>review(payload,1,'accepted',89),rejected(400));await review(payload,1,'accepted',90);await completeLesson(d,student,low.course.id,'project',low.classId,randomUUID(),2);assert.equal((await loadGraduationContext(d,student,low.course.id,low.classId)).state.passed,true);
   const prior=await issueCertificate(d,student,low.course.id,low.classId,true);assert.equal(prior.number,low.certificate.number);const savedEvidence=(await d.prepare('SELECT evidence FROM certificates WHERE number=?').bind(prior.number).first()).evidence;assert.equal(savedEvidence,low.evidence);assert.equal(JSON.parse(savedEvidence).reviewPassThreshold,65);
   await assert.rejects(()=>saveCourse(d,tutor,{...changed.course,reviewPassThreshold:0}),rejected(403));
   for(const invalid of [-1,101,80.5,'90',null])await assert.rejects(()=>saveCourse(d,owner,{...changed.course,reviewPassThreshold:invalid}));
  });
  await t.test('T4-001/002/010 97 is insufficient for threshold 100; activity cannot be confirmed before passing',async()=>{
   const failed=await submitQuiz(d,student,c.id,'intro',answer(true),A,randomUUID(),1);assert.equal(failed.score,97);assert.equal(failed.passed,false);
   await assert.rejects(()=>completeLesson(d,student,c.id,'intro',A),rejected(403));assert.equal((await loadGraduationContext(d,student,c.id,A)).state.lessons[1].unlocked,false);
   await submitQuiz(d,student,c.id,'intro',answer(false),A,randomUUID(),1);assert.equal((await loadGraduationContext(d,student,c.id,A)).state.lessons[1].unlocked,false);await completeLesson(d,student,c.id,'intro',A);
  });
  await t.test('T4-013/019 every requirement is bound to each class; platform evidence is shared without sharing review',async()=>{
   const first=await submit(A+'-review1');await review(first,1);
   assert.equal((await loadGraduationContext(d,student,c.id,A)).state.lessons[2].unlocked,false);await assert.rejects(()=>completeLesson(d,student,c.id,'project',A),rejected(403));
   const second=await submit(A+'-review2');await review(second,1);await completeLesson(d,student,c.id,'project',A);
   assert.equal((await loadGraduationContext(d,student,c.id,A)).state.lessons[2].unlocked,true);assert.equal((await loadGraduationContext(d,student,c.id,B)).state.lessons[2].unlocked,false);
   await review(second,2,'changes_requested',80);assert.equal((await loadGraduationContext(d,student,c.id,A)).state.lessons[2].unlocked,false);await review(second,3);
   await completeLesson(d,student,c.id,'next',A);const cert=await issueCertificate(d,student,c.id,A,true);assert.equal(JSON.parse((await d.prepare('SELECT evidence FROM certificates WHERE number=?').bind(cert.number).first()).evidence).reviews.length,2);
  });
  await t.test('T4-012/034 optional revision does not block; closed accepted required evidence remains valid',async()=>{
   const optional=A+'-optional';await saveAssignment(d,tutor,{id:optional,classId:A,version:0,title:'Opsional',instructions:'Pengayaan',rubric:'',requirementId:null,dueAt:null,status:'published'});const submitted=await submit(optional);await review(submitted,1,'changes_requested',50);
   for(const r of c.lessons[1].reviewRequirements)await saveAssignment(d,tutor,{id:A+'-'+r.id,classId:A,version:1,title:r.title,instructions:r.instructions,rubric:r.rubric,requirementId:r.id,dueAt:null,status:'closed'});
   assert.equal((await loadGraduationContext(d,student,c.id,A)).state.passed,true);assert.equal((await projectList(d,student,A)).tasks.find(x=>x.id===optional).requirementId,null);
  });
  await t.test('T4-040/044/051 draft changes cannot reuse old publication approval or affect active students',async()=>{
   await mutateCurriculum(d,owner,{action:'start',courseId:c.id,version:c.version,draftVersion:0});let draft=(await curriculumOverview(d,owner)).items.find(i=>i.course.id===c.id).draft;
   const proposed=structuredClone(draft.course);proposed.lessons[1].reviewRequirements[0].instructions='Standar substansial pada draf saja';await mutateCurriculum(d,owner,{action:'save',course:proposed,version:draft.version});draft=(await curriculumOverview(d,owner)).items.find(i=>i.course.id===c.id).draft;
   assert.equal((await loadGraduationContext(d,student,c.id,A)).state.passed,true);await mutateCurriculum(d,owner,{action:'submit',courseId:c.id,version:draft.version,note:''});const submitted=(await curriculumOverview(d,owner)).items.find(i=>i.course.id===c.id).draft;
   await mutateCurriculum(d,owner,{action:'requestChanges',courseId:c.id,version:submitted.version,note:'Perlu penyesuaian'});await mutateCurriculum(d,owner,{action:'save',course:{...proposed,title:'Payload pengganti'},version:submitted.version+1});
   await assert.rejects(()=>mutateCurriculum(d,owner,{action:'publish',courseId:c.id,version:submitted.version,note:'Approval lama'}),rejected(409));assert.equal((await loadGraduationContext(d,student,c.id,A)).state.passed,true);
   const latest=(await curriculumOverview(d,owner)).items.find(i=>i.course.id===c.id).draft;await mutateCurriculum(d,owner,{action:'submit',courseId:c.id,version:latest.version,note:''});await mutateCurriculum(d,owner,{action:'publish',courseId:c.id,version:latest.version+1,note:'Persetujuan terbaru'});
   const state=(await loadGraduationContext(d,student,c.id,A)).state;assert.equal(state.passed,false);assert.equal(state.lessons[2].unlocked,false);assert.equal((await readProgress(d,student.id,c.id)).find(p=>p.lessonId==='intro').quizPassed,1);
  });
  await t.test('T4-036/038/051 missing binding and invalid direct publication fail closed without loss of drafts',async()=>{
   const context=await loadGraduationContext(d,student,c.id,A);const mapping=await d.prepare('SELECT * FROM class_assignment_requirements WHERE class_id=? AND requirement_id=?').bind(A,'review1').first();
   await d.prepare('DELETE FROM class_assignment_requirements WHERE class_id=? AND requirement_id=?').bind(A,'review1').run();assert.equal((await loadGraduationContext(d,student,c.id,A)).state.passed,false);
   await d.prepare('INSERT INTO class_assignment_requirements(class_id,requirement_id,course_id,lesson_id,assignment_id,requirement_revision,version) VALUES(?,?,?,?,?,?,?)').bind(mapping.class_id,mapping.requirement_id,mapping.course_id,mapping.lesson_id,mapping.assignment_id,mapping.requirement_revision,mapping.version).run();
   const invalid=structuredClone(context.course);invalid.lessons[2].blocks=[{id:'empty',type:'text',content:'   '}];await assert.rejects(()=>saveCourse(d,owner,invalid),rejected(400));
   const draft={...invalid,id:prefix+'-empty',version:0,published:false};assert.equal((await saveCourse(d,owner,draft)).published,false);await assert.rejects(()=>saveCourse(d,owner,{...draft,version:1,published:true}),rejected(400));
  });
  await t.test('T4-045/050 prerequisite reorder is audited, rejects stale completion and preserves unrelated history',async()=>{
   const before=await loadGraduationContext(d,student,c.id,A),ordered=structuredClone(before.course),history=await readProgress(d,student.id,c.id);
   ordered.lessons=[ordered.lessons[2],ordered.lessons[0],ordered.lessons[1]];const published=await saveCourse(d,owner,ordered);
   assert.equal(published.lessons[0].id,'next');assert.equal(published.lessons[0].revision,before.course.lessons[2].revision+1);
   const after=await loadGraduationContext(d,student,c.id,A);assert.equal(after.state.passed,false);assert.equal(after.state.lessons[1].unlocked,false);
   await assert.rejects(()=>completeLesson(d,student,c.id,'next',A,randomUUID(),before.course.lessons[2].revision),rejected(409));
   assert.deepEqual(await readProgress(d,student.id,c.id),history);
   const events=(await d.prepare('SELECT data FROM academic_change_events WHERE object_id=?').bind(c.id).all()).results;assert.equal(events.some(e=>JSON.parse(e.data).next?.lessons[0].id==='next'),true);
  });
 }finally{if(old)await d.prepare("UPDATE settings SET value=? WHERE `key`='owner'").bind(old.value).run();}
}
// Run only in a fresh disposable schema. This models the activation protocol,
// not a claim that unknown hosting processes have actually been drained.
export async function graduationActivation(t,d){
 await t.test('T4-070/075 explicit drain, pending work and legacy reconciliation gate the local switch',async()=>{
  const c=graduationCourse();c.id='activation-'+randomUUID();c.lessons=c.lessons.slice(0,1);const s=randomUUID(),pending=randomUUID(),reviewId=randomUUID();
  await d.prepare('INSERT INTO courses(id,data,version) VALUES(?,?,1)').bind(c.id,JSON.stringify(c)).run();
  try{
   assert.equal((await academicInventory(d)).mayActivate,false);assert.equal((await academicInventory(d,'drained')).mayActivate,true);
   await d.prepare("INSERT INTO attempts(id,user_id,course_id,lesson_id,revision,kind,state,data,created_at) VALUES(?,'activation-student',?,'intro',1,'code','submitting','{}','2026-10-10')").bind(pending,c.id).run();assert.equal((await academicInventory(d,'drained')).mayActivate,false);await d.prepare("UPDATE attempts SET state='pending' WHERE id=?").bind(pending).run();assert.equal((await academicInventory(d,'drained')).mayActivate,false);await d.prepare("UPDATE attempts SET state='error' WHERE id=?").bind(pending).run();
   await d.prepare("INSERT INTO project_submissions(id,assignment_id,student_id,attempt,assignment_version,instructions,body,url,submitted_at,status,score,reviewer_name,reviewed_at) VALUES(?,'activation-task','activation-student',1,1,'Original','Legacy','','2026-10-10','accepted',90,'Unknown','2026-10-10')").bind(s).run();assert.equal((await academicInventory(d,'drained')).mayActivate,false);
   await d.prepare("INSERT INTO project_reviews(id,submission_id,sequence,reviewer_id,reviewer_name,status,score,feedback,snapshot,request_id,created_at) VALUES(?,?,1,'activation-tutor','Tutor','changes_requested',79,'Reconciled','{}',?,'2026-10-10')").bind(reviewId,s,randomUUID()).run();
   assert.equal((await academicInventory(d,'drained')).mayActivate,false);await d.prepare("UPDATE project_submissions SET status='changes_requested',score=79 WHERE id=?").bind(s).run();assert.equal((await academicInventory(d,'drained')).mayActivate,true);
   // Rolling back to an unknown writer state never removes V2 evidence.
   assert.equal((await academicInventory(d)).mayActivate,false);assert.equal((await d.prepare('SELECT count(*) AS n FROM project_reviews WHERE id=?').bind(reviewId).first()).n,1);
  }finally{await d.prepare('DELETE FROM courses WHERE id=?').bind(c.id).run();await d.prepare('DELETE FROM attempts WHERE id=?').bind(pending).run();await d.prepare('DELETE FROM project_reviews WHERE id=?').bind(reviewId).run();await d.prepare('DELETE FROM project_submissions WHERE id=?').bind(s).run();}
 });
}
