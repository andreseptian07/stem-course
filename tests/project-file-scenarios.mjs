import {seedPrincipal} from "./authorization-fixture.mjs";
import {databaseSql} from "../lib/database.ts";
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {sampleCourse} from '../lib/seed.ts';
import {saveClass,setMembership} from '../lib/classes.ts';
import {saveAssignment,submitProject,projectList,reviewProject} from '../lib/projects.ts';
import {uploadProjectFile,downloadProjectFile,removeProjectFile} from '../lib/project-files.ts';
export async function projectFileScenarios(t,d) {
 const prefix='upload-'+randomUUID().slice(0,8),root=await mkdtemp(tmpdir()+'/stem-upload-db-');
 const beforeDir=process.env.UPLOAD_STORAGE_DIR;process.env.UPLOAD_STORAGE_DIR=root;
 const owner={id:prefix+'-owner',name:'Owner Test',role:'owner'},tutor={id:prefix+'-tutor',name:'Tutor Test',role:'tutor'},alice={id:prefix+'-alice',name:'Siswa Test',role:'student'},bob={id:prefix+'-bob',name:'Other Test',role:'student'};
 const classId=prefix+'-class',assignmentId=prefix+'-task',submissionId=prefix+'-submission';
 let file;
 try {
  for(const u of [owner,tutor,alice,bob]) {await d.prepare('INSERT INTO users(id,name,role) VALUES(?,?,?)').bind(u.id,u.name,u.role).run();await d.prepare("INSERT INTO user_access(user_id,status,version,created_at,updated_at) VALUES(?,'active',1,?,?)").bind(u.id,new Date().toISOString(),new Date().toISOString()).run();}
  await d.prepare(databaseSql(d,"INSERT INTO settings(key,value) VALUES('owner',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value","INSERT INTO settings(`key`,value) VALUES('owner',?) ON DUPLICATE KEY UPDATE value=VALUES(value)")).bind(owner.id).run();
  for(const u of [owner,tutor,alice,bob])await seedPrincipal(d,u.id,[owner,tutor].includes(u)?'staff':'student',u===tutor?['tutor']:[]);
  const course={...structuredClone(sampleCourse),id:prefix+'-course'};
  await d.prepare('INSERT INTO courses(id,data,version) VALUES(?,?,1)').bind(course.id,JSON.stringify(course)).run();
  await saveClass(d,owner,{id:classId,version:0,courseId:course.id,mentorId:tutor.id,targetGrantVersion:1,name:'Upload test',description:'',startsAt:null,endsAt:null,capacity:5,status:'open'});
  for(const u of [alice,bob]) await setMembership(d,owner,classId,u.id,'approved');
  await saveAssignment(d,owner,{id:assignmentId,classId,version:0,title:'Upload Test',instructions:'Synthetic fixture',status:'published',dueAt:null});
  const submit=(id,extra={})=>({action:'submit',id,assignmentId,assignmentVersion:1,previousId:null,previousVersion:0,body:'Synthetic result',url:'',...extra});
  await t.test('staged files are private and wrong-owner or stale claims release reservations',async()=>{
   file=await uploadProjectFile(d,alice,assignmentId,'hasil.txt',Buffer.from('synthetic fixture'));
   assert.equal((await projectList(d,tutor,classId)).files.length,0);
   await assert.rejects(downloadProjectFile(d,tutor,file.id),e=>e.status===404);
   await assert.rejects(submitProject(d,bob,submit(prefix+'-wrong',{attachmentIds:[file.id]})),e=>e.status===409);
   await assert.rejects(submitProject(d,alice,submit(prefix+'-stale',{assignmentVersion:99,attachmentIds:[file.id]})),e=>e.status===409);
   assert.equal((await d.prepare('SELECT submission_id FROM project_files WHERE id=?').bind(file.id).first()).submission_id,null);
  });
  await t.test('partial claims recover, submission retains file, and completed attempts cannot delete or reuse it',async()=>{
   await assert.rejects(submitProject(d,alice,submit(prefix+'-partial',{attachmentIds:[file.id,'missing']})),e=>e.status===409);
   assert.equal((await d.prepare('SELECT submission_id FROM project_files WHERE id=?').bind(file.id).first()).submission_id,null);
   await submitProject(d,alice,submit(submissionId,{attachmentIds:[file.id]}));
   assert.equal((await downloadProjectFile(d,tutor,file.id)).bytes.toString(),'synthetic fixture');
   await assert.rejects(removeProjectFile(d,alice,file.id),e=>e.status===404);
   await reviewProject(d,tutor,{action:'review',submissionId,version:1,status:'changes_requested',feedback:'Revise',score:null});
   await assert.rejects(submitProject(d,alice,submit(prefix+'-reuse',{previousId:submissionId,previousVersion:2,attachmentIds:[file.id]})),e=>e.status===409);
  });
  await t.test('draft quota is bounded and deleting a staged file frees capacity',async()=>{
   const drafts=[];for(let n=0;n<3;n++)drafts.push(await uploadProjectFile(d,alice,assignmentId,`file${n}.txt`,Buffer.from('draft')));
   await assert.rejects(uploadProjectFile(d,alice,assignmentId,'extra.txt',Buffer.from('extra')),e=>e.status===409);
   await removeProjectFile(d,alice,drafts[0].id);
   await uploadProjectFile(d,alice,assignmentId,'retry.txt',Buffer.from('retry'));
  });
  await t.test('downloads enforce current membership, mentor assignment and storage scope',async()=>{
   await setMembership(d,owner,classId,alice.id,'removed');
   await assert.rejects(downloadProjectFile(d,alice,file.id),e=>e.status===404);
   await d.prepare('UPDATE cohorts SET mentor_id=? WHERE id=?').bind(bob.id,classId).run();
   await assert.rejects(downloadProjectFile(d,tutor,file.id),e=>e.status===404);
   await assert.rejects(downloadProjectFile(d,owner,file.id,{UPLOAD_STORAGE_DIR:root,APP_URL:'https://different.example'}),e=>e.status===404);
   assert.equal((await downloadProjectFile(d,owner,file.id)).bytes.toString(),'synthetic fixture');
  });
 } finally {await rm(root,{recursive:true,force:true});if(beforeDir===undefined)delete process.env.UPLOAD_STORAGE_DIR;else process.env.UPLOAD_STORAGE_DIR=beforeDir;}
}
