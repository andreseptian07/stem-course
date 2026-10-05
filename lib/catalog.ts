import type { Course } from "./model";
export function catalogCourse(c: Course) {
  return {
    id: c.id,
    title: c.title,
    description: c.description,
    category: c.category,
    level: c.level,
    sample: c.sample,
    overview: c.overview || {
      outcomes: [],
      requirements: [],
      audience: "",
      mentorName: "",
      mentorBio: "",
      format: "self_paced" as const,
    },
    minutes: c.lessons.reduce((sum, l) => sum + l.minutes, 0),
    lessonCount: c.lessons.length,
    quizzes: c.lessons.filter((l) => l.quiz).length,
    exercises: c.lessons.filter((l) => l.exercise).length,
    curriculum: c.lessons.map((l) => ({
      id: l.id,
      module: l.module,
      title: l.title,
      minutes: l.minutes,
      quiz: !!l.quiz,
      required: l.quiz?.mode === "required" || !!l.exercise?.required,
      coding: !!l.exercise,
    })),
  };
}
export type CatalogCourse = ReturnType<typeof catalogCourse>;
export type CatalogSession = {
  id: string;
  courseId: string;
  title: string;
  kind: "online" | "offline";
  startsAt: string;
  duration: number;
  capacity: number;
  count: number;
  location: string;
};
export type CatalogState = {
  courses: CatalogCourse[];
  sessions: CatalogSession[];
  user: { name: string; role: string } | null;
};
