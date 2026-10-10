import test from 'node:test';
import assert from 'node:assert/strict';
import {authorizationDatabase,seedAccessUser} from './authorization-fixture.mjs';
import {readAccessContext} from '../lib/authorization.ts';
import {catalogLearningData} from '../lib/catalog-learning-data.ts';
import {personalStudioData} from '../lib/studio-data.ts';
import {seedCourse,completeLesson} from '../lib/course-data.ts';
import {enrollCourse} from '../lib/account-data.ts';
import {saveClass} from '../lib/classes.ts';
import {sampleCourse} from '../lib/seed.ts';

test('supporting flows: personal catalog and class agenda on disposable SQLite', async t => {
  const {d,sql}=authorizationDatabase();
  try {
    for(const [id,kind,status] of [['owner','staff','active'],['s1','student','active'],['s2','student','active'],['pending','student','pending'],['staff','staff','active']]) await seedAccessUser(d,id,kind,[],status);
    sql.prepare("INSERT INTO settings(`key`,value) VALUES('owner','owner')").run();
    const actors={};for(const id of ['owner','s1','s2','pending','staff'])actors[id]=await readAccessContext(d,{id});
    const course={...structuredClone(sampleCourse),id:'support-flow',sample:false,lessons:sampleCourse.lessons.slice(0,2).map(l=>({...structuredClone(l),quiz:undefined,exercise:undefined}))};
    await seedCourse(d,course);await enrollCourse(d,actors.s1,course.id);
    await t.test('catalog recognizes only the current learner enrollment and resumes the unfinished lesson',async()=>{
      await completeLesson(d,actors.s1,course.id,course.lessons[0].id);
      const result=await catalogLearningData(d,actors.s1,course.id);
      assert.equal(result.ready,true);assert.deepEqual(result.enrolledCourseIds,[course.id]);
      assert.equal(new URL(result.resumeHref,'https://example.invalid').searchParams.get('lesson'),course.lessons[1].id);
      assert.deepEqual((await catalogLearningData(d,actors.s2,course.id)).enrolledCourseIds,[]);
      assert.equal((await catalogLearningData(d,actors.s2,course.id)).resumeHref,null);
    });
    await t.test('staff, guests and pending learners get no learner catalog state',async()=>{
      for(const actor of [null,actors.owner,actors.staff,actors.pending])assert.deepEqual(await catalogLearningData(d,actor,course.id),{ready:false,enrolledCourseIds:[],resumeHref:null});
    });
    const classId='support-class';
    await saveClass(d,actors.owner,{id:classId,version:0,courseId:course.id,mentorId:null,targetGrantVersion:0,name:'Support class',description:'',capacity:10,status:'active',startsAt:null,endsAt:null});
    sql.prepare("INSERT INTO cohort_members(class_id,user_id,status,created_at) VALUES(?,?,'approved','2026-10-10')").run(classId,'s1');
    sql.prepare("INSERT INTO cohort_sessions(id,class_id,title,kind,starts_at,duration,location,url,version) VALUES('support-session',?,'Tutor class session','online','2099-01-01T00:00:00Z',60,'','https://example.invalid/private-meeting',1)").run(classId);
    await t.test('learning sessions include the authorized class agenda without leaking its meeting to another learner',async()=>{
      const student=await personalStudioData(d,actors.s1,false);
      assert.equal(student.classSessions.length,1);assert.equal(student.classSessions[0].classId,classId);
      assert.equal(student.classSessions[0].url,'https://example.invalid/private-meeting');
      assert.deepEqual((await personalStudioData(d,actors.s2,false)).classSessions,[]);
      sql.prepare("UPDATE cohort_members SET status='removed',authorization_version=authorization_version+1 WHERE user_id='s1'").run();
      assert.deepEqual((await personalStudioData(d,actors.s1,false)).classSessions,[]);
    });
    await t.test('catalog never continues a course after learner enrollment is revoked',async()=>{
      sql.prepare("DELETE FROM enrollments WHERE user_id='s1'").run();
      assert.deepEqual((await catalogLearningData(d,actors.s1,course.id)).enrolledCourseIds,[]);
    });
  } finally {sql.close();}
});
