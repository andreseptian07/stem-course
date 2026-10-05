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
  return course.lessons.slice(0, index).find((l) => {
    const p = progressFor(l, progress);
    return (
      (l.quiz?.mode === "required" && !p?.quizPassed) ||
      (l.exercise?.required && !p?.codePassed)
    );
  });
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
): PublicCourse {
  return {
    ...course,
    lessons: course.lessons.map((l) => {
      const blocker = blockingLesson(course, l.id, progress);
      const { quiz, exercise, ...base } = l;
      return {
        ...base,
        locked: !!blocker,
        blocker: blocker?.title,
        blocks: blocker ? [] : l.blocks,
        quiz:
          !blocker && quiz
            ? {
                ...quiz,
                questions: quiz.questions.map(
                  ({ correct, explanation, ...q }) => q,
                ),
              }
            : undefined,
        exercise:
          !blocker && exercise
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
