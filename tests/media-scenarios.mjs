import {seedPrincipal} from "./authorization-fixture.mjs";
import {databaseSql} from "../lib/database.ts";
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {uploadMedia,photoInfo,clearPhoto,readMedia,removeCourseMedia,courseMediaList,normalizeImage} from '../lib/media-data.ts';
import {saveCourse,initializeProgress} from '../lib/course-data.ts';
import {sampleCourse} from '../lib/seed.ts';
import {publicCourse} from '../lib/rules.ts';
import {mediaId} from '../lib/media-model.ts';
export async function mediaScenarios(t,d) {
 const prefix='media-'+randomUUID().slice(0,8),root=await mkdtemp(tmpdir()+'/stem-media-'),old=process.env.UPLOAD_STORAGE_DIR;process.env.UPLOAD_STORAGE_DIR=root;
 const owner={id:prefix+'-owner',name:'Owner Test',role:'owner'},alice={id:prefix+'-alice',name:'Siswa Test',role:'student'},bob={id:prefix+'-bob',name:'Other Test',role:'student'};
 const png=await sharp({create:{width:32,height:24,channels:3,background:'#287970'}}).png().toBuffer();
 let course,photo,document,image;
 try {
  for(const u of [owner,alice,bob]) await d.prepare('INSERT INTO users(id,name,role) VALUES(?,?,?)').bind(u.id,u.name,u.role).run();
  await d.prepare(databaseSql(d,"INSERT INTO settings(key,value) VALUES('owner',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value","INSERT INTO settings(`key`,value) VALUES('owner',?) ON DUPLICATE KEY UPDATE value=VALUES(value)")).bind(owner.id).run();
  for(const u of [owner,alice,bob]){await d.prepare("INSERT INTO user_access(user_id,status,version,created_at,updated_at) VALUES(?,'active',1,'2026-10-09','2026-10-09')").bind(u.id).run();await seedPrincipal(d,u.id,u===owner?'staff':'student');}
  course=await saveCourse(d,owner,{...structuredClone(sampleCourse),id:prefix+'-course',version:0});
  await d.prepare("INSERT INTO enrollments(user_id,course_id,created_at,authorization_id) VALUES(?,?,?,'fixture')").bind(alice.id,course.id,new Date().toISOString()).run();
  await t.test('profile images decode and normalize; replacements use compare-and-swap and preserve privacy',async()=>{
   photo=await uploadMedia(d,alice,{purpose:'avatar',previousId:null},'foto.png',png);
   assert.equal((await photoInfo(d,alice.id)).id,photo.id);
   assert.equal((await readMedia(d,alice,photo.id)).mime,'image/png');
   await assert.rejects(readMedia(d,bob,photo.id),e=>e.status===404);
   await assert.rejects(readMedia(d,owner,photo.id),e=>e.status===404);
   await assert.rejects(uploadMedia(d,alice,{purpose:'avatar',previousId:null},'stale.png',png),e=>e.status===409);
   const replaced=await uploadMedia(d,alice,{purpose:'avatar',previousId:photo.id},'baru.png',png);
   await assert.rejects(readMedia(d,alice,photo.id),e=>e.status===404);
   await assert.rejects(clearPhoto(d,alice,photo.id),e=>e.status===409);
   photo=replaced;assert.equal((await photoInfo(d,alice.id)).id,photo.id);
   await clearPhoto(d,alice,photo.id);assert.equal(await photoInfo(d,alice.id),null);
   await assert.rejects(readMedia(d,alice,photo.id),e=>e.status===404);
   await assert.rejects(normalizeImage('palsu.png',Buffer.from([137,80,78,71,13,10,26,10]),true),e=>e.status===415);
   await assert.rejects(uploadMedia(d,alice,{purpose:'avatar',previousId:null},'dokumen.pdf',Buffer.from('%PDF-1.4')),e=>e.status===415);
  });
  await t.test('only owner uploads course files; unused uploads remain private and may be removed',async()=>{
   await assert.rejects(uploadMedia(d,alice,{purpose:'course',courseId:course.id},'materi.txt',Buffer.from('material')),e=>e.status===403);
   await assert.rejects(uploadMedia(d,owner,{purpose:'course',courseId:'missing'},'materi.txt',Buffer.from('material')),e=>e.status===409);
   document=await uploadMedia(d,owner,{purpose:'course',courseId:course.id},'materi.pdf',Buffer.from('%PDF-1.4\n%%EOF'));
   image=await uploadMedia(d,owner,{purpose:'course',courseId:course.id},'diagram.png',png);
   assert.equal((await courseMediaList(d,owner,course.id)).length,2);
   await assert.rejects(readMedia(d,alice,document.id),e=>e.status===404);
   const unused=await uploadMedia(d,owner,{purpose:'course',courseId:course.id},'unused.txt',Buffer.from('unused'));
   await removeCourseMedia(d,owner,unused.id);await assert.rejects(readMedia(d,owner,unused.id),e=>e.status===404);
  });
  await t.test('course references validate ownership, ready state and media type before publishing',async()=>{
   const other=await saveCourse(d,owner,{...structuredClone(course),id:prefix+'-other',version:0});
   other.lessons[0].blocks.push({id:'foreign',type:'image',content:image.url});
   await assert.rejects(saveCourse(d,owner,other),e=>e.status===409);
   const invalid=structuredClone(course);invalid.lessons[0].blocks.push({id:'wrong-type',type:'image',content:document.url});
   await assert.rejects(saveCourse(d,owner,invalid),e=>e.status===409);
   const fake=structuredClone(course);fake.lessons[0].blocks.push({id:'missing',type:'file',content:'/api/media/11111111-1111-4111-8111-111111111111'});
   await assert.rejects(saveCourse(d,owner,fake),e=>e.status===409);
   course.lessons.find(l=>l.id==='coding').blocks.push({id:'attachment',type:'file',content:document.url,caption:'Buku praktik'});
   course.lessons[0].blocks.push({id:'diagram-upload',type:'image',content:image.url});
   course=await saveCourse(d,owner,course);
   await assert.rejects(removeCourseMedia(d,owner,document.id),e=>e.status===409);
   assert.equal((await readMedia(d,alice,image.id)).mime,'image/png');
  });
  await t.test('direct document URLs honor required lessons, current revisions, publication and removed references',async()=>{
   assert.equal(publicCourse(course,[]).lessons.find(l=>l.id==='coding').blocks.length,0);
   await assert.rejects(readMedia(d,alice,document.id),e=>e.status===403);
   const first=course.lessons[0];await initializeProgress(d,alice.id,course.id,first.id,first.revision);await d.prepare('UPDATE learning_progress_revisions SET complete=1 WHERE user_id=? AND course_id=? AND lesson_id=?').bind(alice.id,course.id,first.id).run();
   const sensor=course.lessons.find(l=>l.id==='sensor');
   await initializeProgress(d,alice.id,course.id,sensor.id,sensor.revision);
   await d.prepare('UPDATE learning_progress_revisions SET quiz_passed=1,complete=1 WHERE user_id=? AND course_id=? AND lesson_id=?').bind(alice.id,course.id,sensor.id).run();
   assert.equal((await readMedia(d,alice,document.id)).mime,'application/pdf');
   course.lessons.find(l=>l.id==='sensor').quiz.threshold=99;course=await saveCourse(d,owner,course);
   await assert.rejects(readMedia(d,alice,document.id),e=>e.status===403);
   course.published=false;course=await saveCourse(d,owner,course);
   await assert.rejects(readMedia(d,alice,image.id),e=>e.status===404);
   assert.equal((await readMedia(d,owner,document.id)).mime,'application/pdf');
   course.published=true;course.lessons[0].blocks=course.lessons[0].blocks.filter(b=>b.content!==image.url);course=await saveCourse(d,owner,course);
   await assert.rejects(readMedia(d,alice,image.id),e=>e.status===404);
   await assert.rejects(readMedia(d,owner,image.id,{UPLOAD_STORAGE_DIR:root,APP_URL:'https://different.example'}),e=>e.status===404);
   assert.equal(mediaId(document.url),document.id);
  });
 }finally{await rm(root,{recursive:true,force:true});if(old===undefined)delete process.env.UPLOAD_STORAGE_DIR;else process.env.UPLOAD_STORAGE_DIR=old;}
}
