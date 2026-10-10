import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {seedAccessUser} from './authorization-fixture.mjs';
import {startAttempt,readAttempt,releaseAttempt} from '../lib/code-attempts.ts';
import {initializeProgress} from '../lib/course-data.ts';
import {encode} from '../lib/judge.ts';

export async function judgeReservationScenarios(d) {
 const prefix='g5-'+randomUUID().slice(0,8),user=prefix+'-student',courseId=prefix+'-course';
 const cfg={url:'https://judge.example.com',token:'fixture-only',languageIds:{python:71}};
 const lesson={id:'lab',title:'Coding',module:'Module',minutes:5,revision:1,blocks:[],exercise:{language:'python',required:true,maxAttempts:3,starter:'print(input())',prompt:'Echo',tests:[{input:'hello',expected:'hello',hidden:false},{input:'private-input',expected:'private-output',hidden:true}]}};
 await seedAccessUser(d,user);
 await d.prepare('INSERT INTO courses(id,data,version) VALUES(?,?,1)').bind(courseId,JSON.stringify({id:courseId,version:1,published:true,graduationPolicyVersion:2,learningMode:'independent_allowed',policyState:'ready',lessons:[lesson]})).run();
 await d.prepare("INSERT INTO enrollments(user_id,course_id,created_at,authorization_id) VALUES(?,?,'2026-10-10',?)").bind(user,courseId,prefix).run();
 await initializeProgress(d,user,courseId,lesson.id,1);
 const progress=()=>d.prepare('SELECT code_attempts,code_passed FROM learning_progress_revisions WHERE user_id=? AND course_id=? AND lesson_id=?').bind(user,courseId,lesson.id).first();
 const row=id=>d.prepare('SELECT * FROM attempts WHERE id=?').bind(id).first();
 let misses=0,unblock;const bothMissing=new Promise(r=>unblock=r);
 const wrap=(stmt,match)=>({bind(...v){return wrap(stmt.bind(...v),match);},run:()=>stmt.run(),all:()=>stmt.all(),async first(){const data=await stmt.first();if(match&&!data&&misses<2){if(++misses===2)unblock();await bothMissing;}return data;}});
 const raced={dialect:d.dialect,prepare:q=>q==='SELECT * FROM attempts WHERE id=?'?wrap(d.prepare(q),true):d.prepare(q),batch:s=>d.batch(s)};
 let finishSubmission,providerCalls=0;
 const submitting=new Promise(r=>finishSubmission=r);
 const fetcher=async()=>{providerCalls++;await submitting;return Response.json([{token:'visible'},{token:'hidden'}]);};
 const id=randomUUID();const attempts=[startAttempt(raced,cfg,user,courseId,lesson,'print(input())',id,fetcher),startAttempt(raced,cfg,user,courseId,lesson,'print(input())',id,fetcher)];
 try {
  assert.equal((await Promise.race(attempts)).id,id);
  assert.equal((await progress()).code_attempts,1,'concurrent replay cannot increment another request reservation');
  assert.equal(providerCalls,1);
 } finally {finishSubmission();await Promise.allSettled(attempts);}
 assert.equal((await row(id)).state,'pending');
 let pollingCalls=0;
 const accepted=async()=>{pollingCalls++;return Response.json({submissions:[{token:'visible',status:{id:3},stdout:encode('hello')},{token:'hidden',status:{id:3},stdout:encode('private-output'),stderr:encode('private-input')}]});};
 const result=await readAttempt(d,cfg,user,await row(id),1,accepted);
 assert.equal(result.passed,true);assert.equal(pollingCalls,1);assert.equal((await progress()).code_passed,1);
 assert.equal(JSON.stringify(result).includes('private-output'),false);assert.equal(JSON.stringify(result).includes('private-input'),false);
 await releaseAttempt(d,id,user);assert.equal((await progress()).code_attempts,1,'finished attempts are never refunded');
 let rejectedFetch=0;
 for(const altered of [{...cfg,languageIds:{python:72}},{...cfg,token:'rotated-fixture'},{...cfg,url:'http://localhost'}]) {
  const next=randomUUID();await startAttempt(d,cfg,user,courseId,lesson,'print(input())',next,async()=>Response.json([{token:'visible'},{token:'hidden'}]));
  const fail=await readAttempt(d,altered,user,await row(next),1,async()=>{rejectedFetch++;throw new Error('must not poll altered config');});
  assert.equal(fail.state,'error');assert.equal((await progress()).code_attempts,1);assert.equal((await progress()).code_passed,1);
  await readAttempt(d,altered,user,await row(next),1);assert.equal((await progress()).code_attempts,1);
 }
 assert.equal(rejectedFetch,0);
 return {dialect:d.dialect||'sqlite',concurrentRequests:2,providerSubmissions:providerCalls,quotaAfterReplay:1,accepted:true,hiddenOutputRedacted:true,configurationChangesRefundedOnce:3};
}
