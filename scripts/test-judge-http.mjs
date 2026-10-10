import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';

// Actual Next authentication and routes on the owned local fixture, with the
// official provider disabled. No cookies, credentials, or provider data logged.
export async function testDisabledJudgeHttp(base,credentials,courseId,lessonId,revision=1) {
 assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname));
 const cookies={},checks=[];
 async function call(alias,path,body,expected){
  const response=await fetch(base+path,{redirect:'manual',method:body?'POST':'GET',headers:{...(cookies[alias]?{Cookie:cookies[alias]}:{}),...(body?{Origin:base,'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  const text=await response.text();assert.equal(response.status,expected,alias+' '+path);
  checks.push({alias,path,method:body?'POST':'GET',status:response.status,bodyHash:createHash('sha256').update(text).digest('hex')});return text?JSON.parse(text):{};
 }
 for(const [alias,credential] of Object.entries(credentials)){
  const response=await fetch(base+'/api/auth',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({action:'login',...credential,returnTo:'/dashboard'})});
  assert.equal(response.status,200,'fixture login '+alias);cookies[alias]=response.headers.get('set-cookie').split(';')[0];
 }
 for(const alias of ['S1','TA']){await call(alias,'/api/judge',null,403);await call(alias,'/api/judge',{},403);}
 await call('guest','/api/judge',null,401);await call('guest','/api/judge',{},401);
 for(const alias of ['O','Q1'])assert.equal((await call(alias,'/api/judge',null,200)).passed,false);
 assert.equal((await call('O','/api/judge',{},200)).passed,false);await call('Q1','/api/judge',{},403);
 const data=await call('S1','/api/studio?course='+courseId,null,200);
 assert.equal(data.judgeReady,false);assert.equal(data.courses.some(c=>c.id===courseId),true);
 const rejected=await call('S1','/api/studio',{action:'code',courseId,lessonId,revision,classId:null,requestId:randomUUID(),source:'print(1)'},503);
 assert.ok(rejected.error);return {environment:'owned local disposable MariaDB / actual Next dev',officialExecution:false,checks};
}
