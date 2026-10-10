import {seedPrincipal} from "./authorization-fixture.mjs";
import {curriculumEnabled} from '../lib/curriculum-access.ts';
import {applyCurriculumPatch} from '../lib/curriculum-state.ts';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {curriculumOverview,mutateCurriculum,curriculumMutation} from '../lib/curriculum.ts';
import {saveCourse,readCourse} from '../lib/course-data.ts';
import {sampleCourse} from '../lib/seed.ts';
import {classAccess} from '../lib/classes.ts';
import {notificationFeed} from '../lib/notifications.ts';
import {uploadMedia,readMedia,removeCourseMedia} from '../lib/media-data.ts';
import {registerIdentity} from '../lib/access.ts';
import {databaseSql} from '../lib/database.ts';
const status=n=>e=>e.status===n;
export async function curriculumScenarios(t,d){
 const prefix='curr-'+randomUUID().slice(0,8),time=new Date().toISOString();
 const people=Object.fromEntries(['owner','tutor','writer','outsider'].map(k=>[k,{id:prefix+'-'+k,name:k,role:k==='owner'?'owner':k==='tutor'?'tutor':'student',accessStatus:'active',accessVersion:1}]));
 const {owner,tutor,writer,outsider}=people;
 const formerOwner=await d.prepare("SELECT value FROM settings WHERE `key`='owner'").first();
 const root=await mkdtemp(tmpdir()+'/ruangstem-curriculum-'),previousRoot=process.env.UPLOAD_STORAGE_DIR;process.env.UPLOAD_STORAGE_DIR=root;
 let course,draft,uploaded;
 const getDraft=async()=>{draft=(await curriculumOverview(d,writer)).items.find(i=>i.course.id===course.id)?.draft;return draft;};
 const call=(u,b)=>mutateCurriculum(d,u,{courseId:course.id,...b});
 try{
  for(const u of Object.values(people)){
   await d.prepare('INSERT INTO users(id,name,role) VALUES(?,?,?)').bind(u.id,u.name,u.role).run();
   await d.prepare("INSERT INTO user_access(user_id,status,version,created_at,updated_at) VALUES(?,'active',1,?,?)").bind(u.id,time,time).run();
  }
  await d.prepare(databaseSql(d,"INSERT INTO settings(`key`,value) VALUES('owner',?) ON CONFLICT(`key`) DO UPDATE SET value=excluded.value","INSERT INTO settings(`key`,value) VALUES('owner',?) ON DUPLICATE KEY UPDATE value=VALUES(value)")).bind(owner.id).run();
  for(const [name,kind,caps] of [['owner','staff',[]],['tutor','staff',['tutor','curriculum']],['writer','staff',['curriculum']],['outsider','student',[]]])await seedPrincipal(d,people[name].id,kind,caps);
  course=await saveCourse(d,owner,{...structuredClone(sampleCourse),id:prefix+'-course',version:0,published:true,sample:false});
  await d.prepare('INSERT INTO enrollments(user_id,course_id,created_at,authorization_id) VALUES(?,?,?,?)').bind(outsider.id,course.id,time,"fixture").run();
  await t.test('server-confirmed patches update the workspace without a second request', async()=>{
   let view=await curriculumOverview(d,owner);
   const started=await call(owner,{action:'start',version:course.version,draftVersion:0});
   view=applyCurriculumPatch(view,started.patch);
   assert.deepEqual(JSON.parse(JSON.stringify(view)),JSON.parse(JSON.stringify(await curriculumOverview(d,owner))));
   const edited={...view.items.find(i=>i.course.id===course.id).draft.course,title:'Patch test'};
   const saved=await mutateCurriculum(d,owner,{action:'save',course:edited,version:started.patch.draft.version});
   view=applyCurriculumPatch(view,saved.patch);
   assert.deepEqual(JSON.parse(JSON.stringify(view)),JSON.parse(JSON.stringify(await curriculumOverview(d,owner))));
   const submitted=await call(owner,{action:'submit',version:saved.version});
   view=applyCurriculumPatch(view,submitted.patch);
   assert.deepEqual(JSON.parse(JSON.stringify(view)),JSON.parse(JSON.stringify(await curriculumOverview(d,owner))));
   assert.equal(view.items.find(i=>i.course.id===course.id).draft.state,'submitted');
   await call(owner,{action:'requestChanges',version:submitted.patch.draft.version,note:'Uji patch'});
   await d.prepare('DELETE FROM curriculum_drafts WHERE course_id=?').bind(course.id).run();
   await d.prepare('DELETE FROM curriculum_events WHERE course_id=?').bind(course.id).run();
  });
  await t.test('enrollment does not expose curriculum navigation without a course assignment',async()=>{assert.equal(await curriculumEnabled(d,outsider),false);assert.equal(await curriculumEnabled(d,owner),true);});
  await t.test('strict mutations reject chosen actor, invalid IDs and extra privileges',()=>{
   assert.equal(curriculumMutation.safeParse({action:'member',courseId:course.id,userId:writer.id,version:0,active:true,role:'owner'}).success,false);
   assert.equal(curriculumMutation.safeParse({action:'submit',courseId:'../private',version:1}).success,false);
  });
  await t.test('admin grants multiple tutors or dedicated authors per course without teaching or account-management rights',async()=>{
   await assert.rejects(call(tutor,{action:'start',version:course.version}),status(404));
   for(const u of [writer,tutor])await call(owner,{action:'member',userId:u.id,version:0,active:true,targetGrantVersion:1});
   assert.equal((await curriculumOverview(d,writer)).owner,false);
   assert.equal((await curriculumOverview(d,writer)).people.length,0);
   await assert.rejects(curriculumOverview(d,outsider),status(403));
   await assert.rejects(call(writer,{action:'member',userId:outsider.id,version:0,active:true,targetGrantVersion:1}),status(403));
   await assert.rejects(saveCourse(d,writer,course),status(403));
   assert.equal((await registerIdentity(d,{userId:writer.id,displayName:writer.name},false)).role,'curriculum');
   assert.equal((await registerIdentity(d,{userId:tutor.id,displayName:tutor.name},false)).role,'tutor');
   // A real active Tutor grant remains distinct from curriculum membership.
   await d.prepare('INSERT INTO tutor_accounts(user_id,active,granted_by,granted_at) VALUES(?,1,?,?)').bind(tutor.id,owner.id,time).run();
   assert.equal((await registerIdentity(d,{userId:tutor.id,displayName:tutor.name},false)).role,'tutor');
   await d.prepare("INSERT INTO cohorts(id,course_id,mentor_id,name,description,capacity,status,version,created_at) VALUES(?,?,?,'Kelas uji','',10,'active',1,?)").bind(prefix+'-class',course.id,tutor.id,time).run();
   await assert.rejects(classAccess(d,writer,prefix+'-class','staff'),status(403));
   assert.equal((await classAccess(d,tutor,prefix+'-class','staff')).staff,true);
  });
  await t.test('collaborative drafts preserve published lessons and reject stale saves',async()=>{
   await call(writer,{action:'start',version:course.version});await getDraft();
   const initialVersion=draft.version,change=structuredClone(draft.course);change.lessons[0].title='Materi kurikulum baru';
   const outcomes=await Promise.allSettled([mutateCurriculum(d,writer,{action:'save',course:change,version:initialVersion}),mutateCurriculum(d,tutor,{action:'save',course:{...change,title:'Bersaing'},version:initialVersion})]);
   assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);assert.equal(outcomes.find(r=>r.status==='rejected').reason.status,409);
   assert.equal((await readCourse(d,course.id,outsider)).lessons[0].title,course.lessons[0].title);
   await getDraft();assert.equal(draft.version,initialVersion+1);
  });
  await t.test('authors upload private draft files; students cannot read files until approved and lesson prerequisites pass',async()=>{
   uploaded=await uploadMedia(d,writer,{purpose:'course',courseId:course.id},'modul.txt',Buffer.from('Materi draft'));
   assert.equal((await readMedia(d,tutor,uploaded.id)).name,'modul.txt');
   await assert.rejects(readMedia(d,outsider,uploaded.id),status(404));
   const next=structuredClone(draft.course);next.lessons[0].blocks.push({id:randomUUID(),type:'file',content:uploaded.url,caption:'Lampiran kurikulum'});
   await mutateCurriculum(d,writer,{action:'save',course:next,version:draft.version});await getDraft();
   await assert.rejects(removeCourseMedia(d,owner,uploaded.id),status(409));
   await assert.rejects(readMedia(d,outsider,uploaded.id),status(404));
  });
  await t.test('submit locks editing; only admin can request changes or approve; revision increments only for changed lessons',async()=>{
   await call(writer,{action:'submit',version:draft.version});await getDraft();
   await assert.rejects(mutateCurriculum(d,tutor,{action:'save',course:draft.course,version:draft.version}),status(409));
   await assert.rejects(call(writer,{action:'publish',version:draft.version}),status(403));
   await assert.rejects(call(owner,{action:'requestChanges',version:draft.version,note:''}),status(400));
   await call(owner,{action:'requestChanges',version:draft.version,note:'Periksa petunjuk praktikum.'});await getDraft();
   assert.equal(draft.note,'Periksa petunjuk praktikum.');
   const notifications=await notificationFeed(d,writer);assert.ok(notifications.items.some(n=>n.kind==='curriculum'&&n.title.includes('perbaikan')));
   assert.equal((await notificationFeed(d,outsider)).items.some(n=>n.kind==='curriculum'),false);
   await mutateCurriculum(d,writer,{action:'save',course:draft.course,version:draft.version});await getDraft();
   await call(tutor,{action:'submit',version:draft.version});await getDraft();
   const before=await d.prepare('SELECT data,version FROM courses WHERE id=?').bind(course.id).first();
   const failing={...d,batch:items=>d.batch([...items,d.prepare("INSERT INTO curriculum_drafts(course_id,data,base_version,version,state,updated_by,updated_at,note,proof) VALUES(?,'',1,1,'draft',?,?,'','collision')").bind(course.id,owner.id,time)])};
   await assert.rejects(mutateCurriculum(failing,owner,{action:'publish',courseId:course.id,version:draft.version}));
   assert.deepEqual(await d.prepare('SELECT data,version FROM courses WHERE id=?').bind(course.id).first(),before);
   await getDraft();assert.equal(draft.state,'submitted');
   await call(owner,{action:'publish',version:draft.version,note:'Materi disetujui.'});await getDraft();
   const live=await readCourse(d,course.id,outsider);
   assert.equal(live.version,course.version+1);assert.equal(live.lessons[0].revision,course.lessons[0].revision+1);assert.equal(live.lessons[1].revision,course.lessons[1].revision);
   assert.equal((await readMedia(d,outsider,uploaded.id)).name,'modul.txt');
   assert.equal(draft.state,'published');course=live;
  });
  await t.test('changed live versions block approval; deliberate restart uses current course and stale restart cannot discard work',async()=>{
   await call(writer,{action:'start',version:course.version,draftVersion:draft.version});await getDraft();
   await call(writer,{action:'submit',version:draft.version});await getDraft();
   course=await saveCourse(d,owner,{...course,title:'Versi Admin terbaru'});
   await assert.rejects(call(owner,{action:'publish',version:draft.version}),status(409));
   assert.equal((await readCourse(d,course.id,outsider)).title,'Versi Admin terbaru');
   await call(owner,{action:'requestChanges',version:draft.version,note:'Gunakan versi terbaru.'});await getDraft();
   await assert.rejects(call(writer,{action:'restart',version:course.version,draftVersion:draft.version-1}),status(409));
   await call(writer,{action:'restart',version:course.version,draftVersion:draft.version});await getDraft();
   assert.equal(draft.baseVersion,course.version);assert.equal(draft.course.title,course.title);
  });
  await t.test('revoking a course assignment immediately removes draft files and notifications without changing tutor rights',async()=>{
   await call(owner,{action:'member',userId:tutor.id,version:1,active:false});
   assert.equal((await curriculumOverview(d,tutor)).items.length,0);
   await assert.rejects(call(tutor,{action:'submit',version:draft.version}),status(404));
   await assert.rejects(uploadMedia(d,tutor,{purpose:'course',courseId:course.id},'baru.txt',Buffer.from('X')),status(404));
   assert.equal((await d.prepare('SELECT role FROM users WHERE id=?').bind(tutor.id).first()).role,'tutor');
   await d.prepare("UPDATE user_access SET status='suspended' WHERE user_id=?").bind(writer.id).run();
   await assert.rejects(call(writer,{action:'submit',version:draft.version}),status(403));
   await call(owner,{action:'member',userId:writer.id,version:1,active:false});
   assert.equal((await notificationFeed(d,{...writer,accessStatus:'suspended'})).items.some(n=>n.kind==='curriculum'),false);
  });
 }finally{
  if(formerOwner)await d.prepare("UPDATE settings SET value=? WHERE `key`='owner'").bind(formerOwner.value).run();else await d.prepare("DELETE FROM settings WHERE `key`='owner'").run();
  if(previousRoot===undefined)delete process.env.UPLOAD_STORAGE_DIR;else process.env.UPLOAD_STORAGE_DIR=previousRoot;
  await rm(root,{recursive:true,force:true});
 }
}
