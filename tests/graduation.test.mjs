import {gradeQuiz,publicCourse} from '../lib/rules.ts';
import {dashboardCourse} from '../lib/account.ts';
import {graduationRobustness} from './graduation-robustness.mjs';
import {graduationAcceptance,graduationActivation} from './graduation-acceptance.mjs';
import {academicInventory,backfillAcademicHistory} from '../lib/academic-migration.ts';
import {graduationCourse,graduationWorkflow} from './graduation-scenarios.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {authorizationDatabase,seedAccessUser} from './authorization-fixture.mjs';
import {evaluateGraduation,canConfirmLessonCompletion} from '../lib/graduation.ts';
import {planCoursePublication} from '../lib/academic-revisions.ts';
import {saveCourse,completeLesson,accessibleLesson,initializeProgress,readProgress,submitQuiz} from '../lib/course-data.ts';
import {saveClass,setMembership} from '../lib/classes.ts';
import {saveAssignment,submitProject,reviewProject} from '../lib/projects.ts';
import {loadGraduationContext} from '../lib/graduation-data.ts';
import {issueCertificate} from '../lib/certificates.ts';

const status=n=>e=>e.status===n;
const progress=c=>c.lessons.map(l=>({lessonId:l.id,revision:1,complete:1,quizPassed:1,codePassed:1,quizAttempts:0,codeAttempts:0,score:100}));
const evidence=(score=80,status='accepted')=>({requirementId:'review1',lessonId:'project',requirementRevision:1,assignmentId:'a',assignmentStatus:'published',assignmentRevision:1,assignmentVersion:1,bindingVersion:1,submissionId:'s',submissionVersion:2,submissionRevision:1,lessonRevision:1,submissionRequirementRevision:1,status,score,reviewedAt:'2026-10-10',reviewerId:'t',reviewId:'r',reviewSequence:1});

test('completion confirmation waits for every requirement without requiring completion itself',()=>{
 const c=graduationCourse(),p=progress(c);p[1].complete=0;
 const current=reviews=>evaluateGraduation({course:c,progress:p,reviews,classId:'A'}).lessons[1];
 assert.equal(canConfirmLessonCompletion(undefined),false);
 for(const reviews of [[],[evidence(79,'changes_requested')],[evidence(80,'changes_requested')],[evidence(null,'submitted')]])assert.equal(canConfirmLessonCompletion(current(reviews)),false);
 const ready=current([evidence(80)]);assert.equal(ready.stagePassed,false);assert.equal(canConfirmLessonCompletion(ready),true);
 p[0].complete=0;assert.equal(canConfirmLessonCompletion(current([evidence(80)])),false);
 p[0].complete=1;c.lessons[1].exercise={required:true};p[1].codePassed=0;
 assert.equal(canConfirmLessonCompletion(current([evidence(80)])),false);
 p[1].codePassed=1;c.lessons[1].quiz={mode:'required',threshold:100};p[1].quizPassed=0;
 assert.equal(canConfirmLessonCompletion(current([evidence(80)])),false);
 p[1].quizPassed=1;assert.equal(canConfirmLessonCompletion(current([evidence(80)])),true);
 c.policyState='needs_mapping';assert.equal(canConfirmLessonCompletion(current([evidence(80)])),false);
});

test('every locked DTO hides content and assessment even for a new blocker code',()=>{
 const c=graduationCourse();c.lessons[0].quiz={mode:'required',threshold:100,questions:[{id:'q',prompt:'Private Q',options:['Private option'],correct:[0],explanation:''}]};
 const state=evaluateGraduation({course:c,progress:progress(c),reviews:[evidence()],classId:'A',problem:{code:'CLASS_ARCHIVED',message:'Kelas diarsipkan.'}});
 const dto=publicCourse(c,progress(c),state);assert.equal(dto.lessons.every(l=>l.locked&&l.blocks.length===0&&!l.quiz&&!l.exercise),true);
 for(const lesson of state.lessons)lesson.blockers=[];
 assert.equal(publicCourse(c,progress(c),state).lessons.every(l=>l.blocks.length===0&&!l.quiz),true);
});

test('T4 evaluator checks all platform requirements, latest review and class-scoped evidence',()=>{
  const c=graduationCourse();
  for(const [score,state,passed] of [[79,'accepted',false],[null,'accepted',false],[80,'changes_requested',false],[100,'submitted',false],[80,'accepted',true],[100,'accepted',true]]){
    const result=evaluateGraduation({course:c,progress:progress(c),reviews:[evidence(score,state)],classId:'A'});
    assert.equal(result.lessons[1].stagePassed,passed);assert.equal(result.lessons[2].unlocked,passed);
  }
  const r=evidence();r.submissionRevision=0;
  assert.equal(evaluateGraduation({course:c,progress:progress(c),reviews:[r],classId:'A'}).passed,false);
  assert.equal(evaluateGraduation({course:c,progress:progress(c),reviews:[],classId:'B'}).passed,false);
  const A=evaluateGraduation({course:c,progress:progress(c),reviews:[evidence()],classId:'A',className:'Kelas A'}),B=evaluateGraduation({course:c,progress:progress(c),reviews:[],classId:'B',className:'Kelas B'});
  const summary=dashboardCourse(c,progress(c),null,undefined,[A,B]);assert.equal(summary.completed,1);assert.deepEqual(summary.classResults.map(r=>r.completed),[3,1]);assert.equal(summary.finished,false);
  const p=progress(c);p[0].complete=0;
  assert.equal(evaluateGraduation({course:c,progress:p,reviews:[evidence()],classId:'A'}).lessons[1].unlocked,false);
  c.lessons[0].quiz={mode:'required',threshold:100};p[0].complete=1;p[0].quizPassed=0;
  assert.equal(evaluateGraduation({course:c,progress:p,reviews:[evidence(100)],classId:'A'}).passed,false);
});
test('T4 editorial preserves assessment; evaluative change cannot be declared editorial',()=>{
  const old=graduationCourse();let next=structuredClone(old);
  next.lessons[0].blocks[0].content='Pelajari fondasi!';next.lessons[0].change={kind:'editorial',reason:'Koreksi tanda baca.'};
  assert.equal(planCoursePublication(next,old).lessons[0].revision,1);
  next.lessons[0].quiz={mode:'required',threshold:100,maxAttempts:1,feedback:'never',questions:[{id:'q',prompt:'Pilih',options:['A','B'],correct:[0],explanation:''}]};
  assert.equal(planCoursePublication(next,old).lessons[0].revision,2);
  next=structuredClone(old);next.lessons[1].reviewRequirements[0].instructions='Standar proyek berubah.';
  assert.equal(planCoursePublication(next,old).lessons[1].revision,2);
  next=structuredClone(old);next.lessons[0].blocks=[];
  assert.throws(()=>planCoursePublication(next,old),status(400));
  assert.equal(planCoursePublication(old).lessons[1].blocks.length,0);
});

test('T4 SQLite workflow: 79 revision, 80 accepted, two classes, new instruction, receipts and preserved history',async()=>{
  const {d,sql}=authorizationDatabase();
  try{await graduationWorkflow(d);}finally{sql.close();}
});

test('T4 SQLite controlled races, retries and legacy recovery',async t=>{
 const {d,sql}=authorizationDatabase();try{await graduationRobustness(t,d);}finally{sql.close();}
});
test('T4 SQLite remaining acceptance variations',async t=>{
 const {d,sql}=authorizationDatabase();try{await graduationActivation(t,d);await graduationAcceptance(t,d);}finally{sql.close();}
});
test('T4-072 SQLite duplicate preflight and unique constraint preserve both legacy attempts',async()=>{
 const {d,sql}=authorizationDatabase();
 try{
  sql.exec('DROP INDEX academic_submission_attempt');
  for(const id of ['legacy-duplicate-one','legacy-duplicate-two'])await d.prepare("INSERT INTO project_submissions(id,assignment_id,student_id,attempt,assignment_version,instructions,body,url,submitted_at) VALUES(?,'legacy-task','legacy-student',1,1,'Original','Evidence','','2026-10-10')").bind(id).run();
  const before=await academicInventory(d,'drained');assert.equal(before.duplicateAttempts.length,1);assert.equal(before.mayActivate,false);
  await assert.rejects(()=>backfillAcademicHistory(d),/Duplikasi percobaan/);
  assert.throws(()=>sql.exec('CREATE UNIQUE INDEX academic_submission_attempt ON project_submissions(assignment_id,student_id,attempt)'),/UNIQUE constraint failed/);
  assert.equal((await d.prepare('SELECT count(*) AS n FROM project_submissions').first()).n,2);assert.deepEqual((await academicInventory(d)).duplicateAttempts,before.duplicateAttempts);
 }finally{sql.close();}
});

test('T4 administrative revision, retired IDs and editorial approval cannot persist into next edit',()=>{
 const old=graduationCourse();old.lessons[0].quiz={mode:'required',threshold:100,maxAttempts:1,feedback:'always',questions:[{id:'q',prompt:'Q',options:['A'],correct:[0],explanation:''}]};
 let next=structuredClone(old);next.lessons[0].quiz.maxAttempts=9;next.lessons[0].quiz.feedback='never';next.lessons[0].title+=' typo';
 assert.equal(planCoursePublication(next,old).lessons[0].revision,1);
 next=structuredClone(old);next.lessons[0].blocks[0].content+='!';next.lessons[0].change={kind:'editorial',reason:'Punctuation'};
 const published=planCoursePublication(next,old);assert.equal(published.lessons[0].change,undefined);
 const substantial=structuredClone(published);substantial.lessons[0].blocks[0].content='Different activity';assert.equal(planCoursePublication(substantial,published).lessons[0].revision,2);
 const removed=planCoursePublication({...old,lessons:old.lessons.slice(0,2)},old);assert.throws(()=>planCoursePublication(old,removed),status(400));
});

test('T4-002/010/013 required quiz uses configured threshold and every review requirement',()=>{
 const c=graduationCourse();c.lessons[0].quiz={mode:'required',threshold:100,maxAttempts:0,feedback:'never',questions:Array.from({length:100},(_,i)=>({id:'q'+i,prompt:'Q',options:['A','B'],correct:[0],explanation:''}))};
 const answers=Object.fromEntries(c.lessons[0].quiz.questions.map((q,i)=>[q.id,[i===99?1:0]]));const result=gradeQuiz(c.lessons[0].quiz,answers);assert.equal(result.score,99);assert.equal(result.passed,false);
 const p=progress(c);p[0].quizPassed=0;assert.equal(evaluateGraduation({course:c,progress:p,reviews:[evidence(100)],classId:'A'}).passed,false);
 p[0].quizPassed=1;c.lessons[1].reviewRequirements.push({...c.lessons[1].reviewRequirements[0],id:'review2'});
 assert.equal(evaluateGraduation({course:c,progress:p,reviews:[evidence()],classId:'A'}).passed,false);
 assert.equal(evaluateGraduation({course:c,progress:p,reviews:[evidence(),{...evidence(),requirementId:'review2',assignmentId:'a2',submissionId:'s2',reviewId:'r2'}],classId:'A'}).passed,true);
});


test('configurable course review threshold preserves the default and cannot be disguised as editorial',()=>{
 const c=graduationCourse(),p=progress(c);
 for(const [threshold,score,pass] of [[65,64,false],[65,65,true],[90,80,false],[90,90,true],[0,0,true],[100,99,false],[100,100,true]]){c.reviewPassThreshold=threshold;assert.equal(evaluateGraduation({course:c,progress:p,reviews:[evidence(score)],classId:'A'}).passed,pass);assert.equal(publicCourse(c,p).reviewPassThreshold,threshold);}
 c.reviewPassThreshold=undefined;assert.equal(evaluateGraduation({course:c,progress:p,reviews:[evidence(79)],classId:'A'}).passed,false);
 const old=planCoursePublication(c),explicit=planCoursePublication({...old,reviewPassThreshold:80},old);assert.deepEqual(explicit.lessons.map(l=>l.revision),[1,1,1]);
 const changed=structuredClone(old);changed.reviewPassThreshold=90;changed.lessons[1].change={kind:'editorial',reason:'Flag'};assert.deepEqual(planCoursePublication(changed,old).lessons.map(l=>l.revision),[1,2,1]);
 for(const invalid of [101,-1,80.5,'90',null]){c.reviewPassThreshold=invalid;assert.equal(evaluateGraduation({course:c,progress:p,reviews:[evidence(100)],classId:'A'}).problem.code,'GRADUATION_CONFIG_REQUIRED');}
});
