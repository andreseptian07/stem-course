import {evaluateGraduation} from "./graduation.ts";
import {courseReviewThreshold} from "./grading-policy.ts";
import type {GraduationState} from "./model.ts";
import type { Course, Lesson, Progress, PublicCourse, Quiz } from "./model";
export function progressFor(lesson: Lesson, progress: Progress[]) {
  return progress.find(
    (p) => p.lessonId === lesson.id && p.revision === lesson.revision,
  );
}
export function blockingLesson(
  course: Course,
  lessonId: string,
  progress: Progress[],
) {
  const index = course.lessons.findIndex((l) => l.id === lessonId);
  if (index < 0) throw new Error("Materi tidak ditemukan.");
  const result=evaluateGraduation({course,progress,reviews:[],classId:null});
  return course.lessons.slice(0,index).find(l=>!result.lessons.find(s=>s.lessonId===l.id)?.stagePassed);
}
export function gradeQuiz(quiz: Quiz, answers: Record<string, number[]>) {
  const results = quiz.questions.map((q) => {
    const answer = answers[q.id] || [];
    return {
      id: q.id,
      correct:
        answer.length === q.correct.length &&
        new Set(answer).size === answer.length &&
        answer.every((a) => q.correct.includes(a)),
    };
  });
  const score = Math.round(
    (results.filter((r) => r.correct).length / results.length) * 100,
  );
  const passed = score >= quiz.threshold;
  const reveal =
    quiz.feedback === "always" || (quiz.feedback === "after_pass" && passed);
  return {
    score,
    passed,
    feedback: reveal
      ? results.map((r) => ({
          ...r,
          explanation: quiz.questions.find((q) => q.id === r.id)!.explanation,
        }))
      : [],
  };
}
export function canComplete(lesson: Lesson, p: Progress | undefined) {
  return (
    !(lesson.quiz?.mode === "required" && !p?.quizPassed) &&
    !(lesson.exercise?.required && !p?.codePassed)
  );
}
export function publicCourse(
  course: Course,
  progress: Progress[],
  graduation?:GraduationState,
): PublicCourse {
  const state=graduation||evaluateGraduation({course,progress,reviews:[],classId:null});
  return {
    id:course.id,version:course.version,title:course.title,description:course.description,category:course.category,level:course.level,published:course.published,sample:course.sample,certificateEnabled:course.certificateEnabled,reviewPassThreshold:courseReviewThreshold(course),overview:course.overview,graduation:state,
    lessons: course.lessons.map((l) => {
      const status=state.lessons.find(s=>s.lessonId===l.id)!;
      const blocker=status.unlocked?undefined:status.blockers[0];
      const { quiz, exercise } = l;
      const base={id:l.id,revision:l.revision,module:l.module,title:l.title,minutes:l.minutes};
      return {
        ...base,
        locked: !status.unlocked,
        blocker: blocker?.message,
        graduation:status,
        blocks: status.unlocked ? l.blocks : [],
        quiz:
          status.unlocked && quiz
            ? {
                ...quiz,
                questions: quiz.questions.map(
                  q => ({id:q.id,prompt:q.prompt,options:q.options}),
                ),
              }
            : undefined,
        exercise:
          status.unlocked && exercise
            ? {
                ...exercise,
                tests: exercise.tests.filter((t) => !t.hidden),
                hiddenCount: exercise.tests.filter((t) => t.hidden).length,
              }
            : undefined,
      };
    }),
  };
}
export function safeHttps(value: string) {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}
