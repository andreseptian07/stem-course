import {courseReviewThreshold} from "./grading-policy.ts";
import type { Course, Lesson } from "./model.ts";
import { AccessError } from "./access-error.ts";
const stable=(value:unknown):string=>{
  if(Array.isArray(value))return JSON.stringify(value.map(v=>JSON.parse(stable(v))));
  if(value&&typeof value==="object")return JSON.stringify(Object.fromEntries(Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,JSON.parse(stable(v))])));
  return JSON.stringify(value??null);
};
export function assessmentShape(l:Lesson){return {
  quiz:l.quiz?{mode:l.quiz.mode,threshold:l.quiz.threshold,questions:l.quiz.questions.map(q=>({id:q.id,prompt:q.prompt,options:q.options,correct:q.correct}))}:null,
  exercise:l.exercise?{language:l.exercise.language,prompt:l.exercise.prompt,starter:l.exercise.starter,required:l.exercise.required,tests:l.exercise.tests}:null,
  reviews:(l.reviewRequirements||[]).map(r=>({id:r.id,title:r.title,instructions:r.instructions,rubric:r.rubric})),
};}
const substantiveShape=(l:Lesson)=>({
  ...l,title:undefined,minutes:undefined,module:undefined,revision:undefined,contentRevision:undefined,change:undefined,
  quiz:l.quiz?{...l.quiz,maxAttempts:undefined,feedback:undefined,questions:l.quiz.questions.map(q=>({...q,explanation:undefined}))}:undefined,
  exercise:l.exercise?{...l.exercise,maxAttempts:undefined}:undefined,
});
const contentShape=(l:Lesson)=>{const {revision,contentRevision,change,...rest}=l;void revision;void contentRevision;void change;return rest;};
export function planCoursePublication(next:Course,previous?:Course):Course {
  const retiredLessonIds=[...new Set([...(previous?.retiredLessonIds||[]),...(previous?.lessons.filter(l=>!next.lessons.some(n=>n.id===l.id)).map(l=>l.id)||[])])];
  const currentRequirements=new Set(next.lessons.flatMap(l=>(l.reviewRequirements||[]).map(r=>r.id)));
  const retiredRequirementIds=[...new Set([...(previous?.retiredRequirementIds||[]),...(previous?.lessons.flatMap(l=>(l.reviewRequirements||[]).filter(r=>!currentRequirements.has(r.id)).map(r=>r.id))||[])])];
  if(next.lessons.some(l=>retiredLessonIds.includes(l.id))||[...currentRequirements].some(id=>retiredRequirementIds.includes(id)))throw new AccessError(400,"ID materi atau syarat review yang telah dihapus tidak boleh digunakan kembali.");
  const priorIds=previous?.lessons.map(l=>l.id)||[];
  const policyChanged=previous&&(previous.learningMode!==next.learningMode||stable(previous.overview?.outcomes)!==stable(next.overview?.outcomes));
  const reviewThresholdChanged=!!previous&&courseReviewThreshold(previous)!==courseReviewThreshold(next);
  const lessons=next.lessons.map((l,index)=>{
    const old=previous?.lessons.find(p=>p.id===l.id);
    const changed=!old||stable(contentShape(old))!==stable(contentShape(l));
    const forced=!!old&&(stable(assessmentShape(old))!==stable(assessmentShape(l))||!!policyChanged||(reviewThresholdChanged&&!!l.reviewRequirements?.length)||stable(priorIds.slice(0,priorIds.indexOf(l.id)))!==stable(next.lessons.slice(0,index).map(p=>p.id)));
    const administrative=!!old&&stable(substantiveShape(old))===stable(substantiveShape(l));
    const editorial=changed&&!forced&&!administrative&&l.change?.kind==="editorial";
    if(editorial&&!l.change?.reason.trim())throw new AccessError(400,"Tuliskan alasan perubahan editorial untuk materi tersebut.");
    const substantial=!!old&&(forced||(changed&&!editorial&&!administrative));
    const reviews=(l.reviewRequirements||[]).map(r=>{
      const prior=old?.reviewRequirements?.find(p=>p.id===r.id);
      return {...r,revision:prior?(stable({...prior,revision:0})===stable({...r,revision:0})?prior.revision:prior.revision+1):1};
    });
    const {change,...published}=l;void change;
    return {...published,reviewRequirements:reviews,revision:old?old.revision+(substantial?1:0):1,contentRevision:old?(old.contentRevision||old.revision)+(changed?1:0):1};
  });
  const requirements=lessons.flatMap(l=>l.reviewRequirements||[]);
  if(requirements.length&&next.learningMode==="independent_allowed")throw new AccessError(400,"Course dengan review wajib harus menggunakan kelas.");
  if(next.published)for(const l of lessons){
    if(!l.blocks.some(b=>b.content.trim()&&!/^(materi baru|isi materi|placeholder|todo)$/i.test(b.content.trim()))&&!l.quiz&&!l.exercise&&!(l.reviewRequirements||[]).some(r=>r.instructions.trim()))throw new AccessError(400,`Materi “${l.title}” belum memiliki kegiatan atau isi yang dapat dipelajari.`);
  }
  return {...next,lessons,retiredLessonIds,retiredRequirementIds,graduationPolicyVersion:2,learningMode:next.learningMode||previous?.learningMode||"independent_allowed",policyState:next.policyState||previous?.policyState||(previous?"needs_mapping":"ready")};
}

export function publicationImpact(next:Course,previous?:Course){
  const planned=planCoursePublication(next,previous);
  return {planned,substantial:planned.lessons.filter(l=>previous?.lessons.some(p=>p.id===l.id&&p.revision!==l.revision)).map(l=>({id:l.id,title:l.title})),editorial:planned.lessons.filter(l=>previous?.lessons.some(p=>p.id===l.id&&p.revision===l.revision&&(p.contentRevision||p.revision)!==l.contentRevision)).map(l=>({id:l.id,title:l.title})),removed:previous?.lessons.filter(l=>!planned.lessons.some(n=>n.id===l.id)).map(l=>({id:l.id,title:l.title}))||[]};
}
