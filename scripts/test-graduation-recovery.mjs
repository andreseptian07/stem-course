import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {randomUUID} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
export async function testGraduationRecovery(base,f,metadata,controls){
 const cookies={},results=[];
 for(const alias of ['S1','TA','O']){const r=await fetch(base+'/api/auth',{method:'POST',headers:{Origin:metadata.origin,'Content-Type':'application/json'},body:JSON.stringify({action:'login',...f.credentials[alias]})});assert.equal(r.status,200);cookies[alias]=r.headers.get('set-cookie').split(';')[0];}
 const call=async(alias,path,body)=>{const r=await fetch(base+path,{method:body?'POST':'GET',headers:{Cookie:cookies[alias],...(body?{Origin:metadata.origin,'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json()};};
 const complete={action:'complete',courseId:f.gradeCourse.id,lessonId:'intro',revision:1,classId:f.gradeClasses.A,requestId:randomUUID()};
 const before=await call('O','/api/studio?admin=1');assert.equal(before.status,200);
 await controls.stopDatabase();
 try{const unavailable=await call('S1','/api/studio',complete);assert.equal(unavailable.status,503);results.push({id:'T4-056-before-commit',status:503});}finally{await controls.startDatabase();}
 const after=await call('O','/api/studio?admin=1');assert.deepEqual(after.data.progress,before.data.progress);
 // Real TCP response loss after upstream commit. Never log cookies or request bodies.
 let forward, upstreamFailure;
 const proxy=createServer(async(req,res)=>{try{const {alias,path,body}=forward;const result=await call(alias,path,body);assert.equal(result.status,200, 'Upstream fixture action must commit before response loss');res.destroy();}catch(e){upstreamFailure=e;res.destroy();}});
 await new Promise(resolve=>proxy.listen(0,'127.0.0.1',resolve));
 async function loseThenRetry(alias,path,body){forward={alias,path,body};upstreamFailure=undefined;await assert.rejects(()=>fetch('http://127.0.0.1:'+proxy.address().port+'/lost-response'));if(upstreamFailure)throw upstreamFailure;const retry=await call(alias,path,body);assert.equal(retry.status,200);results.push({id:'T4-056-after-commit',action:body.action,retryStatus:retry.status});return retry.data;}
 try{
  await loseThenRetry('S1','/api/studio',complete);
  const quizCourse=f.courses.C1;
  const foundation=quizCourse.lessons[0];await call('S1','/api/studio',{action:'complete',courseId:quizCourse.id,lessonId:foundation.id,revision:foundation.revision,requestId:randomUUID()});
  const quizLesson=quizCourse.lessons.find(l=>l.quiz);const quiz={action:'quiz',courseId:quizCourse.id,lessonId:quizLesson.id,revision:quizLesson.revision,answers:{},requestId:randomUUID()};
  await loseThenRetry('S1','/api/studio',quiz);
  const history=await call('S1','/api/studio?history='+quizCourse.id+'&lesson='+quizLesson.id);
  assert.equal(history.status,200);assert.equal(history.data.attempts.filter(a=>a.kind==='quiz').length,1);

  const A=f.gradeClasses.A,taskId=f.gradeTasks.AR1;
  const list=(await call('S1','/api/projects?class='+A)).data,latest=list.submissions.filter(s=>s.assignmentId===taskId).sort((a,b)=>b.attempt-a.attempt)[0],task=list.tasks.find(t=>t.id===taskId);
  if (!task.canSubmit && latest.status === 'accepted' && latest.assessmentRevision === task.assessmentRevision) {
    const changed = await call('TA','/api/projects',{action:'review',submissionId:latest.id,version:latest.version,status:'changes_requested',score:79,feedback:'Persiapan fixture retry revisi',requestId:randomUUID()});
    assert.equal(changed.status,200);latest.version++;
  }
  const submit={action:'submit',id:randomUUID(),assignmentId:taskId,assignmentVersion:task.version,previousId:latest.id,previousVersion:latest.version,body:'Revisi setelah instruksi baru',url:'',attachmentIds:[]};
  await loseThenRetry('S1','/api/projects',submit);
  let current=(await call('TA','/api/projects?class='+A)).data;assert.equal(current.submissions.filter(s=>s.id===submit.id).length,1);
  const review={action:'review',submissionId:submit.id,version:1,status:'accepted',score:80,feedback:'Uji pemulihan setelah commit',requestId:randomUUID()};await loseThenRetry('TA','/api/projects',review);
  current=(await call('TA','/api/projects?class='+A)).data;assert.equal(current.reviewHistory.filter(r=>r.submissionId===submit.id).length,1);
  results.push({id:'T4-054/056',submissionCount:1,reviewCount:1});
 }finally{await new Promise(resolve=>proxy.close(resolve));}
 await writeFile('/tmp/ruangstem-t4-recovery-evidence.json',JSON.stringify({environment:'disposable MariaDB',...metadata,results},null,2)+'\n');console.log(`Graduation recovery: ${results.length} checks passed.`);
}
