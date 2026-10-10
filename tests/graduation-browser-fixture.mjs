// Disposable UAT setup, not evidence that the UI performed these setup actions.
import {randomUUID} from 'node:crypto';
import {graduationCourse} from './graduation-scenarios.mjs';
import {saveCourse,completeLesson} from '../lib/course-data.ts';
import {saveClass,setMembership} from '../lib/classes.ts';
import {saveAssignment,submitProject,reviewProject} from '../lib/projects.ts';
export async function seedGraduationBrowser(d,f){
 const owner=f.users.O,student=f.users.S1,tutor=f.users.TA;
 let c=graduationCourse();c.id='browser-g4-closure';c.title='UAT akhir: kuis dan dua review';
 c.lessons[1].reviewRequirements.push({...c.lessons[1].reviewRequirements[0],id:'review2',title:'Bukti kedua'});
 c.lessons[1].quiz={mode:'required',threshold:100,maxAttempts:5,feedback:'always',questions:[{id:'q',prompt:'Pilih jawaban Benar untuk memenuhi standar kuis100.',options:['Benar','Salah'],correct:[0],explanation:'Standar kuis100 tetap terpisah dari standar review80.'}]};
 c=await saveCourse(d,owner,c);const classId='browser-g4-closure-A';
 await saveClass(d,owner,{id:classId,version:0,courseId:c.id,mentorId:tutor.id,targetGrantVersion:f.users.TA.grantVersions.tutor,name:'UAT akhir kelas A',description:'',startsAt:null,endsAt:null,capacity:10,status:'active'});
 await setMembership(d,owner,classId,student.id,'approved');
 const tasks=[];
 for(const r of c.lessons[1].reviewRequirements){const assignmentId=classId+'-'+r.id;tasks.push(assignmentId);await saveAssignment(d,tutor,{id:assignmentId,classId,version:0,title:r.title,instructions:r.instructions,rubric:r.rubric,requirementId:r.id,dueAt:null,status:'published'});}
 await completeLesson(d,student,c.id,'intro',classId);
 for(const r of c.lessons[1].reviewRequirements){const assignmentId=classId+'-'+r.id;const id=randomUUID();await submitProject(d,student,{action:'submit',id,assignmentId,assignmentVersion:1,previousId:null,previousVersion:0,body:'Setup fixture UAT: kiriman awal '+r.title,url:'',attachmentIds:[]});if(r.id==='review1')await reviewProject(d,tutor,{action:'review',submissionId:id,version:1,status:'accepted',score:100,feedback:'Setup fixture: bukti pertama diterima100.',requestId:randomUUID()});}
 await saveAssignment(d,tutor,{id:classId+'-optional',classId,version:0,title:'Pengayaan opsional',instructions:'Pengayaan, tidak menahan kelulusan.',rubric:'',requirementId:null,dueAt:null,status:'published'});
 f.closureBrowser={courseId:c.id,classId,tasks};
}
