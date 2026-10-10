import {graduationCourse} from './graduation-scenarios.mjs';
import {saveCourse} from '../lib/course-data.ts';
import {saveClass,setMembership} from '../lib/classes.ts';
import {saveAssignment} from '../lib/projects.ts';
import {randomUUID} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {privateDirectory,fileStorage} from '../lib/project-files.ts';
export async function seedGraduationHttp(d,f,env){
 let c=graduationCourse();c.id='http-g4-course';c.title='UAT Nilai dan Kelulusan';c.lessons[2].blocks[0].content='PRIVATE-STAGE-THREE-CONTENT';
 c.lessons[2].reviewRequirements=[{id:'review2',revision:1,title:'Proyek lanjutan',instructions:'PRIVATE-NEXT-TASK-INSTRUCTION',rubric:'Standar hasil 80.'}];
 c=await saveCourse(d,f.users.O,c);f.gradeCourse=c;f.gradeClasses={A:'http-g4-A',B:'http-g4-B'};f.gradeTasks={};
 if(env){
  f.gradeMedia={};const dir=await privateDirectory(env),scope=fileStorage(env).scope;
  for(const kind of ['private','shared']){
   const id=randomUUID(),bytes=Buffer.from('UAT-G4-MEDIA-'+kind);f.gradeMedia[kind]={id,body:bytes.toString()};
   await writeFile(join(dir,id),bytes,{flag:'wx',mode:0o600});
   await d.prepare("INSERT INTO media_files(id,owner_id,course_id,purpose,scope,name,mime,size,ready,bound,created_at) VALUES(?,?,?,'course',?,?,'text/plain; charset=utf-8',?,1,1,?)").bind(id,f.users.O.id,c.id,scope,kind+'.txt',bytes.length,new Date().toISOString()).run();
   c.lessons[2].blocks.push({id:'media-'+kind,type:'file',content:'/api/media/'+id});
   if(kind==='shared')c.lessons[0].blocks.push({id:'media-shared-intro',type:'file',content:'/api/media/'+id});
  }
  // Fixture preparation only: these initial references are not a publication.
  await d.prepare('UPDATE courses SET data=? WHERE id=?').bind(JSON.stringify(c),c.id).run();
 }
 for(const [alias,mentor] of [['A','TA'],['B','TB']]){
  const classId=f.gradeClasses[alias];await saveClass(d,f.users.O,{id:classId,version:0,courseId:c.id,mentorId:f.users[mentor].id,targetGrantVersion:f.users[mentor].grantVersions.tutor,name:'UAT Kelulusan '+alias,description:'',startsAt:null,endsAt:null,capacity:10,status:'active'});
  await setMembership(d,f.users.O,classId,f.users.S1.id,'approved');
  for(const [key,requirementId] of [['R1','review1'],['R2','review2']]){
   const requirement=c.lessons.flatMap(l=>l.reviewRequirements||[]).find(r=>r.id===requirementId);const id=`http-g4-${alias}-${key}`;f.gradeTasks[alias+key]=id;
   await saveAssignment(d,f.users[mentor],{id,classId,version:0,title:requirement.title,instructions:requirement.instructions,rubric:requirement.rubric,requirementId,dueAt:null,status:'published'});
  }
 }
 return f;
}
