export type ReportDays = 7 | 30 | 90;
export type ReportLearner = {
  userId: string;
  name: string;
  role: string;
  accessStatus: string;
  courseId: string;
  courseTitle: string;
  enrolledAt: string | null;
  completed: number;
  total: number;
  percent: number;
  finished: boolean;
  started: boolean;
  stale: number;
  quizAttempts: number;
  codeAttempts: number;
  submissions: number;
  posts: number;
  lastActivityAt: string | null;
  activeInPeriod: boolean;
};
export type ReportCourse = {
  id: string;
  title: string;
  published: boolean;
  sample: boolean;
  lessonCount: number;
  participants: number;
  finished: number;
  inProgress: number;
  notStarted: number;
  activeInPeriod: number;
  staleParticipants: number;
  completionPercent: number;
  validCertificates: number;
};
export type ReportTutor = {
  id: string | null;
  name: string;
  accessStatus: string;
  classes: number;
  approvedMemberships: number;
  pendingReviews: number;
  oldestSubmittedAt: string | null;
  reviewsInPeriod: number;
};
export type ManagementReport = {
  generatedAt: string;
  periodStart: string;
  days: ReportDays;
  selectedCourseId: string | null;
  includeSamples: boolean;
  courses: ReportCourse[];
  participants: ReportLearner[];
  tutors: ReportTutor[];
  summary: {
    courses: number;
    uniqueParticipants: number;
    courseParticipants: number;
    finished: number;
    activeParticipants: number;
    pendingReviews: number;
    validCertificates: number;
  };
};
export function reportDate(value: string | null) {
  return value ? new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta' }).format(new Date(value)) + ' WIB' : 'Belum tercatat';
}
export function reportAccess(value: string) {
  return ({ active: 'Aktif', pending: 'Menunggu persetujuan', suspended: 'Ditangguhkan', unassigned: 'Belum ditugaskan', missing: 'Akun tidak ditemukan' } as Record<string, string>)[value] || value;
}
