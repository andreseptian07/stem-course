import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
export async function testAuthorizationHttp(base,f,metadata={}){
 const cookies={},evidence=[];
 const persist=()=>writeFile('/tmp/ruangstem-t2-http-evidence.json',JSON.stringify({at:new Date().toISOString(),environment:'disposable MariaDB + Next '+(metadata.mode||'development')+'; no .env.local',checks:evidence.length,...metadata,results:evidence},null,2)+'\n');
 async function request(alias,path,{method='GET',body,form,headers={}}={}){if(path==='/api/studio'&&['quiz','complete','code'].includes(body?.action)){const c=Object.values(f.courses).find(c=>c.id===body.courseId);body={revision:c?.lessons.find(l=>l.id===body.lessonId)?.revision||1,requestId:randomUUID(),...body};}return fetch(base+path,{redirect:'manual',method,headers:{...(cookies[alias]?{Cookie:cookies[alias]}:{}),...(method==='GET'?{}:{Origin:metadata.origin||base}),...(body?{'Content-Type':'application/json'}:{}),...headers},...(body?{body:JSON.stringify(body)}:form?{body:form}:{})});}
 async function check(id,alias,path,options,expected,inspect){const r=await request(alias,path,options),body=await r.text();evidence.push({case:id,alias,path,method:options?.method||'GET',expected,status:r.status,location:r.headers.get('location'),bodyHash:createHash('sha256').update(body).digest('hex')});if(Array.isArray(expected)?!expected.includes(r.status):r.status!==expected)await persist();if(Array.isArray(expected))assert.ok(expected.includes(r.status),`${id} ${alias} ${path}: ${r.status}`);else assert.equal(r.status,expected,`${id} ${alias} ${path}`);if(inspect)try{await inspect(body,r);}catch(error){await persist();throw error;}return body;}
 for(const [alias,c] of Object.entries(f.credentials)){const r=await request('', '/api/auth',{method:'POST',body:{action:'login',...c,returnTo:'/dashboard'}});assert.equal(r.status,200,'Fixture login '+alias);const header=r.headers.get('set-cookie');assert.ok(header?.includes('HttpOnly'));cookies[alias]=header.split(';')[0];}
 const priv=['/api/account','/api/access','/api/classes','/api/projects?class='+f.classes.K1,'/api/studio','/api/curriculum','/api/permissions','/api/preview','/api/notifications','/api/reports','/api/tutors','/api/email-settings','/api/media','/api/media/'+randomUUID(),'/api/project-files/'+randomUUID(),'/api/certificates','/api/certificates/RS-20260101-ABCDEFGHIJKL'];
 for(const path of priv)await check('T2-004','guest',path,{},401);
 for(const alias of ['O','S1','TA','Q1','TQ','F0'])await check('T2-001',alias,'/api/account',{},200,body=>{const data=JSON.parse(body);assert.equal(data.user.kind,alias==='S1'?'student':'staff');if(alias!=='S1')assert.equal(data.courses.length,0);});
 for(const alias of ['P','X','M']){for(const path of ['/api/account','/api/classes','/api/curriculum','/api/studio','/api/media'])await check('T2-003/005',alias,path,{},403);for(const path of ['/api/access','/api/notifications'])await check('T2-053',alias,path,{},200,body=>{assert.equal(body.includes('PRIVATE-'),false);});}
 const noOwner=['S1','TA','TB','Q1','Q2','TQ','F0'];
 for(const alias of noOwner){for(const path of ['/api/permissions','/api/reports','/api/tutors','/api/email-settings','/api/studio?admin=1'])await check('T2-054',alias,path,{},403);await check('T2-054',alias,'/api/judge',{method:'POST',body:{}},403);await check('T2-054',alias,'/api/registration',{method:'POST',body:{enabled:true}},403);}
 for(const path of ['/api/permissions','/api/reports','/api/tutors','/api/email-settings','/api/studio?admin=1'])await check('T2-054','O',path,{},200);
 for(const alias of ['O','TA','Q1','TQ','F0']){await check('T2-015',alias,'/api/studio',{},403);await check('T2-016',alias,'/api/account',{method:'POST',body:{action:'enroll',courseId:f.courses.C2.id}},403);for(const body of [{action:'complete',courseId:f.courses.C1.id,lessonId:'embedded'},{action:'quiz',courseId:f.courses.C1.id,lessonId:'sensor',answers:{}},{action:'code',courseId:f.courses.C1.id,lessonId:'coding',source:'print(1)',requestId:randomUUID()}])await check('T2-015',alias,'/api/studio',{method:'POST',body},403);await check('T2-050',alias,'/api/certificates',{},403);await check('T2-050',alias,'/api/certificates',{method:'POST',body:{action:'issue',courseId:f.courses.C1.id,classId:f.classes.K1,consent:true}},403);}
 for(const alias of ['O','TA','Q1','TQ','F0'])for(const query of ['?attempt=unknown','?discussion='+f.courses.C1.id,'?history='+f.courses.C1.id+'&lesson=embedded'])if(!(alias==='O'&&query.startsWith('?discussion=')))await check('T2-015/022',alias,'/api/studio'+query,{},403);
 await check('T2-018','TA','/api/preview?course='+f.courses.C1.id+'&course='+f.courses.C1.id,{},400);
 await check('T2-058','S1','/preview',{},307,(body,r)=>assert.ok(r.headers.get('location')?.startsWith('/dashboard')));
 await check('T2-013','S1','/api/studio',{},200,body=>{assert.equal(body.includes('"correct"'),false);assert.equal(body.includes('"hidden":true'),false);const data=JSON.parse(body),lesson=data.courses.find(c=>c.id===f.courses.C1.id).lessons.find(l=>l.id==='coding');assert.equal(lesson.locked,true);assert.equal(lesson.blocks.length,0);});
 for(const query of ['?admin=1&admin=1','?admin=1&discussion='+f.courses.C1.id,'?preview=1','?lesson=sensor'])await check('T2-018','S1','/api/studio'+query,{},400);
 for(const body of [{action:'invented',courseId:f.courses.C1.id,lessonId:'embedded'},{action:'complete',courseId:f.courses.C1.id,lessonId:'embedded',role:'owner'}])await check('T2-018','S1','/api/studio',{method:'POST',body},400);
 for(const alias of ['S1','TA','F0'])await check('T2-038',alias,'/api/curriculum',{},403);
 await check('T2-039','O','/api/curriculum',{},200,body=>{assert.equal(JSON.parse(body).people.some(p=>p.id===f.users.S1.id),false);});
 for(const [alias,course,n] of [['TA','C1',200],['TA','C2',404],['TA','C3',404],['Q1','C1',200],['Q1','C2',404],['Q2','C2',200],['TQ','C2',200],['O','C3',200],['S1','C1',404]])await check('T2-019/020',alias,'/api/preview?course='+f.courses[course].id,{},n,body=>{assert.equal(body.includes('"correct"'),false);assert.equal(body.includes('"hidden":true'),false);});
 for(const [alias,key,n] of [['TA','K1',200],['TA','K2',404],['TB','K1',404],['TQ','K5',200],['TQ','K1',404],['S1','K1',200],['S1','K2',404],['Q1','K1',403]])await check('T2-027/028/031',alias,'/api/projects?class='+f.classes[key],{},n);
 await check('T2-027','TA','/api/classes',{},200,body=>{assert.equal(body.includes('PRIVATE K2'),false);assert.equal(body.includes('PRIVATE K3'),false);});
 await check('T2-034','TA','/api/classes',{method:'POST',body:{action:'post',classId:f.classes.K1,kind:'announcement',body:'UAT announcement'}},200);
 await check('T2-034','TA','/api/classes',{method:'POST',body:{action:'post',classId:f.classes.K2,kind:'announcement',body:'FORBIDDEN'}},404);
 await check('T2-054','S1','/api/permissions',{method:'POST',body:{action:'makeStaff',targetId:f.users.S2.id,capability:'tutor',principalVersion:1,grantVersion:0,reason:'FORBIDDEN'}},403);
 await check('T2-002','O','/api/permissions',{method:'POST',body:{action:'setGrant',targetId:f.users.TA.id,capability:'tutor',principalVersion:2,grantVersion:1,active:false,reason:'Injected',actorId:f.users.O.id}},400);
 const form=new FormData();form.append('file',new File(['PRIVATE HTTP ATTACHMENT'],'uat.txt',{type:'text/plain'}));
 const uploaded=JSON.parse(await check('T2-045','S1','/api/project-files?assignment='+f.tasks.K1,{method:'POST',form},201));
 for(const alias of ['O','TA','S2','TB','Q1'])await check('T2-045',alias,'/api/project-files/'+uploaded.id,{},404);
 await check('T2-045','S1','/api/project-files/'+uploaded.id,{},200,body=>assert.equal(body,'PRIVATE HTTP ATTACHMENT'));
 await check('T2-046','S1','/api/projects',{method:'POST',body:{action:'submit',id:randomUUID(),assignmentId:f.tasks.K1,assignmentVersion:1,previousId:null,previousVersion:0,body:'UAT submission',url:'',attachmentIds:[uploaded.id]}},200);
 for(const alias of ['O','TA','S1'])await check('T2-046',alias,'/api/project-files/'+uploaded.id,{},200);
 for(const alias of ['TB','S2','Q1'])await check('T2-046',alias,'/api/project-files/'+uploaded.id,{},404);
 for(const [path,permission] of [['/curriculum','curriculum'],['/learn','student'],['/learn?view=admin','owner'],['/certificates','student']]){const alias=permission==='curriculum'?'S1':permission==='student'?'TA':'S1';await check('T2-058',alias,path,{},307,(body,r)=>assert.ok(r.headers.get('location')?.startsWith('/dashboard')));}
 // Next 16.3 validates the _rsc cache-busting value before app authorization.
 // Follow only that same-route normalization, preserving headers/cookies; then
 // assert the actual application redirect and absence of private RSC payloads.
 for(const [alias,path,target] of [['TA','/learn','/dashboard'],['S1','/learn?view=admin','/dashboard'],['S1','/curriculum','/dashboard'],['Q1','/classes','/dashboard'],['TA','/certificates','/dashboard'],['S1','/preview','/dashboard'],['guest','/profile','/login'],['guest','/curriculum','/login']])for(const prefetch of [false,true]){
   const headers={RSC:'1',...(prefetch?{'Next-Router-Prefetch':'1'}:{})};let normalized=path;
   await check('T2-004/058-RSC-transport',alias,path,{headers},[200,307],(body,r)=>{
     assert.equal(body.includes('PRIVATE-'),false);assert.equal(body.includes('PRIVATE K'),false);
     const location=r.headers.get('location');if(r.status===307&&location){const url=new URL(location,base);if(url.pathname===new URL(path,base).pathname){assert.equal(url.origin,new URL(base).origin);assert.ok(url.searchParams.has('_rsc'));assert.equal(body,'');normalized=url.pathname+url.search;}}
   });
   await check('T2-004/058-RSC',alias,normalized,{headers},[200,307],(body,r)=>{
     assert.equal(body.includes('PRIVATE-'),false);assert.equal(body.includes('PRIVATE K'),false);
     if(r.status===307){const location=new URL(r.headers.get('location'),base);assert.ok(location.pathname.startsWith(target),`${alias} ${path} redirected to ${location.pathname}; expected ${target}`);}else if(prefetch){assert.ok(r.headers.get('content-type')?.includes('text/x-component'));assert.equal(body.includes('\"correct\"'),false);assert.equal(body.includes('\"hidden\":true'),false);}else{assert.ok(body.includes('NEXT_REDIRECT'));assert.ok(body.includes(target));}
   });
 }
 await check('CSRF' ,'TA','/api/studio',{method:'POST',body:{action:'complete',courseId:f.courses.C1.id,lessonId:'embedded'},headers:{Origin:'https://evil.example'}},403);
 for(const alias of noOwner){
   await check('T2-054',alias,'/api/access',{method:'POST',body:{userId:f.users.S2.id,version:2,status:'suspended',reason:'Forbidden status'}},403);
   await check('T2-054',alias,'/api/tutors',{method:'POST',body:{action:'invite',invitation:{email:'unused@permissions.ci.example',displayName:'No invitation',classId:null,capability:'curriculum',courseId:null}}},403);
   await check('T2-054',alias,'/api/email-settings',{method:'POST',body:{action:'disable',version:1}},403);
   await check('T2-054',alias,'/api/studio',{method:'POST',body:{action:'resetAttempts',userId:f.users.S1.id,courseId:f.courses.C1.id,lessonId:'embedded'}},403);
 }
 for(const alias of ['O','TA','Q1','TQ','F0']){
   await check('T2-015/022',alias,'/api/studio',{method:'POST',body:{action:'rsvp',sessionId:'permission-global-live',join:true}},403);
   if(alias!=='O')await check('T2-022',alias,'/api/studio',{method:'POST',body:{action:'message',courseId:f.courses.C1.id,lessonId:'embedded',body:'Forbidden personal course message'}},403);
   await check('T2-050',alias,'/api/certificates?course='+f.courses.C1.id,{},403);
 }
 await check('T2-049/051','S1','/api/certificates?admin=1',{},403);
 await check('T2-051','O','/api/certificates?admin=1',{},200);
 await check('T2-055','guest','/api/catalog',{},200,body=>{assert.equal(body.includes('PRIVATE-'),false);assert.equal(body.includes(f.courses.C3.id),false);assert.equal(body.includes('"correct"'),false);});
 await check('T2-055','guest','/api/registration',{},200);
 await check('T2-022','S1','/api/studio',{method:'POST',body:{action:'message',courseId:f.courses.C1.id,lessonId:'embedded',body:'UAT authorized lesson discussion'}},200);
 await check('T2-022','S1','/api/studio?discussion='+f.courses.C1.id+'&lesson=embedded',{},200,body=>assert.ok(body.includes('UAT authorized lesson discussion')));
 await check('T2-022','S1','/api/studio?discussion='+f.courses.C1.id+'&lesson=coding',{},403);
 await check('T2-013','S1','/api/studio?history='+f.courses.C1.id+'&lesson=embedded',{},200);
 await check('T2-023','O','/api/studio',{method:'POST',body:{action:'saveSession',session:{id:'permission-global-live',courseId:f.courses.C1.id,title:'UAT global session',kind:'online',startsAt:'2099-01-01T00:00:00Z',duration:60,location:'',url:'https://example.invalid/PRIVATE-GLOBAL-MEETING',capacity:10}}},200);
 await check('T2-023','S1','/api/studio',{method:'POST',body:{action:'rsvp',sessionId:'permission-global-live',join:true}},200);
 await check('T2-023','S1','/api/studio',{},200,body=>assert.ok(body.includes('PRIVATE-GLOBAL-MEETING')));
 await check('T2-023','S1','/api/studio',{method:'POST',body:{action:'rsvp',sessionId:'permission-global-live',join:false}},200);
 await check('T2-023','S1','/api/studio',{},200,body=>assert.equal(body.includes('PRIVATE-GLOBAL-MEETING'),false));
 for(const alias of ['TA','Q1','TQ','F0'])await check('T2-016',alias,'/api/auth',{method:'POST',body:{action:'login',...f.credentials[alias],returnTo:'/dashboard?join='+f.courses.C2.id}},200,(body,response)=>{const cookie=response.headers.get('set-cookie');assert.ok(cookie?.includes('HttpOnly'));cookies[alias]=cookie.split(';')[0];});
 // Registration is exercised only on this isolated database; mail stays disabled.
 await check('T2-017','O','/api/registration',{method:'POST',body:{enabled:true}},200);
 const fresh={email:'new-student@permissions.ci.example',password:f.credentials.S1.password};
 await check('T2-017','guest','/api/auth',{method:'POST',body:{action:'register',...fresh,displayName:'New UAT student',courseId:f.courses.C1.id}},201,body=>assert.equal(JSON.parse(body).emailQueued,false));
 const login=await request('','/api/auth',{method:'POST',body:{action:'login',...fresh,returnTo:'/dashboard?join='+f.courses.C2.id}});
 assert.equal(login.status,200);assert.equal((await login.json()).redirect,'/access');cookies.NEW=login.headers.get('set-cookie').split(';')[0];
 await check('T2-017','NEW','/api/studio',{},403);
 const access=JSON.parse(await check('T2-017','O','/api/access',{},200));
 const registered=access.users.find(u=>u.name==='New UAT student');assert.ok(registered);assert.equal(registered.kind,'student');assert.equal(registered.status,'pending');
 await check('T2-017','O','/api/access',{method:'POST',body:{userId:registered.id,version:registered.version,status:'active',reason:'Approve disposable registration'}},200);
 await check('T2-017','NEW','/api/studio',{},200,body=>{const data=JSON.parse(body);assert.deepEqual(data.courses.map(c=>c.id),[f.courses.C1.id]);});
 await check('T2-017','NEW','/api/account',{method:'POST',body:{action:'enroll',courseId:f.courses.C2.id}},200);
 await check('T2-017','NEW','/api/studio',{},200,body=>assert.equal(JSON.parse(body).courses.length,2));
 const certificateCourse={...structuredClone(f.courses.C1),id:'permission-certificate',version:0,title:'UAT Certificate Scope',certificateEnabled:true,lessons:[structuredClone(f.courses.C1.lessons[0])]};
 await check('T2-054','O','/api/studio',{method:'POST',body:{action:'saveCourse',course:certificateCourse}},200);
 const certificateClass={id:'permission-certificate-class',version:0,courseId:certificateCourse.id,mentorId:f.users.TA.id,targetGrantVersion:f.users.TA.grantVersions.tutor,name:'Certificate UAT',description:'Disposable certificate',capacity:10,status:'open',startsAt:null,endsAt:null};
 await check('T2-026','O','/api/classes',{method:'POST',body:{action:'saveClass',class:certificateClass}},200);
 await check('T2-029','S1','/api/classes',{method:'POST',body:{action:'requestJoin',classId:certificateClass.id}},200);
 await check('T2-030','O','/api/classes',{method:'POST',body:{action:'membership',classId:certificateClass.id,userId:f.users.S1.id,status:'approved'}},200);
 const certificateTask={id:'permission-certificate-task',classId:certificateClass.id,version:0,title:'Certificate Task',instructions:'Scope test',status:'published',dueAt:null};
 await check('T2-034','TA','/api/projects',{method:'POST',body:{action:'saveAssignment',assignment:certificateTask}},200);
 await check('T2-013','S1','/api/studio',{method:'POST',body:{action:'complete',courseId:certificateCourse.id,lessonId:certificateCourse.lessons[0].id}},200);
 const submissionId=randomUUID();
 await check('T2-046','S1','/api/projects',{method:'POST',body:{action:'submit',id:submissionId,assignmentId:certificateTask.id,assignmentVersion:1,previousId:null,previousVersion:0,body:'Certificate scope test',url:'',attachmentIds:[]}},200);
 await check('T2-034','TA','/api/projects',{method:'POST',body:{action:'review',submissionId,version:1,status:'accepted',feedback:'Meets test rubric',score:90}},200);
 await check('T2-049','S1','/api/certificates?course='+certificateCourse.id,{},200,body=>assert.equal(JSON.parse(body).classes[0].eligible,true));
 const issued=JSON.parse(await check('T2-049','S1','/api/certificates',{method:'POST',body:{action:'issue',courseId:certificateCourse.id,classId:certificateClass.id,consent:true}},200)).certificate;
 await check('T2-049','S1','/api/certificates/'+issued.number,{},200,(body,response)=>{assert.ok(response.headers.get('content-type').includes('application/pdf'));assert.ok(body.startsWith('%PDF'));});
 await check('T2-049','S2','/api/certificates/'+issued.number,{},404);
 for(const alias of ['O','TA','Q1','TQ','F0'])await check('T2-050',alias,'/api/certificates/'+issued.number,{},403);
 await check('T2-051','O','/api/certificates',{method:'POST',body:{action:'revoke',number:issued.number,reason:'Disposable revocation test'}},200);
 await check('T2-049','S1','/api/certificates/'+issued.number,{},410);
 for(const [alias,course,n] of [['Q1','C1',200],['TA','C1',403],['Q2','C1',404]])await check('T2-042/044',alias,'/api/media?course='+f.courses[course].id,{},n);
 const newContext=JSON.parse(await check('T2-007','NEW','/api/account',{},200)).user;
 const beforeEvents=JSON.parse(await check('T2-011','O','/api/permissions',{},200)).events.length;
 const promotion={action:'makeStaff',targetId:newContext.id,capability:'tutor',principalVersion:newContext.principalVersion,grantVersion:newContext.grantVersions.tutor,reason:'Explicit disposable staff conversion'};
 const promoted=JSON.parse(await check('T2-007','O','/api/permissions',{method:'POST',body:promotion},200)).user;
 assert.equal(promoted.kind,'staff');assert.equal(promoted.capabilities.tutor,true);
 await check('T2-007/015','NEW','/api/studio',{},403);
 await check('T2-007','NEW','/api/account',{},200,body=>assert.equal(JSON.parse(body).courses.length,0));
 await check('T2-011','O','/api/permissions',{method:'POST',body:promotion},409);
 await check('T2-011','O','/api/permissions',{method:'POST',body:{action:'setGrant',targetId:promoted.id,capability:'tutor',principalVersion:promoted.principalVersion,grantVersion:promoted.grantVersions.tutor,active:true,reason:'No-op fixture retry'}},200,body=>assert.equal(JSON.parse(body).unchanged,true));
 await check('T2-011','O','/api/permissions',{},200,body=>assert.equal(JSON.parse(body).events.length,beforeEvents+1));
 for(const [path,body] of [
   ['/api/account',{action:'saveProfile',profile:{}}],
   ['/api/classes',{action:'requestJoin',classId:f.classes.K3}],
   ['/api/projects',{action:'review',submissionId,version:2,status:'accepted',feedback:'No guest',score:90}],
   ['/api/studio',{action:'complete',courseId:f.courses.C1.id,lessonId:'embedded'}],
   ['/api/curriculum',{action:'start',courseId:f.courses.C1.id,version:1}],
   ['/api/certificates',{action:'issue',courseId:certificateCourse.id,classId:certificateClass.id,consent:true}],
   ['/api/permissions',promotion],
   ['/api/judge',{}],
   ['/api/registration',{enabled:true}],
 ])await check('T2-004','guest',path,{method:'POST',body},401);
 await persist();
 console.log(`Authorization HTTP: ${evidence.length} checks passed; evidence redacted.`);
 return {checks:evidence.length};
}
