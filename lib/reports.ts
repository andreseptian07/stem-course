import type { PlatformDatabase } from './database.ts';
import { AccessError } from './access.ts';
import { pendingReviewSql } from './tutor-dashboard.ts';
import { canComplete, progressFor } from './rules.ts';
import type { Course, Progress } from './model';
import type { ManagementReport, ReportCourse, ReportDays, ReportLearner, ReportTutor } from './report-model.ts';
type User = {
  id: string;
  role: string;
};
type Options = {
  courseId?: string;
  days?: ReportDays;
  includeSamples?: boolean;
};
const participantLimit = 5000;
export async function managementReport(d: PlatformDatabase, u: User, options: Options = {}, now = new Date().toISOString()): Promise<ManagementReport> {
  if (u.role !== 'owner')
    throw new AccessError(403, 'Laporan pengelola hanya untuk Super Admin.');
  const days = options.days ?? 30;
  if (![7, 30, 90].includes(days) || !Number.isFinite(Date.parse(now)))
    throw new AccessError(400, 'Periode laporan tidak valid.');
  const generatedAt = new Date(now).toISOString(), periodStart = new Date(Date.parse(generatedAt) - days * 86400000).toISOString();
  const rows = (await d.prepare(`SELECT id,data,version FROM courses ${options.courseId ? 'WHERE id=?' : ''} ORDER BY id LIMIT 501`).bind(...(options.courseId ? [options.courseId] : [])).all<{
    id: string;
    data: string;
    version: number;
  }>()).results;
  if (options.courseId && !rows.length)
    throw new AccessError(404, 'Course laporan tidak ditemukan.');
  if (rows.length > 500)
    throw new AccessError(413, 'Pilih satu course untuk memperkecil laporan.');
  const courses = rows.map(r => ({ ...JSON.parse(r.data), id: r.id, version: r.version } as Course)).filter(c => options.includeSamples || !c.sample);
  if (courses.length > 500)
    throw new AccessError(413, 'Pilih satu course untuk memperkecil laporan.');
  const summary = { courses: courses.length, uniqueParticipants: 0, courseParticipants: 0, finished: 0, activeParticipants: 0, pendingReviews: 0, validCertificates: 0 };
  const result: ManagementReport = { generatedAt, periodStart, days, selectedCourseId: options.courseId || null, includeSamples: !!options.includeSamples, courses: [], participants: [], tutors: [], summary };
  if (!courses.length)
    return result;
  const ids = courses.map(c => c.id), marks = ids.map(() => '?').join(',');
  const participantRows = (await d.prepare(`SELECT p.userId,p.courseId,u.name,u.role,COALESCE(a.status,'pending') AS accessStatus,e.created_at AS enrolledAt
  FROM (SELECT user_id AS userId,course_id AS courseId FROM enrollments WHERE course_id IN (${marks})
    UNION SELECT user_id,course_id FROM progress WHERE course_id IN (${marks})
    UNION SELECT m.user_id,c.course_id FROM cohort_members m JOIN cohorts c ON c.id=m.class_id WHERE m.status='approved' AND c.course_id IN (${marks})) p
  JOIN users u ON u.id=p.userId LEFT JOIN user_access a ON a.user_id=u.id LEFT JOIN enrollments e ON e.user_id=u.id AND e.course_id=p.courseId
  WHERE u.role!='owner' ORDER BY p.courseId,u.name,p.userId LIMIT ${participantLimit + 1}`).bind(...ids, ...ids, ...ids).all<{
    userId: string;
    courseId: string;
    name: string;
    role: string;
    accessStatus: string;
    enrolledAt: string | null;
  }>()).results;
  if (participantRows.length > participantLimit)
    throw new AccessError(413, 'Laporan melebihi 5.000 pasangan peserta–course. Pilih satu course untuk memperkecil laporan.');
  const progressRows = (await d.prepare(`SELECT p.user_id AS userId,p.course_id AS courseId,p.lesson_id AS lessonId,p.revision,p.complete,p.quiz_passed AS quizPassed,p.code_passed AS codePassed,p.quiz_attempts AS quizAttempts,p.code_attempts AS codeAttempts,p.score FROM progress p JOIN users u ON u.id=p.user_id WHERE u.role!='owner' AND p.course_id IN (${marks}) LIMIT 500001`).bind(...ids).all<Progress & {
    userId: string;
    courseId: string;
  }>()).results;
  if (progressRows.length > 500000)
    throw new AccessError(413, 'Progres terlalu besar. Pilih satu course untuk memperkecil laporan.');
  const activities = (await d.prepare(`SELECT e.userId,e.courseId,max(e.at) AS lastActivityAt,
    SUM(CASE WHEN e.at>=? AND e.kind='quiz' THEN 1 ELSE 0 END) AS quizAttempts,
    SUM(CASE WHEN e.at>=? AND e.kind='code' THEN 1 ELSE 0 END) AS codeAttempts,
    SUM(CASE WHEN e.at>=? AND e.kind='submission' THEN 1 ELSE 0 END) AS submissions,
    SUM(CASE WHEN e.at>=? AND e.kind='post' THEN 1 ELSE 0 END) AS posts
  FROM (
    SELECT user_id AS userId,course_id AS courseId,created_at AS at,kind FROM attempts
    UNION ALL SELECT user_id,course_id,created_at,'post' FROM messages
    UNION ALL SELECT s.student_id,c.course_id,s.submitted_at,'submission' FROM project_submissions s JOIN class_assignments a ON a.id=s.assignment_id JOIN cohorts c ON c.id=a.class_id
    UNION ALL SELECT p.user_id,c.course_id,p.created_at,'post' FROM cohort_posts p JOIN cohorts c ON c.id=p.class_id
  ) e WHERE e.courseId IN (${marks}) AND e.at<=? GROUP BY e.userId,e.courseId`).bind(periodStart, periodStart, periodStart, periodStart, ...ids, generatedAt).all<{
    userId: string;
    courseId: string;
    lastActivityAt: string | null;
    quizAttempts: number;
    codeAttempts: number;
    submissions: number;
    posts: number;
  }>()).results;
  const key = (user: string, course: string) => JSON.stringify([user, course]), progressMap = new Map<string, Progress[]>(), activityMap = new Map(activities.map(a => [key(a.userId, a.courseId), a]));
  for (const p of progressRows) {
    const k = key(p.userId, p.courseId);
    if (!progressMap.has(k))
      progressMap.set(k, []);
    progressMap.get(k)!.push(p);
  }
  const courseMap = new Map(courses.map(c => [c.id, c]));
  result.participants = participantRows.map(row => {
    const c = courseMap.get(row.courseId)!, progress = progressMap.get(key(row.userId, c.id)) || [], activity = activityMap.get(key(row.userId, c.id));
    const completed = c.lessons.filter(l => { const p = progressFor(l, progress); return p?.complete === 1 && canComplete(l, p); }).length;
    const stale = c.lessons.filter(l => progress.some(p => p.lessonId === l.id && p.revision !== l.revision)).length;
    const quizAttempts = Number(activity?.quizAttempts || 0), codeAttempts = Number(activity?.codeAttempts || 0), submissions = Number(activity?.submissions || 0), posts = Number(activity?.posts || 0);
    return { ...row, courseTitle: c.title, completed, total: c.lessons.length, percent: c.lessons.length ? Math.round(completed / c.lessons.length * 100) : 0, finished: !!c.lessons.length && completed === c.lessons.length, started: progress.length > 0 || !!activity?.lastActivityAt, stale, quizAttempts, codeAttempts, submissions, posts, lastActivityAt: activity?.lastActivityAt || null, activeInPeriod: quizAttempts + codeAttempts + submissions + posts > 0 } satisfies ReportLearner;
  });
  const certificateRows = (await d.prepare(`SELECT course_id AS courseId,count(*) AS n FROM certificates WHERE revoked_at IS NULL AND course_id IN (${marks}) GROUP BY course_id`).bind(...ids).all<{
    courseId: string;
    n: number;
  }>()).results;
  result.courses = courses.map(c => {
    const participants = result.participants.filter(p => p.courseId === c.id), finished = participants.filter(p => p.finished).length, notStarted = participants.filter(p => !p.started).length;
    return { id: c.id, title: c.title, published: c.published, sample: c.sample, lessonCount: c.lessons.length, participants: participants.length, finished, notStarted, inProgress: participants.length - finished - notStarted, activeInPeriod: participants.filter(p => p.activeInPeriod).length, staleParticipants: participants.filter(p => p.stale > 0).length, completionPercent: participants.length ? Math.round(finished / participants.length * 100) : 0, validCertificates: Number(certificateRows.find(r => r.courseId === c.id)?.n || 0) } satisfies ReportCourse;
  });
  const classrooms = (await d.prepare(`SELECT c.id,c.mentor_id AS mentorId,
  (SELECT count(*) FROM cohort_members m WHERE m.class_id=c.id AND m.status='approved') AS approvedMemberships,
  (SELECT count(*) FROM project_submissions s JOIN class_assignments a ON a.id=s.assignment_id WHERE a.class_id=c.id AND ${pendingReviewSql}) AS pendingReviews,
  (SELECT min(s.submitted_at) FROM project_submissions s JOIN class_assignments a ON a.id=s.assignment_id WHERE a.class_id=c.id AND ${pendingReviewSql}) AS oldestSubmittedAt,
  (SELECT count(*) FROM project_submissions s JOIN class_assignments a ON a.id=s.assignment_id WHERE a.class_id=c.id AND s.reviewed_at>=? AND s.reviewed_at<=?) AS reviewsInPeriod
  FROM cohorts c WHERE c.status!='archived' AND c.course_id IN (${marks})`).bind(periodStart, generatedAt, ...ids).all<{
    id: string;
    mentorId: string | null;
    approvedMemberships: number;
    pendingReviews: number;
    oldestSubmittedAt: string | null;
    reviewsInPeriod: number;
  }>()).results;
  const staff = (await d.prepare(`SELECT u.id,u.name,COALESCE(a.status,'pending') AS accessStatus FROM users u LEFT JOIN user_access a ON a.user_id=u.id
  WHERE u.role='tutor' OR EXISTS(SELECT 1 FROM tutor_accounts t WHERE t.user_id=u.id AND t.active=1)
    OR EXISTS(SELECT 1 FROM cohorts c WHERE c.mentor_id=u.id AND c.status!='archived' AND c.course_id IN (${marks})) ORDER BY u.name,u.id`).bind(...ids).all<{
    id: string;
    name: string;
    accessStatus: string;
  }>()).results;
  const tutorMap = new Map<string | null, ReportTutor>(staff.map(t => [t.id, { ...t, classes: 0, approvedMemberships: 0, pendingReviews: 0, oldestSubmittedAt: null, reviewsInPeriod: 0 }]));
  for (const c of classrooms) {
    if (!tutorMap.has(c.mentorId))
      tutorMap.set(c.mentorId, { id: c.mentorId, name: c.mentorId ? 'Tutor tidak ditemukan' : 'Belum ditugaskan', accessStatus: c.mentorId ? 'missing' : 'unassigned', classes: 0, approvedMemberships: 0, pendingReviews: 0, oldestSubmittedAt: null, reviewsInPeriod: 0 });
    const t = tutorMap.get(c.mentorId)!;
    t.classes++;
    t.approvedMemberships += Number(c.approvedMemberships);
    t.pendingReviews += Number(c.pendingReviews);
    t.reviewsInPeriod += Number(c.reviewsInPeriod);
    if (c.oldestSubmittedAt && (!t.oldestSubmittedAt || c.oldestSubmittedAt < t.oldestSubmittedAt))
      t.oldestSubmittedAt = c.oldestSubmittedAt;
  }
  result.tutors = [...tutorMap.values()].sort((a, b) => b.pendingReviews - a.pendingReviews || a.name.localeCompare(b.name));
  summary.uniqueParticipants = new Set(result.participants.map(p => p.userId)).size;
  summary.courseParticipants = result.participants.length;
  summary.finished = result.courses.reduce((n, c) => n + c.finished, 0);
  summary.activeParticipants = new Set(result.participants.filter(p => p.activeInPeriod).map(p => p.userId)).size;
  summary.pendingReviews = result.tutors.reduce((n, t) => n + t.pendingReviews, 0);
  summary.validCertificates = result.courses.reduce((n, c) => n + c.validCertificates, 0);
  return result;
}
