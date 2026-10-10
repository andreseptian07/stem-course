import {evaluateGraduation} from "./graduation.ts";
import type {GraduationState} from "./model.ts";
import type { MediaInfo } from "./media-model.ts";
import { z } from "zod";
import type { DashboardProject } from "./projects";
import type { TutorDashboard } from "./tutor-dashboard";
import type { Course, Progress } from "./model";
import { catalogCourse } from "./catalog.ts";

export const profileSchema = z
  .object({
    version: z.number().int().nonnegative(),
    displayName: z
      .string()
      .trim()
      .min(1, "Nama tampilan wajib diisi.")
      .max(100),
    bio: z.string().trim().max(1000),
    institution: z.string().trim().max(160),
    interests: z
      .array(
        z.enum([
          "Sains",
          "Matematika",
          "Coding",
          "Cyber Security",
          "Embedded Systems",
          "Digital Signal Processing",
        ]),
      )
      .max(6)
      .refine(
        (a) => new Set(a).size === a.length,
        "Minat tidak boleh berulang.",
      ),
    goal: z.string().trim().max(1500),
    avatarColor: z.enum(["teal", "blue", "violet"]),
  })
  .strict();
export type Profile = z.infer<typeof profileSchema>;
export function emptyProfile(name: string): Profile {
  return {
    version: 0,
    displayName: name,
    bio: "",
    institution: "",
    interests: [],
    goal: "",
    avatarColor: "teal",
  };
}
export function dashboardCourse(
  c: Course,
  progress: Progress[],
  enrolledAt: string | null,
  graduation?:GraduationState,
  perClass:GraduationState[] = [],
) {
  const academic=graduation||evaluateGraduation({course:c,progress,reviews:[],classId:null});
  const classResults=perClass.map(state=>({classId:state.classId,className:state.className,completed:state.lessons.filter(l=>l.stagePassed).length,total:c.lessons.length,finished:state.passed}));
  const completed=classResults.length?Math.min(...classResults.map(state=>state.completed)):academic.lessons.filter(l=>l.stagePassed).length;
  const stale = c.lessons.filter((l) =>
    !progress.some(p=>p.lessonId===l.id&&p.revision===l.revision)&&progress.some((p) => p.lessonId === l.id && p.revision !== l.revision),
  ).length;
  const unfinished = c.lessons.find((l) => !academic.lessons.find(p=>p.lessonId===l.id)?.stagePassed);
  const resume = unfinished
    ? unfinished
    : c.lessons.at(-1);
  return {
    ...catalogCourse(c),
    completed,
    stale,
    percent: c.lessons.length
      ? Math.round((completed / c.lessons.length) * 100)
      : 0,
    enrolledAt,
    classId:academic.classId,
    graduation:academic,
    classResults,
    resumeLesson: resume?.id || null,
    finished: !!c.lessons.length && completed === c.lessons.length,
  };
}
export type DashboardCourse = ReturnType<typeof dashboardCourse>;
export type AccountSession = {
  id: string;
  classId?: string;
  className?: string;
  courseId: string;
  courseTitle: string;
  title: string;
  kind: "online" | "offline";
  startsAt: string;
  duration: number;
  location: string;
  url: string;
};
export type AccountState = {
  user: import("./authorization").AccessContext & {email:string};
  profile: Profile;
  photo: MediaInfo | null;
  courses: DashboardCourse[];
  sessions: AccountSession[];
  projects: DashboardProject[];
  teaching: TutorDashboard | null;
  curriculum?: boolean;
};
