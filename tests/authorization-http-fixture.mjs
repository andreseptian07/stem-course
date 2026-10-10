import {registerAccount,createOwner} from '../lib/auth-data.ts';
import {registerIdentity,updateAccess} from '../lib/access.ts';
import {changePermission} from '../lib/authorization.ts';
import {sampleCourse} from '../lib/seed.ts';
import {saveCourse} from '../lib/course-data.ts';
import {saveClass,setMembership,saveClassSession} from '../lib/classes.ts';
import {saveAssignment} from '../lib/projects.ts';
import {mutateCurriculum} from '../lib/curriculum.ts';
export const fixturePassword='CI-authorization-test-only-passphrase';
export async function seedAuthorizationHttp(d){
 const made=await createOwner(d,{email:'owner@permissions.ci.example',displayName:'Owner UAT Hak Akses',password:fixturePassword});
 const owner=await registerIdentity(d,{userId:made.userId,displayName:'Owner UAT Hak Akses'},false),users={O:owner},credentials={O:{email:'owner@permissions.ci.example',password:fixturePassword}};
 const courses={};for(const key of ['C1','C2','C3'])courses[key]=await saveCourse(d,owner,{...structuredClone(sampleCourse),id:'permission-'+key.toLowerCase(),version:0,title:'UAT '+key,published:key!=='C3',sample:false});
 for(const [alias,caps,state] of [['S1',[],'active'],['S2',[],'active'],['TA',['tutor'],'active'],['TB',['tutor'],'active'],['Q1',['curriculum'],'active'],['Q2',['curriculum'],'active'],['TQ',['tutor','curriculum'],'active'],['F0',['tutor'],'active'],['P',[],'pending'],['X',['tutor'],'suspended'],['M',[],'active']]){
  const email=alias.toLowerCase()+'@permissions.ci.example';await registerAccount(d,{email,displayName:alias+' UAT',password:fixturePassword,courseId:courses.C1.id},true);
  const row=await d.prepare('SELECT user_id FROM auth_credentials WHERE email=?').bind(email).first();let u=await registerIdentity(d,{userId:row.user_id,displayName:alias+' UAT'},false);
  if(state!=='pending'){await updateAccess(d,owner,{userId:u.id,version:1,status:'active',reason:'Disposable HTTP fixture'});u=await registerIdentity(d,{userId:u.id,displayName:alias+' UAT'},false);}
  for(const cap of caps){await changePermission(d,owner,{action:u.kind==='student'?'makeStaff':'setGrant',targetId:u.id,capability:cap,principalVersion:u.principalVersion,grantVersion:u.grantVersions[cap],reason:'Disposable HTTP fixture',...(u.kind==='staff'?{active:true}:{})});u=await registerIdentity(d,{userId:u.id,displayName:alias+' UAT'},false);}
  if(alias==='F0'){await changePermission(d,owner,{action:'setGrant',targetId:u.id,capability:'tutor',active:false,principalVersion:u.principalVersion,grantVersion:u.grantVersions.tutor,reason:'Disposable staff without grant'});u=await registerIdentity(d,{userId:u.id,displayName:alias+' UAT'},false);}
  if(state==='suspended'){await updateAccess(d,owner,{userId:u.id,version:u.accessVersion,status:'suspended',reason:'Disposable restricted fixture'});u=await registerIdentity(d,{userId:u.id,displayName:alias+' UAT'},false);}
  if(alias==='M'){await d.prepare("UPDATE account_principals SET kind='unclassified',version=version+1 WHERE user_id=?").bind(u.id).run();u=await registerIdentity(d,{userId:u.id,displayName:alias+' UAT'},false);}
  users[alias]=u;credentials[alias]={email,password:fixturePassword};
 }
 const classes={};for(const [key,course,mentor,state] of [['K1','C1','TA','active'],['K2','C1','TB','active'],['K3','C2','TB','open'],['K4','C1','TA','archived'],['K5','C1','TQ','active']]){
  classes[key]='permission-'+key.toLowerCase();await saveClass(d,owner,{id:classes[key],courseId:courses[course].id,mentorId:users[mentor].id,targetGrantVersion:users[mentor].grantVersions.tutor,version:0,name:'PRIVATE '+key,description:'PRIVATE-DESCRIPTION-'+key,capacity:10,status:state,startsAt:null,endsAt:null});
  if(state!=='archived')await saveClassSession(d,owner,{id:'permission-session-'+key,classId:classes[key],version:0,title:'PRIVATE-SESSION-'+key,kind:'online',startsAt:'2099-01-01T00:00:00Z',duration:60,location:'',url:'https://example.invalid/PRIVATE-'+key});
 }
 for(const [alias,key] of [['S1','K1'],['S2','K2'],['S2','K3']])await setMembership(d,owner,classes[key],users[alias].id,'approved');
 for(const [alias,course] of [['Q1','C1'],['Q2','C2'],['TQ','C2']])await mutateCurriculum(d,owner,{action:'member',courseId:courses[course].id,userId:users[alias].id,version:0,active:true,targetGrantVersion:users[alias].grantVersions.curriculum});
 const tasks={};for(const key of ['K1','K2','K5']){tasks[key]='permission-task-'+key;await saveAssignment(d,owner,{id:tasks[key],classId:classes[key],version:0,title:'PRIVATE-TASK-'+key,instructions:'PRIVATE-INSTRUCTION-'+key,status:'published',dueAt:null});}
 for(const alias of ['O','TA','Q1','TQ','F0'])await d.prepare("INSERT INTO cohort_members(class_id,user_id,status,created_at) VALUES(?,?,'approved','2026-10-09')").bind(classes.K1,users[alias].id).run();
 return {users,credentials,courses,classes,tasks};
}
