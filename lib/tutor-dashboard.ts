import type { PlatformDatabase } from "./database.ts";
import { courseTitleSql, upcomingSessionSql } from "./database-sql.ts";
import type { ClassUser } from "./classes.ts";

export type TeachingClass = {
  id: string;
  name: string;
  courseTitle: string;
  status: "open" | "active";
  studentCount: number;
  pendingCount: number;
};
export type TeachingReview = {
  id: string;
  classId: string;
  className: string;
  taskId: string;
  taskTitle: string;
  studentName: string;
  attempt: number;
  submittedAt: string;
  late: boolean;
};
export type TeachingSession = {
  id: string;
  classId: string;
  className: string;
  title: string;
  kind: "online" | "offline";
  startsAt: string;
  duration: number;
};
export type TutorDashboard = {
  classes: TeachingClass[];
  reviews: TeachingReview[];
  pendingCount: number;
  sessions: TeachingSession[];
};

// Match review eligibility: latest submitted attempt, approved membership,
// and a non-archived class. Closed tasks can still be reviewed.
export const pendingReviewSql = `s.status='submitted'
  AND s.attempt=(SELECT max(latest.attempt) FROM project_submissions latest WHERE latest.assignment_id=s.assignment_id AND latest.student_id=s.student_id)
  AND EXISTS(SELECT 1 FROM cohort_members m WHERE m.class_id=a.class_id AND m.user_id=s.student_id AND m.status='approved')`;

export async function tutorDashboard(
  d: PlatformDatabase,
  u: ClassUser,
  now = new Date().toISOString(),
): Promise<TutorDashboard | null> {
  // Assignment is authoritative, including legacy mentors with a student role.
  // A tutor role alone never grants access to somebody else's class.
  const scope = "c.status!='archived' AND (?='owner' OR c.mentor_id=?)";
  const classes = (await d.prepare(`SELECT c.id,c.name,c.status,${courseTitleSql(d, "k.data")} AS courseTitle,
    (SELECT count(*) FROM cohort_members m WHERE m.class_id=c.id AND m.status='approved') AS studentCount,
    (SELECT count(*) FROM project_submissions s JOIN class_assignments a ON a.id=s.assignment_id WHERE a.class_id=c.id AND ${pendingReviewSql}) AS pendingCount
    FROM cohorts c JOIN courses k ON k.id=c.course_id WHERE ${scope} ORDER BY c.name,c.id`)
    .bind(u.role, u.id).all<TeachingClass>()).results.map((c) => ({
      ...c, studentCount: Number(c.studentCount), pendingCount: Number(c.pendingCount),
    }));
  if (!classes.length && u.role !== "tutor" && u.role !== "owner") return null;

  const reviews = (await d.prepare(`SELECT s.id,c.id AS classId,c.name AS className,a.id AS taskId,a.title AS taskTitle,n.name AS studentName,s.attempt,s.submitted_at AS submittedAt,s.late
    FROM project_submissions s JOIN class_assignments a ON a.id=s.assignment_id JOIN cohorts c ON c.id=a.class_id JOIN users n ON n.id=s.student_id
    WHERE ${scope} AND ${pendingReviewSql} ORDER BY s.submitted_at,s.id LIMIT 50`)
    .bind(u.role, u.id).all<Omit<TeachingReview, "late"> & { late: number }>()).results
    .map((r) => ({ ...r, late: !!r.late }));
  const sessions = (await d.prepare(`SELECT s.id,c.id AS classId,c.name AS className,s.title,s.kind,s.starts_at AS startsAt,s.duration
    FROM cohort_sessions s JOIN cohorts c ON c.id=s.class_id
    WHERE ${scope} AND ${upcomingSessionSql(d)} ORDER BY s.starts_at,s.id`)
    .bind(u.role, u.id, now).all<TeachingSession>()).results;
  return { classes, reviews, pendingCount: classes.reduce((sum, c) => sum + c.pendingCount, 0), sessions };
}
