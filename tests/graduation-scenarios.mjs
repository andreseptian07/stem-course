import {seedAccessUser} from './authorization-fixture.mjs';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {saveCourse,completeLesson,accessibleLesson,initializeProgress,readProgress,submitQuiz} from '../lib/course-data.ts';
import {databaseSql} from "../lib/database.ts";
import {saveClass,setMembership} from '../lib/classes.ts';
import {saveAssignment,submitProject,reviewProject} from '../lib/projects.ts';
import {tutorDashboard} from '../lib/tutor-dashboard.ts';
import {loadGraduationContext} from '../lib/graduation-data.ts';
import {issueCertificate} from '../lib/certificates.ts';

const status=n=>e=>e.status===n;
export const graduationCourse=()=>({id:'g4-course',version:0,title:'Course UAT',description:'',category:'STEM',level:'Pemula',published:true,sample:false,certificateEnabled:true,graduationPolicyVersion:2,learningMode:'class_required',policyState:'ready',lessons:[
  {id:'intro',revision:1,title:'Fondasi',module:'Modul',minutes:5,blocks:[{id:'text1',type:'text',content:'Pelajari fondasi.'}]},
  {id:'project',revision:1,title:'Praktik',module:'Modul',minutes:5,blocks:[],reviewRequirements:[{id:'review1',revision:1,title:'Proyek wajib',instructions:'Buat proyek lalu jelaskan hasil.',rubric:'Ketepatan 80%, penjelasan 20%.'}]},
  {id:'next',revision:1,title:'Penutup',module:'Modul',minutes:5,blocks:[{id:'text3',type:'text',content:'Materi berikut privat.'}]},
]});

export async function graduationWorkflow(d){

    for(const [id,kind,caps] of [['g4-owner','staff',[]],['g4-tutor','staff',['tutor']],['g4-student','student',[]]])await seedAccessUser(d,id,kind,caps);
    await d.prepare(databaseSql(d,"INSERT INTO settings(key,value) VALUES('owner','g4-owner') ON CONFLICT(key) DO UPDATE SET value=excluded.value","INSERT INTO settings(`key`,value) VALUES('owner','g4-owner') ON DUPLICATE KEY UPDATE value=VALUES(value)")).run();
    const owner={id:'g4-owner',name:'Owner',role:'owner'},tutor={id:'g4-tutor',name:'Tutor',role:'student'},student={id:'g4-student',name:'Siswa',role:'student'};
    let c=await saveCourse(d,owner,graduationCourse());
    for(const id of ['g4-A','g4-B']){
      await saveClass(d,owner,{id,version:0,courseId:c.id,mentorId:'g4-tutor',targetGrantVersion:1,name:id,description:'',startsAt:null,endsAt:null,capacity:10,status:'active'});
      await setMembership(d,owner,id,student.id,'approved');
      await saveAssignment(d,tutor,{id:'task'+id,classId:id,version:0,title:'Proyek',instructions:'Buat proyek lalu jelaskan hasil.',rubric:'Ketepatan 80%, penjelasan 20%.',requirementId:'review1',dueAt:null,status:'published'});
      await saveAssignment(d,tutor,{id:'optional'+id,classId:id,version:0,title:'Tugas opsional',instructions:'Pengayaan yang tidak menahan sertifikat.',rubric:'',requirementId:null,dueAt:null,status:'published'});
    }
    assert.equal((await loadGraduationContext(d,student,c.id)).state.problem.code,'CLASS_CONTEXT_REQUIRED');
    await assert.rejects(()=>accessibleLesson(d,student,c.id,'next','g4-A'),status(403));
    const completeId=randomUUID();
    await completeLesson(d,student,c.id,'intro','g4-A',completeId);
    await completeLesson(d,student,c.id,'intro','g4-A',completeId);
    assert.equal((await d.prepare("SELECT count(*) AS n FROM academic_mutation_receipts WHERE action='complete' AND actor_id='g4-student'").first()).n,1);
    await assert.rejects(()=>completeLesson(d,student,c.id,'project','g4-A'),status(403));
    const submit={action:'submit',id:randomUUID(),assignmentId:'taskg4-A',assignmentVersion:1,previousId:null,previousVersion:0,body:'Proyek pertama',url:'',attachmentIds:[]};
    await submitProject(d,student,submit);await submitProject(d,student,submit);
    await assert.rejects(()=>submitProject(d,student,{...submit,body:'Payload berbeda'}),status(409));
    await assert.rejects(()=>reviewProject(d,tutor,{action:'review',submissionId:submit.id,version:1,status:'accepted',feedback:'Belum memenuhi',score:79}),status(400));
    await reviewProject(d,tutor,{action:'review',submissionId:submit.id,version:1,status:'changes_requested',feedback:'Perbaiki',score:79});
    assert.equal((await loadGraduationContext(d,student,c.id,'g4-A')).state.lessons[2].unlocked,false);
    const revised={...submit,id:randomUUID(),previousId:submit.id,previousVersion:2,body:'Proyek revisi'};
    await submitProject(d,student,revised);
    const review={action:'review',submissionId:revised.id,version:1,status:'accepted',feedback:'Memenuhi standar',score:80,requestId:randomUUID()};
    await reviewProject(d,tutor,review);await reviewProject(d,tutor,review);
    await completeLesson(d,student,c.id,'project','g4-A');
    assert.equal((await loadGraduationContext(d,student,c.id,'g4-A')).state.lessons[2].unlocked,true);
    assert.equal((await loadGraduationContext(d,student,c.id,'g4-B')).state.lessons[2].unlocked,false);
    await completeLesson(d,student,c.id,'next','g4-A');
    const certificate=await issueCertificate(d,student,c.id,'g4-A',true);
    assert.equal((await issueCertificate(d,student,c.id,'g4-A',true)).number,certificate.number);
    await assert.rejects(()=>issueCertificate(d,student,c.id,'g4-B',true),status(403));
    let historicalLatest;
    for(let attempt=3;attempt<=20;attempt++){
      historicalLatest=crypto.randomUUID();
      await d.prepare("INSERT INTO project_submissions(id,assignment_id,student_id,attempt,assignment_version,assessment_revision,lesson_revision,requirement_revision,snapshot,instructions,body,url,submitted_at,status) VALUES(?,'taskg4-A','g4-student',?,1,1,1,1,'{}','Original','Historical fixture','','2026-10-10','submitted')").bind(historicalLatest,attempt).run();
    }
    await assert.rejects(()=>submitProject(d,student,{...revised,id:randomUUID(),previousId:historicalLatest,previousVersion:1}),status(409));
    await saveAssignment(d,tutor,{id:'taskg4-A',classId:'g4-A',version:1,title:'Proyek',instructions:'Instruksi substansial baru.',rubric:'Rubrik baru.',requirementId:'review1',dueAt:null,status:'published'});
    assert.equal((await loadGraduationContext(d,student,c.id,'g4-A')).state.lessons[2].unlocked,false);
    assert.equal((await tutorDashboard(d,tutor)).pendingCount,0);
    assert.equal((await issueCertificate(d,student,c.id,'g4-A',true)).number,certificate.number);
    await submitProject(d,student,{...revised,id:randomUUID(),assignmentVersion:2,previousId:historicalLatest,previousVersion:1,body:'Mengerjakan instruksi baru'});
    assert.equal((await tutorDashboard(d,tutor)).pendingCount,1);
    assert.equal((await d.prepare("SELECT count(*) AS n FROM project_submissions WHERE student_id='g4-student'").first()).n,21);
    assert.equal((await d.prepare("SELECT count(*) AS n FROM project_reviews WHERE reviewer_id='g4-tutor'").first()).n,2);
    const next=structuredClone(c);next.lessons[0].blocks[0].content='Fondasi berubah substansial.';
    c=await saveCourse(d,owner,next);
    await initializeProgress(d,student.id,c.id,'intro',2);
    assert.equal((await readProgress(d,student.id,c.id)).filter(p=>p.lessonId==='intro').length,2);
    const revisedLesson=structuredClone(c);revisedLesson.lessons[1].reviewRequirements[0].instructions+=' New requirement';await saveCourse(d,owner,revisedLesson);
    assert.equal((await tutorDashboard(d,tutor)).pendingCount,0);

}
