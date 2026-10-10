// Real route handlers over loopback HTTP; fixture identity and provider only.
// Cookie authentication and real sandbox execution are separate acceptance.
import test from 'node:test';
import assert from 'node:assert/strict';
import {AsyncLocalStorage} from 'node:async_hooks';
import {createServer} from 'node:http';
import {randomUUID} from 'node:crypto';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {authorizationDatabase,seedAccessUser} from './authorization-fixture.mjs';
import {createJudgeInspector} from '../lib/judge-readiness.ts';
import {JUDGE_LIMITS,encode} from '../lib/judge.ts';

test('judge routes enforce staff access and verified readiness before consuming code quota',{timeout:20000},async()=>{
 const {d,sql}=authorizationDatabase(),root=resolve('.'),folder=await mkdtemp(join(root,'.judge-route-'));
 const context=new AsyncLocalStorage(),symbol=Symbol.for('judge-route-'+randomUUID());globalThis[symbol]=context;
 const nativeFetch=globalThis.fetch,origin=process.env.APP_URL;process.env.APP_URL='https://judge.fixture.invalid';
 let server,selected,providerCalls=0,submitCalls=0,phase='healthy';
 const cfg={url:'https://judge.example.com',token:'fixture-only',languageIds:{python:71}};
 const provider=async(url,init={})=>{
  providerCalls++;const path=new URL(url).pathname;
  if(path==='/about')return Response.json({version:phase==='unsafe'?'1.13.0':'1.13.1'});
  if(path==='/config_info')return Response.json({enable_network:false,allow_enable_network:false,max_queue_size:100,...Object.fromEntries(Object.entries(JUDGE_LIMITS).map(([k,v])=>['max_'+k,v]))});
  if(path==='/languages')return Response.json([{id:71}]);
  if(path==='/workers')return Response.json([{queue:'default',size:0,available:1,idle:1,working:0}]);
  if(init.method==='POST'){submitCalls++;if(phase==='submit-failure')return Response.json({error:'fixture-only provider secret'},{status:503});return Response.json([{token:'visible'},{token:'hidden'}]);}
  if(phase==='poll-failure')throw new Error('fixture-only provider secret');
  return Response.json({submissions:[{token:'visible',status:{id:3},stdout:encode('hello')},{token:'hidden',status:{id:3},stdout:encode('hidden-output')}]});
 };
 globalThis.fetch=(url,init)=>new URL(typeof url==='string'?url:url.url||String(url)).hostname==='judge.example.com'?provider(url,init):nativeFetch(url,init);
 const records=[];
 try {
  const stub=`import {AccessError as AppError} from ${JSON.stringify(join(root,'lib/access.ts'))};
import {accessibleLesson,readLearningCourse,initializeProgress} from ${JSON.stringify(join(root,'lib/course-data.ts'))};
const context=()=>globalThis[Symbol.for(${JSON.stringify(symbol.description)})].getStore();
export {AppError};export const identity=async()=>context().user;export const db=()=>context().d;
export const judgeConfig=()=>context().cfg;export const json=(value,status=200)=>Response.json(value,{status});
export const accessible=(u,c,l,cls)=>accessibleLesson(db(),u,c,l,cls);export const course=(c,u)=>readLearningCourse(db(),c,u);
export const ensureProgress=(u,c,l,r)=>initializeProgress(db(),u,c,l,r);`;
  const readinessStub=`const context=()=>globalThis[Symbol.for(${JSON.stringify(symbol.description)})].getStore();export const judgeReadiness=(cfg,force)=>context().inspect(cfg,force);`;
  const routes={};
  for(const name of ['judge','studio']){
   const outfile=join(folder,name+'.mjs');
   await build({entryPoints:['app/api/'+name+'/route.ts'],outfile,bundle:true,platform:'node',format:'esm',packages:'external',logLevel:'silent',plugins:[{name:'identity-and-provider-only',setup(b){
    b.onResolve({filter:/^@\/lib\/server$/},()=>({path:'server',namespace:'fixture'}));
    b.onResolve({filter:/^@\/lib\/judge-readiness$/},()=>({path:'readiness',namespace:'fixture'}));
    b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:args.path==='server'?stub:readinessStub,loader:'js',resolveDir:root}));
    b.onResolve({filter:/^@\//},args=>({path:join(root,args.path.slice(2)+'.ts'),external:true}));
    b.onResolve({filter:/^\/.*\/lib\/.*\.ts$/},args=>({path:args.path,external:true}));
   }}]});routes[name]=await import(pathToFileURL(outfile));
  }
  for(const [id,kind,caps] of [['s','student',[]],['t','staff',['tutor']],['q','staff',['curriculum']],['o','staff',[]]])await seedAccessUser(d,id,kind,caps);
  sql.prepare("INSERT INTO settings(key,value) VALUES('owner','o')").run();
  const lesson={id:'lab',title:'Lab',module:'Coding',minutes:5,revision:1,blocks:[],exercise:{language:'python',required:true,maxAttempts:3,prompt:'Echo',starter:'print(input())',tests:[{input:'hello',expected:'hello',hidden:false},{input:'hidden-input',expected:'hidden-output',hidden:true}]}};
  sql.prepare('INSERT INTO courses(id,data,version) VALUES(?,?,1)').run('coding',JSON.stringify({id:'coding',version:1,published:true,graduationPolicyVersion:2,learningMode:'independent_allowed',policyState:'ready',lessons:[lesson]}));
  sql.prepare("INSERT INTO enrollments(user_id,course_id,created_at,authorization_id) VALUES('s','coding','2026','fixture')").run();
  server=createServer((req,res)=>context.run(selected,async()=>{
   try{const chunks=[];for await(const part of req)chunks.push(part);const url=new URL(req.url,'http://127.0.0.1');const response=await routes[url.pathname.split('/')[2]][req.method](new Request(url,{method:req.method,headers:req.headers,...(req.method==='POST'?{body:Buffer.concat(chunks)}:{})}));res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));}catch{res.writeHead(500);res.end('Harness failure');}
  }));
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
  async function call(user,path,body,status,config=null,database=d){
   selected={user:{id:user,name:user,role:user==='s'?'student':'staff'},d:database,cfg:config,inspect:createJudgeInspector(provider)};
   const response=await nativeFetch(base+path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json',Origin:process.env.APP_URL}:{},...(body?{body:JSON.stringify(body)}:{})});const result=await response.json();
   assert.equal(response.status,status,path+': '+JSON.stringify(result));assert.equal(JSON.stringify(result).includes(cfg.token),false);assert.equal(JSON.stringify(result).includes('hidden-input'),false);assert.equal(JSON.stringify(result).includes('hidden-output'),false);records.push({user,path,status});return result;
  }
  for(const user of ['s','t']){await call(user,'/api/judge',null,403,cfg);await call(user,'/api/judge',{},403,cfg);}
  assert.equal(providerCalls,0);
  assert.equal((await call('q','/api/judge',null,200)).passed,false);
  await call('q','/api/judge',{},403,cfg);assert.equal(providerCalls,0);
  assert.equal((await call('o','/api/judge',{},200)).passed,false);
  phase='unsafe';assert.equal((await call('o','/api/judge',{},200,cfg)).passed,false);
  assert.equal((await call('s','/api/studio?course=coding',null,200,cfg)).judgeReady,false);
  const code=()=>({action:'code',courseId:'coding',lessonId:'lab',revision:1,source:'print(input())',requestId:randomUUID()});
  await call('s','/api/studio',code(),503,cfg);assert.equal(sql.prepare('SELECT count(*) n FROM attempts').get().n,0);assert.equal(submitCalls,0);
  phase='healthy';assert.equal((await call('o','/api/judge',{},200,cfg)).passed,true);
  assert.equal((await call('s','/api/studio?course=coding',null,200,cfg)).judgeReady,true);
  const first=await call('s','/api/studio',code(),200,cfg);assert.equal(first.state,'pending');
  phase='poll-failure';assert.equal((await call('s','/api/studio?attempt='+first.id,null,200,cfg)).state,'error');
  assert.equal(sql.prepare('SELECT code_attempts FROM learning_progress_revisions').get().code_attempts,0);
  phase='submit-failure';await call('s','/api/studio',code(),503,cfg);assert.equal(sql.prepare('SELECT code_attempts FROM learning_progress_revisions').get().code_attempts,0);
  assert.equal(sql.prepare('SELECT code_passed FROM learning_progress_revisions').get().code_passed,0);
  // Disabled configuration still rechecks staff access before responding.
  let changed=false;
  const wrap=(stmt,match)=>({bind(...v){return wrap(stmt.bind(...v),match);},all:()=>stmt.all(),run:()=>stmt.run(),async first(){if(match&&!changed){changed=true;sql.prepare("UPDATE user_access SET status='suspended',version=version+1 WHERE user_id='o'").run();}return stmt.first();}});
  await call('o','/api/judge',{},403,null,{...d,prepare:q=>q.startsWith('SELECT 1 WHERE ')?wrap(d.prepare(q),true):d.prepare(q)});assert.equal(changed,true);
  await writeFile('/tmp/stem-t5-route-evidence.json',JSON.stringify({identity:'injected fixture',provider:'deterministic adapter fixture',checks:records,officialExecution:false},null,2)+'\n');
 } finally {
  globalThis.fetch=nativeFetch;if(origin===undefined)delete process.env.APP_URL;else process.env.APP_URL=origin;
  if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}sql.close();delete globalThis[symbol];await rm(folder,{recursive:true,force:true});
 }
});
