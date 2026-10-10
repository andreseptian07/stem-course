import type { PlatformDatabase } from "./database.ts";
import type { AccessContext } from "./authorization.ts";
import { authorizationGuard } from "./authorization.ts";
import { AccessError } from "./access-error.ts";
import { learningCourseRows } from "./course-data.ts";
import { learningReadSnapshot, assertLearningRead } from "./learning-access.ts";
import { loadGraduationContext, assertAcademicRead } from "./graduation-data.ts";
import { dashboardCourse } from "./account.ts";

// Only enrollment and a safe destination are projected into the public catalog.
export async function catalogLearningData(d: PlatformDatabase, user: AccessContext | null, selectedCourse?: string) {
  const empty = { ready: false, enrolledCourseIds: [] as string[], resumeHref: null as string | null };
  if (!user || user.kind !== "student" || user.owner || user.accessStatus !== "active") return empty;
  let guard;
  try { guard = await authorizationGuard(d, user, "student"); }
  catch (error) { if (error instanceof AccessError && error.status === 403) return empty; throw error; }
  const before = await learningReadSnapshot(d, user);
  const rows = await learningCourseRows(d, user);
  const enrolledCourseIds = rows.map(row => String(JSON.parse(row.data).id));
  let resumeHref: string | null = null;
  if (selectedCourse && enrolledCourseIds.includes(selectedCourse)) {
    const ctx = await loadGraduationContext(d, user, selectedCourse);
    const course = dashboardCourse(ctx.course, ctx.progress, null, ctx.state);
    const query = new URLSearchParams({ course: selectedCourse });
    if (course.classId) query.set("class", course.classId);
    if (course.resumeLesson) query.set("lesson", course.resumeLesson);
    resumeHref = "/learn?" + query.toString();
    await assertAcademicRead(d, ctx);
  }
  await assertLearningRead(d, user, before, enrolledCourseIds);
  if (!await d.prepare(`SELECT 1 WHERE ${guard.sql}`).bind(...guard.binds).first()) throw new AccessError(403, "Hak akun berubah. Muat ulang katalog.");
  return { ready: true, enrolledCourseIds, resumeHref };
}
