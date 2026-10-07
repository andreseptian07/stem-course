import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {PDFDocument} from 'pdf-lib';
import {certificateStatus,issueCertificate,listCertificates,ownedCertificate,verifyCertificate,revokeCertificate} from '../lib/certificates.ts';
import {certificatePdf,validateCertificateText} from '../lib/certificate-pdf.ts';
import {saveCourse,initializeProgress} from '../lib/course-data.ts';
import {saveAssignment,submitProject,reviewProject} from '../lib/projects.ts';
const status=n=>e=>e.status===n;
export async function certificateScenarios(t,d){
 const prefix='cert-'+randomUUID(),now=new Date().toISOString();
 const owner={id:prefix+'-owner',name:'Pengelola Uji',role:'owner'},alice={id:prefix+'-a',name:'Ayu Éléonore',role:'student'},bob={id:prefix+'-b',name:'Peserta Lain',role:'student'};
 const classId=prefix+'-class',emptyClass=prefix+'-empty';
 for(const u of [owner,alice,bob]){
  await d.prepare('INSERT INTO users(id,name,role) VALUES(?,?,?)').bind(u.id,u.name,u.role).run();
  await d.prepare("INSERT INTO user_access(user_id,status,created_at,updated_at) VALUES(?,'active',?,?)").bind(u.id,now,now).run();
 }
 let c=await saveCourse(d,owner,{id:prefix,version:0,title:'Dasar Sensor dan Pengukuran',description:'Fixture sementara',category:'STEM',level:'Pemula',published:true,sample:false,certificateEnabled:true,lessons:[{id:'first',revision:1,module:'Dasar',title:'Pengukuran',minutes:10,blocks:[],quiz:{mode:'required',threshold:80,maxAttempts:0,feedback:'never',questions:[{id:'q',prompt:'Pilih',options:['A','B'],correct:[0],explanation:''}]}},{id:'second',revision:1,module:'Dasar',title:'Kode',minutes:10,blocks:[],exercise:{language:'python',prompt:'Kode',starter:'',required:true,maxAttempts:0,tests:[{input:'',expected:'1',hidden:true}]}}]});
 for(const id of [classId,emptyClass]){
  await d.prepare("INSERT INTO cohorts(id,course_id,mentor_id,name,description,capacity,status,version,created_at) VALUES(?,?,?,'Kelas Uji','',10,'active',1,?)").bind(id,c.id,owner.id,now).run();
  await d.prepare("INSERT INTO cohort_members(class_id,user_id,status,created_at) VALUES(?,?,'approved',?)").bind(id,alice.id,now).run();
 }
 let assignment={id:prefix+'-task',classId,version:0,title:'Praktik sensor',instructions:'Ukur sensor.',dueAt:null,status:'published'};
 await saveAssignment(d,owner,assignment);assignment.version=1;
 let cert;
 await t.test('certificate requires consent, every current lesson, required tests and an approved class',async()=>{
  await assert.rejects(issueCertificate(d,alice,c.id,classId,false),status(400));
  await assert.rejects(issueCertificate(d,alice,c.id,classId,true),status(403));
  for(const l of c.lessons){await initializeProgress(d,alice.id,c.id,l.id,l.revision);await d.prepare('UPDATE progress SET complete=1 WHERE user_id=? AND course_id=? AND lesson_id=?').bind(alice.id,c.id,l.id).run();}
  await assert.rejects(issueCertificate(d,alice,c.id,classId,true),status(403));
  await d.prepare('UPDATE progress SET quiz_passed=1,code_passed=1 WHERE user_id=? AND course_id=?').bind(alice.id,c.id).run();
  await assert.rejects(issueCertificate(d,alice,c.id,emptyClass,true),status(403));
  await assert.rejects(issueCertificate(d,bob,c.id,classId,true),status(403));
  await assert.rejects(issueCertificate(d,alice,c.id,classId,true),status(403));
  const state=await certificateStatus(d,alice,c.id);assert.equal(state.classes.find(c=>c.id===classId).eligible,false);assert.equal(state.lessons.every(l=>l.complete&&l.quizPassed&&l.codePassed),true);
 });
 let submissionId=prefix+'-submission';
 await t.test('latest Tutor acceptance and current instructions are required; closing a task preserves accepted work',async()=>{
  await submitProject(d,alice,{action:'submit',id:submissionId,assignmentId:assignment.id,assignmentVersion:1,previousId:null,previousVersion:0,body:'Hasil ukur',url:''});
  await assert.rejects(issueCertificate(d,alice,c.id,classId,true),status(403));
  await reviewProject(d,owner,{action:'review',submissionId,version:1,status:'changes_requested',feedback:'Perbaiki.',score:null});
  await assert.rejects(issueCertificate(d,alice,c.id,classId,true),status(403));
  const first=await d.prepare('SELECT version FROM project_submissions WHERE id=?').bind(submissionId).first();
  const secondId=prefix+'-second';await submitProject(d,alice,{action:'submit',id:secondId,assignmentId:assignment.id,assignmentVersion:1,previousId:submissionId,previousVersion:first.version,body:'Hasil perbaikan',url:''});submissionId=secondId;
  await reviewProject(d,owner,{action:'review',submissionId,version:1,status:'accepted',feedback:'Diterima.',score:95});
  const draft={...assignment,id:prefix+'-draft',version:0,status:'draft'};await saveAssignment(d,owner,draft);
  assignment={...assignment,status:'closed'};await saveAssignment(d,owner,assignment);assignment.version=2;
  assert.equal((await certificateStatus(d,alice,c.id)).classes.find(c=>c.id===classId).eligible,true);
  await saveAssignment(d,owner,{...assignment,instructions:'Instruksi diubah.'});assignment={...assignment,version:3,instructions:'Instruksi diubah.'};
  await assert.rejects(issueCertificate(d,alice,c.id,classId,true),status(403));
  await saveAssignment(d,owner,{...assignment,instructions:'Ukur sensor.'});assignment={...assignment,version:4,instructions:'Ukur sensor.'};
 });
 await t.test('issuance rechecks races on task set, membership, progress and course version',async()=>{
  for(const mutation of [
    ()=>d.prepare("UPDATE cohort_members SET status='removed' WHERE class_id=? AND user_id=?").bind(classId,alice.id).run(),
    ()=>d.prepare('UPDATE progress SET complete=0 WHERE user_id=? AND course_id=?').bind(alice.id,c.id).run(),
    ()=>d.prepare('UPDATE courses SET version=version+1 WHERE id=?').bind(c.id).run(),
    ()=>d.prepare("UPDATE class_assignments SET status='published' WHERE id=?").bind(prefix+'-draft').run(),
  ]) {
    let changed=false;
    const raced={...d,prepare(sql){const stmt=d.prepare(sql);if(!sql.includes('INTO certificates('))return stmt;return {bind(...args){const bound=stmt.bind(...args);return {async run(){if(!changed){changed=true;await mutation();}return bound.run();}};}};}};
    await assert.rejects(issueCertificate(raced,alice,c.id,classId,true),status(409));
    await d.prepare("UPDATE cohort_members SET status='approved' WHERE class_id=? AND user_id=?").bind(classId,alice.id).run();
    await d.prepare('UPDATE progress SET complete=1 WHERE user_id=? AND course_id=?').bind(alice.id,c.id).run();
    await d.prepare('UPDATE courses SET version=? WHERE id=?').bind(c.version,c.id).run();
    await d.prepare("UPDATE class_assignments SET status='draft' WHERE id=?").bind(prefix+'-draft').run();
  }
  assert.equal((await listCertificates(d,alice)).length,0);
 });
 await t.test('duplicate requests retain one immutable certificate; verification exposes only opted-in fields',async()=>{
  const issued=await Promise.all([issueCertificate(d,alice,c.id,classId,true),issueCertificate(d,alice,c.id,classId,true)]);
  assert.equal(issued[0].number,issued[1].number);cert=issued[0];assert.equal((await listCertificates(d,alice)).length,1);assert.equal((await listCertificates(d,bob)).length,0);
  await assert.rejects(ownedCertificate(d,bob,cert.number),status(404));await assert.rejects(listCertificates(d,alice,true),status(403));
  const publicData=await verifyCertificate(d,cert.number);assert.equal(publicData.status,'valid');assert.equal(publicData.recipientName,alice.name);
  assert.deepEqual(Object.keys(publicData).sort(),['number','status','recipientName','courseTitle','courseVersion','issuedAt'].sort());
  assert.equal(await verifyCertificate(d,'RS-invalid'),null);
  const evidence=JSON.parse((await d.prepare('SELECT evidence FROM certificates WHERE number=?').bind(cert.number).first()).evidence);assert.equal(evidence.tasks[0].submissionId,submissionId);assert.equal(evidence.lessons.length,2);
  c=await saveCourse(d,owner,{...c,title:'Course versi baru',lessons:c.lessons.map(l=>({...l,title:l.title+' revisi'}))});
  await d.prepare('UPDATE users SET name=? WHERE id=?').bind('Nama berubah',alice.id).run();
  assert.equal((await ownedCertificate(d,alice,cert.number)).courseTitle,'Dasar Sensor dan Pengukuran');assert.equal((await ownedCertificate(d,alice,cert.number)).recipientName,'Ayu Éléonore');
  assert.equal((await certificateStatus(d,alice,c.id)).classes.find(c=>c.id===classId).eligible,false);
  assert.equal((await issueCertificate(d,alice,c.id,classId,true)).number,cert.number);
  await d.prepare("UPDATE cohorts SET status='archived' WHERE id=?").bind(classId).run();assert.equal((await ownedCertificate(d,alice,cert.number)).number,cert.number);
 });
 await t.test('PDF embeds a Unicode font, contains one landscape page and the verification URI',async()=>{
  const bytes=await certificatePdf(cert,'https://ruangstem.example');assert.equal(Buffer.from(bytes).subarray(0,5).toString(),'%PDF-');
  const pdf=await PDFDocument.load(bytes);assert.equal(pdf.getPageCount(),1);assert.deepEqual(pdf.getPage(0).getSize(),{width:842,height:595});assert.equal(pdf.getAuthor(),'Ruang STEM');
  assert.ok(pdf.getPage(0).node.toString().includes('/Annots'));
  await validateCertificateText('Éléonore Ελληνικά Кирилл');await assert.rejects(validateCertificateText('Emoji 🛰️'),status(422));
 });
 await t.test('revocation requires active Super Admin, hides public personal fields and prevents regeneration',async()=>{
  await assert.rejects(revokeCertificate(d,alice,cert.number,'Private reason'),status(403));
  await assert.rejects(revokeCertificate(d,{...bob,role:'owner'},cert.number,'Spoof'),status(409));
  await revokeCertificate(d,owner,cert.number,'Alasan privat audit');
  await assert.rejects(ownedCertificate(d,alice,cert.number),status(410));await assert.rejects(issueCertificate(d,alice,c.id,classId,true),status(409));
  const revoked=await verifyCertificate(d,cert.number);assert.equal(revoked.status,'revoked');assert.equal(JSON.stringify(revoked).includes(alice.name),false);assert.equal(JSON.stringify(revoked).includes('Alasan privat'),false);
  await assert.rejects(revokeCertificate(d,owner,cert.number,'Again'),status(409));
  await d.prepare("UPDATE user_access SET status='suspended' WHERE user_id=?").bind(alice.id).run();await assert.rejects(certificateStatus(d,alice,c.id),status(403));
 });
 await t.test('certificates are opt-in and cannot be issued for sample or unpublished courses',async()=>{
  for(const policy of [{certificateEnabled:false},{sample:true},{published:false}]){
   c=await saveCourse(d,owner,{...c,...policy});
   await assert.rejects(issueCertificate(d,owner,c.id,classId,true),status(403));
   c=await saveCourse(d,owner,{...c,certificateEnabled:true,sample:false,published:true});
  }
  const old={...c};delete old.certificateEnabled;c=await saveCourse(d,owner,old);assert.equal(c.certificateEnabled,false);
 });
}
