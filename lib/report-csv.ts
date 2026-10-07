import type { ManagementReport } from './report-model.ts';
import { reportAccess } from './report-model.ts';
export type ReportExport = 'courses' | 'participants' | 'tutors';
export function csvCell(value: unknown) {
  let text = value === null || value === undefined ? '' : String(value);
  // Quote every cell and neutralize spreadsheet formulas, including leading controls/space.
  if (/^[\s\u0000-\u001f]*[=+@＝＋－＠-]/u.test(text) || /^[\t\r\n]/u.test(text))
    text = "'\t" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
export function reportCsv(report: ManagementReport, kind: ReportExport) {
  const context = ['Waktu laporan (UTC)', 'Awal periode (UTC)', 'Periode hari', 'Course filter', 'Termasuk contoh'];
  const values = [report.generatedAt, report.periodStart, report.days, report.selectedCourseId || 'Semua', report.includeSamples ? 'Ya' : 'Tidak'];
  let headers: string[], rows: unknown[][];
  if (kind === 'courses') {
    headers = ['ID course', 'Course', 'Status', 'Contoh', 'Materi', 'Peserta-course', 'Selesai materi dan tes wajib', 'Sedang belajar', 'Belum ada progres/aktivitas', 'Aktif periode', 'Progres revisi lama', 'Penyelesaian persen', 'Sertifikat valid'];
    rows = report.courses.map(c => [c.id, c.title, c.published ? 'Terbit' : 'Draft', c.sample ? 'Ya' : 'Tidak', c.lessonCount, c.participants, c.finished, c.inProgress, c.notStarted, c.activeInPeriod, c.staleParticipants, c.completionPercent, c.validCertificates]);
  }
  else if (kind === 'participants') {
    headers = ['ID akun', 'Nama', 'Peran', 'Akses', 'ID course', 'Course', 'Daftar (UTC)', 'Materi selesai', 'Total materi', 'Progres persen', 'Selesai materi dan tes wajib', 'Materi revisi lama', 'Percobaan kuis periode', 'Percobaan kode periode', 'Kiriman tugas periode', 'Posting periode', 'Aktif periode', 'Aktivitas terakhir tercatat (UTC)'];
    rows = report.participants.map(p => [p.userId, p.name, p.role, reportAccess(p.accessStatus), p.courseId, p.courseTitle, p.enrolledAt, p.completed, p.total, p.percent, p.finished ? 'Ya' : 'Tidak', p.stale, p.quizAttempts, p.codeAttempts, p.submissions, p.posts, p.activeInPeriod ? 'Ya' : 'Tidak', p.lastActivityAt]);
  }
  else {
    headers = ['ID Tutor', 'Tutor/penugasan', 'Akses', 'Kelas nonarsip', 'Keanggotaan disetujui', 'Menunggu review', 'Kiriman tertua menunggu (UTC)', 'Kiriman direview periode di kelas saat ini'];
    rows = report.tutors.map(t => [t.id, t.name, reportAccess(t.accessStatus), t.classes, t.approvedMemberships, t.pendingReviews, t.oldestSubmittedAt, t.reviewsInPeriod]);
  }
  return '\uFEFF' + [[...context, ...headers], ...rows.map(row => [...values, ...row])].map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
