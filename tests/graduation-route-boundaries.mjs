// Supplemental acceptance only: real route handlers over loopback HTTP, with
// authenticated identity injected and deterministic database barriers. Existing
// production-Next evidence remains the proof of cookie/session authentication.
import assert from 'node:assert/strict';
import {AsyncLocalStorage} from 'node:async_hooks';
import {createServer} from 'node:http';
import {randomUUID,createHash} from 'node:crypto';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {seedAccessUser} from './authorization-fixture.mjs';
import {graduationCourse} from './graduation-scenarios.mjs';
import {databaseSql} from '../lib/database.ts';
import {saveCourse,completeLesson,readProgress,initializeProgress} from '../lib/course-data.ts';
import {saveClass,setMembership} from '../lib/classes.ts';
import {saveAssignment,submitProject,reviewProject} from '../lib/projects.ts';
import {fileStorage,privateDirectory} from '../lib/project-files.ts';
import {sampleCourse} from '../lib/seed.ts';
import {startAttempt} from '../lib/code-attempts.ts';

export async function graduationRouteBoundaries(d){
 const prefix='g4boundary-'+randomUUID().slice(0,8),root=resolve('.');
 const owner={id:prefix+'-o',name:'Owner',role:'owner'},student={id:prefix+'-s',name:'Siswa',role:'student'},tutor={id:prefix+'-t',name:'Tutor',role:'student'};
 const previousOwner=await d.prepare("SELECT value FROM settings WHERE `key`='owner'").first();
 const folder=await mkdtemp(join(root,'.t4-route-')),storage=await mkdtemp(join(tmpdir(),'stem-g4-boundary-'));
 const keys=['APP_URL','UPLOAD_STORAGE_DIR','UPLOAD_STORAGE_ID'],previous=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 Object.assign(process.env,{APP_URL:'https://graduation.fixture.invalid',UPLOAD_STORAGE_DIR:storage,UPLOAD_STORAGE_ID:prefix});
 const context=new AsyncLocalStorage(),symbol=Symbol.for(prefix);globalThis[symbol]=context;
 const results=[];let server;
 try{
  const stub=`import {AccessError as AppError} from ${JSON.stringify(join(root,'lib/access.ts'))};
import {accessibleLesson,readLearningCourse,initializeProgress} from ${JSON.stringify(join(root,'lib/course-data.ts'))};
const context=()=>globalThis[Symbol.for(${JSON.stringify(prefix)})].getStore();
export {AppError}; export const identity=async()=>context().user;
export const db=()=>context().database; export const judgeConfig=()=>context().judge||null;
export const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
export const accessible=(user,c,l,cls)=>accessibleLesson(db(),user,c,l,cls);
export const course=(c,u)=>readLearningCourse(db(),c,u);
export const ensureProgress=(u,c,l,r)=>initializeProgress(db(),u,c,l,r);`;
  const routes={};
  for(const [name,file] of [['studio','app/api/studio/route.ts'],['projects','app/api/projects/route.ts'],['certificates','app/api/certificates/route.ts'],['media','app/api/media/[id]/route.ts']]){
   const outfile=join(folder,name+'.mjs');
   await build({entryPoints:[file],outfile,bundle:true,platform:'node',format:'esm',packages:'external',logLevel:'silent',plugins:[{name:'test-identity-only',setup(b){
    b.onResolve({filter:/^@\/lib\/server$/},()=>({path:'server',namespace:'fixture'}));
    b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:stub,loader:'js',resolveDir:root}));
    b.onResolve({filter:/^@\//},args=>({path:join(root,args.path.slice(2)+'.ts'),external:true}));
    b.onResolve({filter:/^\/.*\/lib\/.*\.ts$/},args=>({path:args.path,external:true}));
   }}]});routes[name]=await import(pathToFileURL(outfile));
  }
  let nextContext;
  server=createServer(async(req,res)=>context.run(nextContext,async()=>{
   try{
    const chunks=[];for await(const chunk of req)chunks.push(chunk);
    const url=new URL(req.url,'http://127.0.0.1'),name=url.pathname.split('/')[2],handler=routes[name][req.method];
    const request=new Request(url,{method:req.method,headers:req.headers,...(req.method==='POST'?{body:Buffer.concat(chunks)}:{})});
    const response=await handler(request,{params:Promise.resolve({id:url.pathname.split('/')[3]})});
    res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
   }catch{res.writeHead(500);res.end('Boundary harness failure');}
  }));
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const base='http://127.0.0.1:'+server.address().port;
  async function call(id,path,body,expected,database=d,headers={},judge=null,user=student){
   nextContext={user,database,judge};
   const response=await fetch(base+path,{method:body?'POST':'GET',headers:{...headers,...(body?{Origin:process.env.APP_URL,'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});const text=await response.text();
   assert.equal(response.status,expected,id+': '+text);results.push({id,method:body?'POST':'GET',path,status:response.status,expected,bodyHash:createHash('sha256').update(text).digest('hex')});return text;
  }
  const beforeBatch=fn=>{let crossed=false;return {database:{...d,prepare:q=>d.prepare(q),async batch(s){if(!crossed){crossed=true;await fn();}return d.batch(s);}},crossed:()=>crossed};};
  const beforeRead=(needle,fn)=>{let crossed=false;const wrap=(stmt,match)=>({bind(...v){return wrap(stmt.bind(...v),match)},run:()=>stmt.run(),all:()=>stmt.all(),async first(){if(match&&!crossed){crossed=true;await fn();}return stmt.first()}});return {database:{...d,prepare:q=>wrap(d.prepare(q),q.startsWith(needle)),batch:s=>d.batch(s)},crossed:()=>crossed};};
  for(const [u,kind,caps] of [[owner,'staff',[]],[student,'student',[]],[tutor,'staff',['tutor']]])await seedAccessUser(d,u.id,kind,caps);
  await d.prepare(databaseSql(d,"INSERT INTO settings(key,value) VALUES('owner',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value","INSERT INTO settings(`key`,value) VALUES('owner',?) ON DUPLICATE KEY UPDATE value=VALUES(value)")).bind(owner.id).run();
  let course=graduationCourse();course.id=prefix+'-course';course=await saveCourse(d,owner,course);
  const classId=prefix+'-class',taskId=prefix+'-task';
  await saveClass(d,owner,{id:classId,version:0,courseId:course.id,mentorId:tutor.id,targetGrantVersion:1,name:'Boundary fixture',description:'',startsAt:null,endsAt:null,capacity:10,status:'active'});await setMembership(d,owner,classId,student.id,'approved');
  await saveAssignment(d,tutor,{id:taskId,classId,version:0,title:'Review',instructions:'Kerjakan proyek',rubric:'Minimal standar course',requirementId:'review1',dueAt:null,status:'published'});
  await completeLesson(d,student,course.id,'intro',classId);
  let submission={action:'submit',id:randomUUID(),assignmentId:taskId,assignmentVersion:1,previousId:null,previousVersion:0,body:'Bukti',url:'',attachmentIds:[]};await submitProject(d,student,submission);
  async function review(status='accepted',score=80){const row=await d.prepare('SELECT version FROM project_submissions WHERE id=?').bind(submission.id).first();await reviewProject(d,tutor,{action:'review',submissionId:submission.id,version:row.version,status,score,feedback:'Boundary',requestId:randomUUID()});}
  await review();
  for(const lesson of course.lessons)await initializeProgress(d,student.id,course.id,lesson.id,lesson.revision);
  const complete=lessonId=>({action:'complete',courseId:course.id,lessonId,classId,revision:1,requestId:randomUUID()});
  const snapshot=async()=>JSON.stringify(await readProgress(d,student.id,course.id));
  let before=await snapshot(),barrier=beforeBatch(()=>review('changes_requested',79));
  await call('T4-057-complete','/api/studio',complete('project'),409,barrier.database);assert.ok(barrier.crossed());assert.equal(await snapshot(),before);await review();await completeLesson(d,student,course.id,'project',classId);
  before=await snapshot();barrier=beforeBatch(async()=>{await review('changes_requested',79);const row=await d.prepare('SELECT version FROM project_submissions WHERE id=?').bind(submission.id).first();submission={...submission,id:randomUUID(),previousId:submission.id,previousVersion:row.version};await submitProject(d,student,submission);});
  await call('T4-058-newest-submission','/api/studio',complete('next'),409,barrier.database);assert.ok(barrier.crossed());assert.equal(await snapshot(),before);await review();
  before=await snapshot();barrier=beforeBatch(()=>d.prepare("INSERT INTO class_assignment_requirements(class_id,requirement_id,course_id,lesson_id,assignment_id,requirement_revision) VALUES(?,?,?,?,?,1)").bind(classId,'phantom',course.id,'project',prefix+'-phantom').run());
  await call('T4-059-binding','/api/studio',complete('next'),409,barrier.database);assert.ok(barrier.crossed());assert.equal(await snapshot(),before);await d.prepare("DELETE FROM class_assignment_requirements WHERE class_id=? AND requirement_id='phantom'").bind(classId).run();
  before=await snapshot();barrier=beforeBatch(()=>d.prepare("UPDATE user_access SET status='suspended',version=version+1 WHERE user_id=?").bind(student.id).run());
  await call('T4-033-suspended','/api/studio',complete('next'),403,barrier.database);assert.ok(barrier.crossed());assert.equal(await snapshot(),before);await d.prepare("UPDATE user_access SET status='active',version=version+1 WHERE user_id=?").bind(student.id).run();
  before=await snapshot();barrier=beforeBatch(()=>setMembership(d,owner,classId,student.id,'removed'));
  await call('T4-033-membership','/api/studio',complete('next'),403,barrier.database);assert.ok(barrier.crossed());assert.equal(await snapshot(),before);await setMembership(d,owner,classId,student.id,'approved');await completeLesson(d,student,course.id,'next',classId);
  const count=await d.prepare('SELECT count(*) AS n FROM certificates WHERE user_id=?').bind(student.id).first();
  // Certificate INSERT is a run(), not a read: intercept its final SQL boundary.
  let crossed=false;const wrap=(stmt,match)=>({bind(...v){return wrap(stmt.bind(...v),match)},first:()=>stmt.first(),all:()=>stmt.all(),async run(){if(match&&!crossed){crossed=true;await review('changes_requested',79)}return stmt.run()}});
  const raced={...d,prepare:q=>wrap(d.prepare(q),q.includes('INTO certificates')),batch:s=>d.batch(s)};
  await call('T4-057-certificate','/api/certificates',{action:'issue',courseId:course.id,classId,consent:true},409,raced);assert.ok(crossed);assert.deepEqual(await d.prepare('SELECT count(*) AS n FROM certificates WHERE user_id=?').bind(student.id).first(),count);await review();
  // Isolate receipt actor/action/class scope and task revisions after 20 attempts.
  const B=prefix+'-B',taskB=prefix+'-task-B';
  await saveClass(d,owner,{id:B,version:0,courseId:course.id,mentorId:tutor.id,targetGrantVersion:1,name:'Class B',description:'',startsAt:null,endsAt:null,capacity:10,status:'active'});await setMembership(d,owner,B,student.id,'approved');
  await saveAssignment(d,tutor,{id:taskB,classId:B,version:0,title:'Review B',instructions:'Kerjakan proyek',rubric:'Minimal standar course',requirementId:'review1',dueAt:null,status:'published'});
  const second={...submission,id:randomUUID(),assignmentId:taskB,previousId:null,previousVersion:0};await submitProject(d,student,second);await reviewProject(d,tutor,{action:'review',submissionId:second.id,version:1,status:'accepted',score:80,feedback:'Class B',requestId:randomUUID()});
  const receiptId=randomUUID(),firstAction={...complete('intro'),requestId:receiptId};
  await call('T4-055-initial','/api/studio',firstAction,200);
  await call('T4-055-class-scope','/api/studio',{...firstAction,classId:B},409);
  await call('T4-055-action-scope','/api/studio',{...firstAction,action:'quiz',answers:{}},400);
  const other={id:prefix+'-s2',name:'S2',role:'student'};await seedAccessUser(d,other.id);await setMembership(d,owner,B,other.id,'approved');
  await call('T4-055-actor-scope','/api/studio',{...firstAction,classId:B},200,d,{},null,other);
  const receipts=(await d.prepare("SELECT actor_id FROM academic_mutation_receipts WHERE action='complete' AND request_id=?").bind(receiptId).all()).results;assert.equal(receipts.length,2);assert.deepEqual(receipts.map(r=>r.actor_id).sort(),[student.id,other.id].sort());
  let last;
  for(let attempt=3;attempt<=20;attempt++){last=randomUUID();await d.prepare("INSERT INTO project_submissions(id,assignment_id,student_id,attempt,assignment_version,assessment_revision,lesson_revision,requirement_revision,snapshot,instructions,body,url,submitted_at,status) VALUES(?,?,?, ?,1,1,1,1,'{}','Original historical instruction','Historical fixture','','2026-10-10','submitted')").bind(last,taskId,student.id,attempt).run();}
  const newSubmission={action:'submit',id:randomUUID(),assignmentId:taskId,assignmentVersion:1,previousId:last,previousVersion:1,body:'New revision work',url:'',attachmentIds:[]};
  await call('T4-048-old-limit','/api/projects',newSubmission,409);
  await saveAssignment(d,tutor,{id:taskId,classId,version:1,title:'Review',instructions:'Substantial new instructions for class A only',rubric:'New evaluation rubric',requirementId:'review1',dueAt:null,status:'published'});
  const afterB=JSON.parse(await call('T4-046-class-B-preserved','/api/studio?course='+course.id+'&class='+B,null,200));assert.equal(afterB.courses.find(c=>c.id===course.id).graduation.passed,true);
  const afterA=JSON.parse(await call('T4-046-class-A-stale','/api/studio?course='+course.id+'&class='+classId,null,200));assert.equal(afterA.courses.find(c=>c.id===course.id).graduation.passed,false);
  submission={...newSubmission,assignmentVersion:2};await call('T4-048-new-revision','/api/projects',submission,200);await review();
  const row=await d.prepare('SELECT attempt,assessment_revision FROM project_submissions WHERE id=?').bind(submission.id).first();assert.equal(row.attempt,21);assert.equal(row.assessment_revision,2);
  assert.equal((await d.prepare('SELECT instructions FROM project_submissions WHERE id=?').bind(last).first()).instructions,'Original historical instruction');
  const mediaId=randomUUID(),bytes=Buffer.from('PRIVATE-BOUNDARY-BYTES');await writeFile(join(await privateDirectory(process.env),mediaId),bytes);
  await d.prepare("INSERT INTO media_files(id,owner_id,course_id,purpose,scope,name,mime,size,ready,bound,created_at) VALUES(?,?,?,'course',?,'fixture.txt','text/plain',?,1,1,'2026-10-10')").bind(mediaId,owner.id,course.id,fileStorage(process.env).scope,bytes.length).run();
  course.lessons[2].blocks.push({id:'media',type:'file',content:'/api/media/'+mediaId});await d.prepare('UPDATE courses SET data=? WHERE id=?').bind(JSON.stringify(course),course.id).run();
  for(const download of [false,true]){
   barrier=beforeRead('SELECT 1 FROM media_files WHERE id=',()=>review('changes_requested',79));
   const body=await call('T4-060-Range'+(download?'-download':''),'/api/media/'+mediaId+'?class='+classId+(download?'&download=1':''),null,404,barrier.database,{Range:'bytes=0-3'});assert.ok(barrier.crossed());assert.equal(body.includes(bytes.toString()),false);assert.equal(body.includes('PRIVATE'),false);await review();
  }
  course.lessons[2].exercise=structuredClone(sampleCourse.lessons.find(l=>l.exercise).exercise);
  await d.prepare('UPDATE courses SET data=? WHERE id=?').bind(JSON.stringify(course),course.id).run();
  const cfg={url:'https://judge.example.com',token:'fixture-only',languageIds:{python:71}},attemptId=randomUUID();
  await startAttempt(d,cfg,student.id,course.id,course.lessons[2],'print(1)',attemptId,async()=>Response.json(course.lessons[2].exercise.tests.map((_,i)=>({token:'boundary-token-'+i}))),classId);
  const reserved=(await readProgress(d,student.id,course.id)).find(p=>p.lessonId==='next');
  await call('T4-062-pending-reset','/api/studio',{action:'resetAttempts',userId:student.id,courseId:course.id,lessonId:'next'},409,d,{},null,owner);
  assert.deepEqual((await readProgress(d,student.id,course.id)).find(p=>p.lessonId==='next'),reserved);
  await review('changes_requested',79);
  await call('T4-061-pending-review-changed','/api/studio?attempt='+attemptId,null,403,d,{},cfg);
  const retry=JSON.parse(await call('T4-061-pending-retry','/api/studio?attempt='+attemptId,null,200,d,{},cfg));assert.equal(retry.state,'error');assert.equal(retry.result,undefined);
  const pending=(await readProgress(d,student.id,course.id)).find(p=>p.lessonId==='next');assert.equal(pending.codePassed,0);assert.equal(pending.codeAttempts,0);
  assert.equal((await d.prepare('SELECT state FROM attempts WHERE id=?').bind(attemptId).first()).state,'error');
  before=await snapshot();barrier=beforeBatch(async()=>{const revised=structuredClone(course);revised.lessons[1].reviewRequirements.push({...revised.lessons[1].reviewRequirements[0],id:'new-requirement',title:'New requirement'});await saveCourse(d,owner,revised);});
  await call('T4-059-course-requirement','/api/studio',complete('intro'),403,barrier.database);assert.ok(barrier.crossed());assert.equal(await snapshot(),before);
  return {environment:'route handlers over loopback HTTP; injected identity; disposable DB barriers',results};
 }finally{
  if(server)await new Promise(r=>server.close(r));delete globalThis[symbol];
  if(previousOwner)await d.prepare("UPDATE settings SET value=? WHERE `key`='owner'").bind(previousOwner.value).run();
  for(const k of keys){if(previous[k]===undefined)delete process.env[k];else process.env[k]=previous[k];}
  await rm(folder,{recursive:true,force:true});await rm(storage,{recursive:true,force:true});
 }
}
