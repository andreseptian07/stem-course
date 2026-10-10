import {courseReviewThreshold} from "./grading-policy.ts";
import type { Course, Progress, GraduationState, GraduationBlocker } from "./model.ts";

export type ReviewEvidence = {
  requirementId: string; lessonId: string; requirementRevision: number;
  assignmentId: string; assignmentStatus: string; assignmentRevision: number; assignmentVersion: number;
  bindingVersion: number; submissionId: string | null; submissionVersion: number | null;
  submissionRevision: number | null; lessonRevision: number | null;
  submissionRequirementRevision: number | null;
  status: string | null; score: number | null; reviewedAt: string | null;
  reviewerId: string | null; reviewId: string | null; reviewSequence: number | null;
};
// Completion is the final learner confirmation. Do not require complete itself,
// which would make the button impossible to enable on a new lesson.
export function canConfirmLessonCompletion(lesson: GraduationState["lessons"][number] | undefined): boolean {
  return !!lesson && lesson.unlocked && lesson.platform.quizPassed && lesson.platform.codePassed &&
    lesson.requiredReviews.every(review => review.passed) &&
    lesson.blockers.every(blocker => blocker.code === "ACTIVITY_INCOMPLETE");
}
export function evaluateGraduation(input: {
  course: Course; progress: Progress[]; reviews: ReviewEvidence[];
  classId: string | null; className?: string | null;
  classes?: { id: string; name: string }[]; problem?: GraduationBlocker | null;
}): GraduationState {
  const {course,progress,reviews}=input;
  const minimumScore=courseReviewThreshold(course);
  const problem=input.problem ?? (course.graduationPolicyVersion!==2 || course.policyState!=="ready" || !Number.isFinite(minimumScore)
    ? {code:"GRADUATION_CONFIG_REQUIRED",message:"Pengelola perlu menyiapkan aturan kelulusan course ini."} : course.learningMode==="class_required"&&!input.classId?{code:"CLASS_CONTEXT_REQUIRED",message:"Pilih kelas yang disetujui untuk melanjutkan course ini."}:null);
  let previousPassed=!problem;
  const lessons=course.lessons.map(l=>{
    const p=progress.find(p=>p.lessonId===l.id&&p.revision===l.revision);
    const platform={complete:p?.complete===1,quizPassed:l.quiz?.mode!=="required"||p?.quizPassed===1,codePassed:!l.exercise?.required||p?.codePassed===1};
    const blockers:GraduationBlocker[]=[];
    if(problem)blockers.push(problem);
    if(!previousPassed&&!problem)blockers.push({code:"PREREQUISITE_NOT_MET",message:"Selesaikan materi sebelumnya pada kelas ini.",lessonId:l.id});
    if(!platform.complete)blockers.push({code:"ACTIVITY_INCOMPLETE",message:"Tandai kegiatan materi ini selesai.",lessonId:l.id});
    if(!platform.quizPassed)blockers.push({code:"QUIZ_NOT_PASSED",message:`Lulus kuis dengan nilai minimal ${l.quiz!.threshold}.`,lessonId:l.id});
    if(!platform.codePassed)blockers.push({code:"CODE_NOT_PASSED",message:"Lulus pemeriksaan kode resmi.",lessonId:l.id});
    const requiredReviews=(l.reviewRequirements||[]).map(r=>{
      const e=reviews.find(e=>e.requirementId===r.id&&e.lessonId===l.id);
      const configured=!!input.classId&&!!e&&e.requirementRevision===r.revision&&["published","closed"].includes(e.assignmentStatus);
      const current=configured&&!!e.submissionId&&e.submissionRevision===e.assignmentRevision&&e.lessonRevision===l.revision&&e.submissionRequirementRevision===r.revision;
      const passed=!!current&&e!.status==="accepted"&&e!.score!==null&&Number.isInteger(e!.score)&&e!.score>=minimumScore&&e!.score<=100&&!!e!.reviewerId&&!!e!.reviewedAt&&!!e!.reviewId;
      const status=!configured?"configuration_required":!e!.submissionId?"not_submitted":!current?"stale":e!.status||"submitted";
      if(!passed)blockers.push({code:!configured?"GRADUATION_CONFIG_REQUIRED":status==="stale"?"ASSESSMENT_CHANGED":status==="not_submitted"?"PROJECT_NOT_SUBMITTED":status==="submitted"?"REVIEW_PENDING":"REVIEW_NOT_PASSED",message:!configured?`Tugas wajib “${r.title}” sedang disiapkan pengelola.`:status==="stale"?`Kerjakan ulang “${r.title}” sesuai revisi terbaru.`:status==="not_submitted"?`Kirim tugas “${r.title}”.`:status==="submitted"?`Menunggu review Tutor untuk “${r.title}”.`:`“${r.title}” memerlukan nilai minimal ${minimumScore} dan status Diterima.`,lessonId:l.id,assignmentId:e?.assignmentId});
      return {id:r.id,title:r.title,assignmentId:e?.assignmentId||null,status,score:e?.score??null,minimumScore,passed};
    });
    const unlocked=previousPassed;
    const stagePassed=unlocked&&platform.complete&&platform.quizPassed&&platform.codePassed&&requiredReviews.every(r=>r.passed);
    previousPassed=stagePassed;
    return {lessonId:l.id,unlocked,stagePassed,platform,requiredReviews,blockers};
  });
  return {classId:input.classId,className:input.className||null,classes:input.classes||[],problem,lessons,passed:!!lessons.length&&lessons.every(l=>l.stagePassed)};
}
