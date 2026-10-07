import type { MediaInfo } from "./media-model.ts";
import { z } from "zod";
import type { DashboardProject } from "./projects";
import type { TutorDashboard } from "./tutor-dashboard";
import type { Course, Progress } from "./model";
import { catalogCourse } from "./catalog.ts";
import { blockingLesson, progressFor } from "./rules.ts";
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
) {
  const completed = c.lessons.filter(
    (l) => progressFor(l, progress)?.complete,
  ).length;
  const stale = c.lessons.filter((l) =>
    progress.some((p) => p.lessonId === l.id && p.revision !== l.revision),
  ).length;
  const unfinished = c.lessons.find((l) => !progressFor(l, progress)?.complete);
  const resume = unfinished
    ? blockingLesson(c, unfinished.id, progress) || unfinished
    : c.lessons.at(-1);
  return {
    ...catalogCourse(c),
    completed,
    stale,
    percent: c.lessons.length
      ? Math.round((completed / c.lessons.length) * 100)
      : 0,
    enrolledAt,
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
  user: { id: string; name: string; role: string; email: string };
  profile: Profile;
  photo: MediaInfo | null;
  courses: DashboardCourse[];
  sessions: AccountSession[];
  projects: DashboardProject[];
  teaching: TutorDashboard | null;
};
