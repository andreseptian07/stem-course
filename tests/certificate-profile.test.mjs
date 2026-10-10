import test from 'node:test';
import assert from 'node:assert/strict';
import {authorizationDatabase,seedAccessUser} from './authorization-fixture.mjs';
import {readAccessContext} from '../lib/authorization.ts';
import {graduationCourse} from './graduation-scenarios.mjs';
import {saveCourse,completeLesson} from '../lib/course-data.ts';
import {saveClass,setMembership} from '../lib/classes.ts';
import {saveProfile} from '../lib/account-data.ts';
import {emptyProfile} from '../lib/account.ts';
import {certificateStatus,issueCertificate,ownedCertificate} from '../lib/certificates.ts';

test('certificate uses the profile name at issuance and rejects a concurrent name change',async t=>{
 const {d,sql}=authorizationDatabase();
 try{
  for(const [id,kind] of [['owner','staff'],['s1','student'],['s2','student']])await seedAccessUser(d,id,kind);
  sql.prepare("INSERT INTO settings(`key`,value) VALUES('owner','owner')").run();
  const owner=await readAccessContext(d,{id:'owner'}),s1=await readAccessContext(d,{id:'s1'}),s2=await readAccessContext(d,{id:'s2'});
  const c=await saveCourse(d,owner,{...graduationCourse(),id:'profile-cert-course',lessons:graduationCourse().lessons.slice(0,1)});
  const cl='profile-cert-class';
  await saveClass(d,owner,{id:cl,version:0,courseId:c.id,mentorId:null,targetGrantVersion:0,name:'Profile certificate class',description:'',capacity:10,status:'active',startsAt:null,endsAt:null});
  for(const user of [s1,s2]){await setMembership(d,owner,cl,user.id,'approved');await completeLesson(d,user,c.id,'intro',cl);}
  await t.test('new certificates use the saved profile; later edits keep the original document immutable',async()=>{
   await saveProfile(d,s1.id,emptyProfile('Ayu Éléonore Profil'));
   assert.equal((await certificateStatus(d,s1,c.id)).recipientName,'Ayu Éléonore Profil');
   const cert=await issueCertificate(d,s1,c.id,cl,true);assert.equal(cert.recipientName,'Ayu Éléonore Profil');
   await saveProfile(d,s1.id,{...emptyProfile('Nama terbaru'),version:1});
   assert.equal((await ownedCertificate(d,s1,cert.number)).recipientName,'Ayu Éléonore Profil');
  });
  await t.test('a profile name changed during insertion produces a conflict instead of an incorrect certificate',async()=>{
   await saveProfile(d,s2.id,emptyProfile('Nama sebelum terbit'));let changed=false;
   const raced={...d,prepare(query){const wrap=statement=>({...statement,bind(...args){return wrap(statement.bind(...args));},async run(){if(!changed&&query.includes('INTO certificates(')){changed=true;await saveProfile(d,s2.id,{...emptyProfile('Nama berubah saat terbit'),version:1});}return statement.run();}});return wrap(d.prepare(query));}};
   await assert.rejects(issueCertificate(raced,s2,c.id,cl,true),error=>error.status===409);
   assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM certificates WHERE user_id=?').get(s2.id).n,0);
  });
 }finally{sql.close();}
});
