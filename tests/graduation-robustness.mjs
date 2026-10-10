import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileStorage,privateDirectory} from '../lib/project-files.ts';
import {readMedia} from '../lib/media-data.ts';
import {startAttempt,readAttempt,releaseAttempt} from '../lib/code-attempts.ts';
import {sampleCourse} from '../lib/seed.ts';
import {encode} from '../lib/judge.ts';
import {enrollCourse} from '../lib/account-data.ts';
import {seedAccessUser} from './authorization-fixture.mjs';
import {graduationCourse} from './graduation-scenarios.mjs';
import {databaseSql} from '../lib/database.ts';
import {saveCourse,completeLesson,submitQuiz,accessibleLesson,readProgress,initializeProgress} from '../lib/course-data.ts';
import {saveClass,setMembership,resetClassAttempts} from '../lib/classes.ts';
import {saveAssignment,submitProject,reviewProject,projectList} from '../lib/projects.ts';
import {loadGraduationContext,academicProofPredicate} from '../lib/graduation-data.ts';
import {academicInventory,backfillAcademicHistory} from '../lib/academic-migration.ts';
import {issueCertificate} from '../lib/certificates.ts';
const rejected=(...codes)=>e=>codes.includes(e.status);
function beforeBatch(d,fn){let once=true;return {...d,prepare:q=>d.prepare(q),async batch(statements){if(once){once=false;await fn();}return d.batch(statements);}};}
function beforeRun(d,needle,fn){let once=true;const wrap=(statement,match)=>({bind(...v){return wrap(statement.bind(...v),match);},first:()=>statement.first(),all:()=>statement.all(),async run(){if(match&&once){once=false;await fn();}return statement.run();}});return {...d,prepare:q=>wrap(d.prepare(q),q.includes(needle)),batch:s=>d.batch(s)};}
export async function graduationRobustness(t,d){
 const prefix='g4r-'+randomUUID().slice(0,8),owner={id:prefix+'-o',name:'Owner',role:'owner'},tutor={id:prefix+'-t',name:'Tutor',role:'student'},student={id:prefix+'-s',name:'Siswa',role:'student'},classId=prefix+'-A',assignmentId=prefix+'-task';
 const oldOwner=await d.prepare("SELECT value FROM settings WHERE `key`='owner'").first();
 for(const [u,kind,caps] of [[owner,'staff',[]],[tutor,'staff',['tutor']],[student,'student',[]]])await seedAccessUser(d,u.id,kind,caps);
 await d.prepare(databaseSql(d,"INSERT INTO settings(key,value) VALUES('owner',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value","INSERT INTO settings(`key`,value) VALUES('owner',?) ON DUPLICATE KEY UPDATE value=VALUES(value)")).bind(owner.id).run();
 let c=graduationCourse();c.id=prefix+'-course';c.lessons[0].quiz={mode:'required',threshold:100,maxAttempts:5,feedback:'always',questions:[{id:'q',prompt:'Pilih benar',options:['Benar','Salah'],correct:[0],explanation:'Jawaban benar.'}]};c=await saveCourse(d,owner,c);
 await saveClass(d,owner,{id:classId,version:0,courseId:c.id,mentorId:tutor.id,targetGrantVersion:1,name:'Kelas A',description:'',startsAt:null,endsAt:null,capacity:10,status:'active'});await setMembership(d,owner,classId,student.id,'approved');
 const task={id:assignmentId,classId,version:0,title:'Praktik',instructions:'Kerjakan sesuai petunjuk.',rubric:'Hasil minimal 80.',requirementId:'review1',dueAt:null,status:'published'};
 await saveAssignment(d,tutor,task);
 let submission;
 const review=async(status='accepted',score=80)=>{const row=await d.prepare('SELECT version FROM project_submissions WHERE id=?').bind(submission.id).first();return reviewProject(d,tutor,{action:'review',submissionId:submission.id,version:row.version,status,score,feedback:'Bukti uji',requestId:randomUUID()});};
 try{
  await t.test('T4-001/002/016/054 quiz receipt is stable and old pass survives a later failed attempt',async()=>{
   const id=randomUUID();const answer={q:[0]};await submitQuiz(d,student,c.id,'intro',answer,classId,id,1);await submitQuiz(d,student,c.id,'intro',answer,classId,id,1);
   assert.equal((await readProgress(d,student.id,c.id))[0].quizAttempts,1);
   await assert.rejects(()=>submitQuiz(d,student,c.id,'intro',{q:[1]},classId,id,1),rejected(409));
   await assert.rejects(()=>accessibleLesson(d,student,c.id,'project',classId),rejected(403));
   await submitQuiz(d,student,c.id,'intro',{q:[1]},classId,randomUUID(),1);
   const p=(await readProgress(d,student.id,c.id))[0];assert.equal(p.score,0);assert.equal(p.quizPassed,1);assert.equal(p.quizAttempts,2);
   await completeLesson(d,student,c.id,'intro',classId);await assert.rejects(()=>completeLesson(d,student,c.id,'project',classId),rejected(403));
  });
  await t.test('T4-007/011 invalid required acceptance has zero review and receipt effects',async()=>{
   submission={action:'submit',id:randomUUID(),assignmentId,assignmentVersion:1,previousId:null,previousVersion:0,body:'Proyek',url:'',attachmentIds:[]};await submitProject(d,student,submission);
   for(const score of [null,79,-1,101,80.5,'80',NaN])await assert.rejects(()=>reviewProject(d,tutor,{action:'review',submissionId:submission.id,version:1,status:'accepted',score,feedback:'Invalid',requestId:randomUUID()}));
   assert.equal(Number((await d.prepare('SELECT count(*) AS n FROM project_reviews WHERE submission_id=?').bind(submission.id).first()).n),0);assert.equal((await d.prepare('SELECT version,status FROM project_submissions WHERE id=?').bind(submission.id).first()).version,1);
   await review('changes_requested',80);assert.equal((await loadGraduationContext(d,student,c.id,classId)).state.lessons[2].unlocked,false);await review();
   await assert.rejects(()=>completeLesson(beforeBatch(d,()=>review('changes_requested',79)),student,c.id,'project',classId),rejected(409));
   assert.equal((await readProgress(d,student.id,c.id)).find(p=>p.lessonId==='project')?.complete,0);
   await review();await completeLesson(d,student,c.id,'project',classId);
  });
  await t.test('T4-052 two review tabs admit one version and retain append-only history',async()=>{
   const row=await d.prepare('SELECT version FROM project_submissions WHERE id=?').bind(submission.id).first();
   const payload={action:'review',submissionId:submission.id,version:row.version,status:'accepted',score:90,feedback:'Parallel'};
   const results=await Promise.allSettled([1,2].map(()=>reviewProject(d,tutor,{...payload,requestId:randomUUID()})));
   assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.status,409);
   assert.equal(Number((await d.prepare('SELECT count(*) AS n FROM project_reviews WHERE submission_id=?').bind(submission.id).first()).n),5);
  });
  await t.test('T4-057 review changed after evaluation prevents next completion and certificate',async()=>{
   await assert.rejects(()=>completeLesson(beforeBatch(d,()=>review('changes_requested',79)),student,c.id,'next',classId),rejected(409));
   assert.equal((await readProgress(d,student.id,c.id)).find(p=>p.lessonId==='next')?.complete,0);
   await review();await completeLesson(d,student,c.id,'next',classId);
   await assert.rejects(()=>issueCertificate(beforeRun(d,'INTO certificates',()=>review('changes_requested',79)),student,c.id,classId,true),rejected(403,409));
   assert.equal(Number((await d.prepare('SELECT count(*) AS n FROM certificates WHERE user_id=?').bind(student.id).first()).n),0);await review();
  });
  await t.test('T4-058/059 predicate rejects a newer attempt and a new binding phantom',async()=>{
   const ctx=await loadGraduationContext(d,student,c.id,classId),proof=academicProofPredicate(ctx);
   await review('changes_requested',79);
   const old=await d.prepare('SELECT version FROM project_submissions WHERE id=?').bind(submission.id).first();
   const next={...submission,id:randomUUID(),previousId:submission.id,previousVersion:old.version,body:'Revisi'};
   await submitProject(d,student,next);submission=next;
   assert.equal(await d.prepare(`SELECT 1 WHERE ${proof.sql}`).bind(...proof.binds).first(),null);assert.equal((await loadGraduationContext(d,student,c.id,classId)).state.passed,false);await review();
   const ctx2=await loadGraduationContext(d,student,c.id,classId),proof2=academicProofPredicate(ctx2);
   await d.prepare("INSERT INTO class_assignment_requirements(class_id,requirement_id,course_id,lesson_id,assignment_id,requirement_revision) VALUES(?,?,?,?,?,1)").bind(classId,'phantom',c.id,'project',prefix+'-phantom').run();
   assert.equal(await d.prepare(`SELECT 1 WHERE ${proof2.sql}`).bind(...proof2.binds).first(),null);
   await d.prepare("DELETE FROM class_assignment_requirements WHERE class_id=? AND requirement_id='phantom'").bind(classId).run();
  });
  await t.test('T4-053 two resubmission tabs cannot create duplicate attempts',async()=>{
   await review('changes_requested',79);const prev=await d.prepare('SELECT version FROM project_submissions WHERE id=?').bind(submission.id).first();
   const results=await Promise.allSettled([1,2].map(()=>submitProject(d,student,{...submission,id:randomUUID(),previousId:submission.id,previousVersion:prev.version,body:'Revisi paralel'})));
   assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.status,409);
   const row=await d.prepare('SELECT id FROM project_submissions WHERE assignment_id=? ORDER BY attempt DESC LIMIT 1').bind(assignmentId).first();submission={...submission,id:row.id};await review();
  });
  await t.test('T4-017/062 quota reset preserves pass, value and evidence; pending code blocks reset',async()=>{
   const before=(await readProgress(d,student.id,c.id)).find(p=>p.lessonId==='intro');await resetClassAttempts(d,tutor,classId,student.id,'intro');
   const after=(await readProgress(d,student.id,c.id)).find(p=>p.lessonId==='intro');for(const key of ['complete','quizPassed','codePassed','score','quizEvidenceId'])assert.equal(after[key],before[key]);assert.equal(after.quizAttempts,0);
   const id=randomUUID();await d.prepare("INSERT INTO attempts(id,user_id,course_id,lesson_id,revision,kind,state,data,created_at) VALUES(?,?,?,'intro',1,'code','pending','{}','2026-10-10')").bind(id,student.id,c.id).run();await assert.rejects(()=>resetClassAttempts(d,tutor,classId,student.id,'intro'),rejected(409));await d.prepare('DELETE FROM attempts WHERE id=?').bind(id).run();
  });
  await t.test('T4-060 review changes after media bytes are read: no private bytes returned',async()=>{
   const root=await mkdtemp(join(tmpdir(),'stem-g4-media-')),env={NODE_ENV:'test',APP_URL:'https://graduation.fixture.invalid',UPLOAD_STORAGE_DIR:root,UPLOAD_STORAGE_ID:prefix};
   const id=randomUUID(),bytes=Buffer.from('PRIVATE-G4-BYTES'),scope=fileStorage(env).scope;
   const original=await d.prepare('SELECT data FROM courses WHERE id=?').bind(c.id).first();
   try{
    await writeFile(join(await privateDirectory(env),id),bytes);
    await d.prepare("INSERT INTO media_files(id,owner_id,course_id,purpose,scope,name,mime,size,ready,bound,created_at) VALUES(?,?,?,'course',?,'fixture.txt','text/plain; charset=utf-8',?,1,1,'2026-10-10')").bind(id,owner.id,c.id,scope,bytes.length).run();
    const fixture=JSON.parse(original.data);fixture.lessons[2].blocks.push({id:'private-media',type:'file',content:'/api/media/'+id});await d.prepare('UPDATE courses SET data=? WHERE id=?').bind(JSON.stringify(fixture),c.id).run();
    let once=true;const wrap=(stmt,match)=>({bind(...v){return wrap(stmt.bind(...v),match);},all:()=>stmt.all(),run:()=>stmt.run(),async first(){if(match&&once){once=false;await review('changes_requested',79);}return stmt.first();}});
    const raced={...d,prepare:q=>wrap(d.prepare(q),q.startsWith('SELECT 1 FROM media_files WHERE id=')),batch:statements=>d.batch(statements)};
    await assert.rejects(()=>readMedia(raced,student,id,env,classId),rejected(404));assert.equal(once,false);
    assert.equal((await loadGraduationContext(d,student,c.id,classId)).state.lessons[2].unlocked,false);await review();
   }finally{await d.prepare('UPDATE courses SET data=? WHERE id=?').bind(original.data,c.id).run();await rm(root,{recursive:true,force:true});}
  });
  await t.test('T4-061 pending official code rejects changed class review and refunds once',async()=>{
   let course=graduationCourse();course.id=prefix+'-code-course';course.lessons[2].exercise=structuredClone(sampleCourse.lessons.find(l=>l.exercise).exercise);course=await saveCourse(d,owner,course);
   const cls=prefix+'-code-class',taskId=prefix+'-code-task';await saveClass(d,owner,{id:cls,version:0,courseId:course.id,mentorId:tutor.id,targetGrantVersion:1,name:'Kelas kode',description:'',startsAt:null,endsAt:null,capacity:10,status:'active'});await setMembership(d,owner,cls,student.id,'approved');
   await saveAssignment(d,tutor,{...task,id:taskId,classId:cls});await completeLesson(d,student,course.id,'intro',cls);
   const submitted={...submission,id:randomUUID(),assignmentId:taskId,assignmentVersion:1,previousId:null,previousVersion:0};await submitProject(d,student,submitted);
   await reviewProject(d,tutor,{action:'review',submissionId:submitted.id,version:1,status:'accepted',score:80,feedback:'Memenuhi',requestId:randomUUID()});await completeLesson(d,student,course.id,'project',cls);
   const lesson=course.lessons[2],cfg={url:'https://judge.example.com',token:'fixture-only',languageIds:{python:71}},attemptId=randomUUID();
   await initializeProgress(d,student.id,course.id,lesson.id,lesson.revision);
   await startAttempt(d,cfg,student.id,course.id,lesson,'print(1)',attemptId,async()=>Response.json(lesson.exercise.tests.map((_,i)=>({token:'g4-token-'+i}))),cls);
   const pending=await d.prepare('SELECT * FROM attempts WHERE id=?').bind(attemptId).first();assert.equal(pending.state,'pending');
   await reviewProject(d,tutor,{action:'review',submissionId:submitted.id,version:2,status:'changes_requested',score:79,feedback:'Perbaiki',requestId:randomUUID()});
   await assert.rejects(()=>readAttempt(d,cfg,student.id,pending,lesson.revision,async()=>Response.json({submissions:lesson.exercise.tests.map((x,i)=>({token:'g4-token-'+i,status:{id:3},stdout:encode(x.expected)}))})),rejected(403));
   await releaseAttempt(d,attemptId,student.id);const progress=(await readProgress(d,student.id,course.id)).find(p=>p.lessonId==='next');assert.equal(progress.codePassed,0);assert.equal(progress.codeAttempts,0);assert.equal(progress.codeEvidenceId,null);
   assert.equal((await d.prepare('SELECT state FROM attempts WHERE id=?').bind(attemptId).first()).state,'error');
  });
  await t.test('T4-003/012/065 independent course and class certificate do not require optional reviews',async()=>{
   let course=graduationCourse();course.id=prefix+'-independent';course.learningMode='independent_allowed';course.lessons=course.lessons.slice(0,1);course=await saveCourse(d,owner,course);
   await enrollCourse(d,student,course.id);await completeLesson(d,student,course.id,'intro');assert.equal((await loadGraduationContext(d,student,course.id)).state.passed,true);
   const cls=prefix+'-independent-class';await saveClass(d,owner,{id:cls,version:0,courseId:course.id,mentorId:tutor.id,targetGrantVersion:1,name:'Tanpa review wajib',description:'',startsAt:null,endsAt:null,capacity:10,status:'active'});await setMembership(d,owner,cls,student.id,'approved');
   await saveAssignment(d,tutor,{...task,id:prefix+'-optional',classId:cls,requirementId:null,status:'published'});
   const certificate=await issueCertificate(d,student,course.id,cls,true),row=await d.prepare('SELECT evidence FROM certificates WHERE number=?').bind(certificate.number).first();assert.deepEqual(JSON.parse(row.evidence).reviews,[]);
  });
  await t.test('T4-037/041/046/047/049 binding cannot detach; editorial is Owner only and keeps pass',async()=>{
   await assert.rejects(()=>saveAssignment(d,tutor,{...task,version:1,requirementId:null}),rejected(403));
   await assert.rejects(()=>saveAssignment(d,tutor,{...task,version:1,instructions:'Koreksi.',change:{kind:'editorial',reason:'Typo'}}),rejected(403));
   await saveAssignment(d,owner,{...task,version:1,instructions:'Kerjakan sesuai petunjuk!',change:{kind:'editorial',reason:'Koreksi tanda baca'}});
   assert.equal((await loadGraduationContext(d,student,c.id,classId)).state.passed,true);
   await saveAssignment(d,tutor,{...task,version:2,dueAt:'2099-01-01T00:00:00Z',instructions:'Kerjakan sesuai petunjuk!'});
   assert.equal((await loadGraduationContext(d,student,c.id,classId)).state.passed,true);
   await saveAssignment(d,tutor,{...task,version:3,instructions:'Instruksi baru wajib.'});
   assert.equal((await projectList(d,student,classId)).tasks.find(t=>t.id===assignmentId).canSubmit,true);
   await assert.rejects(()=>submitProject(d,student,{...submission,id:randomUUID(),assignmentVersion:3,previousId:submission.id,previousVersion:2}),rejected(409));
  });
  await t.test('T4-069/070/071/073/075 additive backfill is replayable and preserves legacy fingerprints',async()=>{
   await d.prepare("INSERT INTO progress(user_id,course_id,lesson_id,revision,complete,quiz_passed,code_passed,quiz_attempts,code_attempts,score) VALUES(?,?,?,7,1,1,0,4,0,0)").bind(student.id,c.id,'legacy-only').run();
   const before=await academicInventory(d);assert.equal(before.mayActivate,false);assert.equal(before.writerState,'unknown');
   const failing={...d,prepare:q=>d.prepare(q.includes('INTO assignment_revisions')?q.replace('INTO assignment_revisions','INTO nonexistent_academic_snapshot'):q),batch:s=>d.batch(s)};
   await assert.rejects(()=>backfillAcademicHistory(failing));assert.equal(await d.prepare("SELECT 1 FROM learning_progress_revisions WHERE user_id=? AND lesson_id='legacy-only'").bind(student.id).first(),null);
   await backfillAcademicHistory(d);await backfillAcademicHistory(d);
   const rows=(await d.prepare("SELECT * FROM learning_progress_revisions WHERE user_id=? AND lesson_id='legacy-only'").bind(student.id).all()).results;assert.equal(rows.length,1);assert.equal(rows[0].quiz_passed,1);assert.equal(rows[0].score,0);assert.equal(rows[0].provenance,'legacy');assert.deepEqual((await academicInventory(d)).baseline,before.baseline);
  });
  await t.test('T4-069/073/075 old writer during backfill is detected; native evidence and rollback history survive',async()=>{
   const original=await d.prepare("SELECT * FROM progress WHERE user_id=? AND lesson_id='legacy-only'").bind(student.id).first();
   const native=await d.prepare("SELECT * FROM learning_progress_revisions WHERE user_id=? AND lesson_id='intro'").bind(student.id).all();
   let crossed=false;
   const racing={...d,prepare:q=>d.prepare(q),async batch(statements){const result=await d.batch(statements);crossed=true;await d.prepare("UPDATE progress SET score=17,quiz_attempts=quiz_attempts+1 WHERE user_id=? AND lesson_id='legacy-only'").bind(student.id).run();return result;}};
   await assert.rejects(()=>backfillAcademicHistory(racing),/Sumber lama berubah/);assert.equal(crossed,true);
   assert.equal((await academicInventory(d,'unknown')).mayActivate,false);
   await backfillAcademicHistory(d);assert.deepEqual((await d.prepare("SELECT * FROM learning_progress_revisions WHERE user_id=? AND lesson_id='intro'").bind(student.id).all()).results,native.results);
   // Rollback is a return to old readers, never deletion of the V2 evidence.
   assert.equal((await d.prepare("SELECT score FROM progress WHERE user_id=? AND lesson_id='legacy-only'").bind(student.id).first()).score,17);
   assert.equal((await d.prepare("SELECT score FROM learning_progress_revisions WHERE user_id=? AND lesson_id='legacy-only'").bind(student.id).first()).score,0);
   await d.prepare("UPDATE progress SET score=?,quiz_attempts=? WHERE user_id=? AND lesson_id='legacy-only'").bind(original.score,original.quiz_attempts,student.id).run();
  });
  await t.test('T4-070/075 drained writer cannot activate unresolved legacy reviews or pending judge',async()=>{
   const initial=await academicInventory(d,'drained');assert.equal(initial.legacyReviews.some(r=>r.id===submission.id),false);
   const legacy=randomUUID(),pending=randomUUID();
   try{
    await d.prepare("INSERT INTO project_submissions(id,assignment_id,student_id,attempt,assignment_version,instructions,body,url,submitted_at,status,score,reviewer_name,reviewed_at) VALUES(?,?,?,1,1,'Original','Legacy','','2026-10-10','accepted',79,'Ambiguous','2026-10-10')").bind(legacy,prefix+'-legacy-task',student.id).run();
    const ambiguous=await academicInventory(d,'drained');assert.equal(ambiguous.mayActivate,false);assert.equal(ambiguous.legacyReviews.find(r=>r.id===legacy).reason,'below_required_score');
    await d.prepare("UPDATE project_submissions SET score=NULL WHERE id=?").bind(legacy).run();assert.equal((await academicInventory(d,'drained')).mayActivate,false);
    await d.prepare("UPDATE project_submissions SET score=90 WHERE id=?").bind(legacy).run();assert.equal((await academicInventory(d,'drained')).legacyReviews.find(r=>r.id===legacy).reason,'reviewer_and_revision_must_be_mapped');
    await d.prepare("INSERT INTO attempts(id,user_id,course_id,lesson_id,revision,kind,state,data,created_at) VALUES(?,?,?,'intro',1,'code','pending','{}','2026-10-10')").bind(pending,student.id,c.id).run();
    const waiting=await academicInventory(d,'drained');assert.equal(waiting.mayActivate,false);assert.equal(waiting.pendingJudge.some(r=>r.id===pending),true);
   }finally{await d.prepare('DELETE FROM project_submissions WHERE id=?').bind(legacy).run();await d.prepare('DELETE FROM attempts WHERE id=?').bind(pending).run();}
   assert.deepEqual((await academicInventory(d,'drained')).baseline,initial.baseline);assert.equal((await academicInventory(d,'drained')).mayActivate,initial.mayActivate);
  });
  await t.test('T4-074 needs_mapping blocks old endpoint writers but preserves authorized task history',async()=>{
   const row=await d.prepare('SELECT data FROM courses WHERE id=?').bind(c.id).first(),blocked=JSON.parse(row.data);blocked.policyState='needs_mapping';
   const before=await d.prepare('SELECT count(*) AS n FROM learning_progress_revisions WHERE user_id=? AND course_id=?').bind(student.id,c.id).first();
   try{
    await d.prepare('UPDATE courses SET data=? WHERE id=?').bind(JSON.stringify(blocked),c.id).run();
    const state=(await loadGraduationContext(d,student,c.id,classId)).state;assert.equal(state.problem.code,'GRADUATION_CONFIG_REQUIRED');assert.equal(state.passed,false);
    await assert.rejects(()=>completeLesson(d,student,c.id,'intro',classId),rejected(409));await assert.rejects(()=>issueCertificate(d,student,c.id,classId,true),rejected(409,403));
    assert.equal((await projectList(d,student,classId)).submissions.some(x=>x.id===submission.id),true);
    assert.deepEqual(await d.prepare('SELECT count(*) AS n FROM learning_progress_revisions WHERE user_id=? AND course_id=?').bind(student.id,c.id).first(),before);
   }finally{await d.prepare('UPDATE courses SET data=? WHERE id=?').bind(row.data,c.id).run();}
  });
 }finally{if(oldOwner)await d.prepare("UPDATE settings SET value=? WHERE `key`='owner'").bind(oldOwner.value).run();}
}
