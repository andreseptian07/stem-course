"use client";
import { useEffect, useState } from 'react';
import { reportDate, reportAccess, type ManagementReport, type ReportDays } from '@/lib/report-model';
type Option = {
  id: string;
  title: string;
  sample: boolean;
};
export default function ManagementReports({ courses }: {
  courses: Option[];
}) {
  const [selected, setSelected] = useState(''), [days, setDays] = useState<ReportDays>(30), [samples, setSamples] = useState(false), [report, setReport] = useState<ManagementReport | null>(null), [error, setError] = useState(''), [loading, setLoading] = useState(true), [reload, setReload] = useState(0), [search, setSearch] = useState('');
  const query = new URLSearchParams({ days: String(days), samples: samples ? '1' : '0' });
  if (selected)
    query.set('course', selected);
  const url = '/api/reports?' + query.toString();
  useEffect(() => {
    const controller = new AbortController();
    fetch(url, { cache: 'no-store', signal: controller.signal }).then(async (r) => { const data = await r.json() as ManagementReport & {
      error?: string;
    }; if (!r.ok)
      throw new Error(data.error || 'Laporan gagal dimuat.'); if (!controller.signal.aborted) {
      setReport(data);
      setError('');
      setLoading(false);
    } }).catch(e => { if (!controller.signal.aborted) {
      setReport(null);
      setError(e.message);
      setLoading(false);
    } });
    return () => controller.abort();
  }, [url, reload]);
  function changed() { setLoading(true); setReport(null); setError(''); }
  const participants = report?.participants.filter(p => [p.name, p.courseTitle, reportAccess(p.accessStatus)].join(' ').toLocaleLowerCase('id').includes(search.trim().toLocaleLowerCase('id'))) || [];
  return <section className='management-reports'><div className='section-heading'><h2>Laporan pengelola</h2><button disabled={loading} onClick={() => { changed(); setReload(n => n + 1); }}>Muat ulang laporan</button></div>
  <div className='report-filters'><label className='field'>Course<select value={selected} onChange={e => { changed(); setSelected(e.target.value); }}><option value=''>Semua course</option>{courses.filter(c => samples || !c.sample).map(c => <option key={c.id} value={c.id}>{c.title}</option>)}</select></label><label className='field'>Aktivitas dalam<select value={days} onChange={e => { changed(); setDays(Number(e.target.value) as ReportDays); }}><option value='7'>7 hari terakhir</option><option value='30'>30 hari terakhir</option><option value='90'>90 hari terakhir</option></select></label><label className='checkbox-label'><input type='checkbox' checked={samples} onChange={e => { changed(); setSamples(e.target.checked); if (!e.target.checked && courses.find(c => c.id === selected)?.sample)
    setSelected(''); }}/>Termasuk course contoh</label></div>
  <p className='small'>Progres menggunakan revisi materi terbaru, tes wajib, dan review wajib dengan standar nilai course. Aktivitas mencakup percobaan kuis/kode, diskusi dan pengumpulan tugas; kunjungan halaman materi belum dicatat. Akun pengelola tidak dihitung sebagai peserta.</p>
  {error && <p className='notice error' role='alert'>{error}</p>}{loading && <p role='status'>Menghitung laporan…</p>}
  {report && !loading && <><p className='small'>Diperbarui {reportDate(report.generatedAt)}. Aktivitas: {reportDate(report.periodStart)} sampai {reportDate(report.generatedAt)}. Progres dan antrean menunjukkan kondisi saat laporan dimuat.</p>
    <div className='report-summary'>{[['Peserta unik', report.summary.uniqueParticipants], ['Pasangan peserta–course', report.summary.courseParticipants], ['Seluruh tahap lulus', report.summary.finished], ['Peserta aktif periode', report.summary.activeParticipants], ['Menunggu review', report.summary.pendingReviews], ['Sertifikat valid', report.summary.validCertificates]].map(([label, value]) => <article key={String(label)}><strong>{value}</strong><span>{label}</span></article>)}</div>
    <div className='report-exports'><span>Ekspor CSV:</span><a href={url + '&export=courses'}>Ringkasan course</a><a href={url + '&export=participants'}>Peserta & aktivitas</a><a href={url + '&export=tutors'}>Beban review Tutor</a></div><p className='small'>Ekspor menghitung ulang data dengan filter course/periode yang sama. Pencarian nama di bawah hanya menyaring tampilan peserta. CSV memuat nama dan ID akun; simpan untuk keperluan pengelola.</p>
    <h3>Penyelesaian course</h3><div className='table-wrap'><table><thead><tr><th scope="col">Course</th><th scope="col">Peserta</th><th scope="col">Tahap lulus</th><th scope="col">Belajar / belum mulai</th><th scope="col">Aktif periode</th><th scope="col">Revisi lama</th><th scope="col">Sertifikat valid</th></tr></thead><tbody>{report.courses.map(c => <tr key={c.id}><td><strong>{c.title}</strong><small>{c.published ? 'Terbit' : 'Draft'}{c.sample ? ' · Contoh' : ''} · {c.lessonCount} materi</small></td><td>{c.participants}</td><td>{c.finished} ({c.completionPercent}%)</td><td>{c.inProgress} / {c.notStarted}</td><td>{c.activeInPeriod}</td><td>{c.staleParticipants}</td><td>{c.validCertificates}</td></tr>)}</tbody></table></div>{!report.courses.length && <p>Belum ada course yang cocok dengan filter.</p>}
    <p className='small'>Tahap lulus mencakup review wajib sesuai standar course dan status Diterima. Course dengan beberapa kelas memakai progres terendah di antara kelas peserta. Penerbitan sertifikat tetap mengikuti keanggotaan dan syarat kelas yang dipilih.</p>
    <h3>Peserta & aktivitas</h3><label className='field report-search'>Cari nama, course atau status akses<input type='search' value={search} onChange={e => setSearch(e.target.value)}/></label><p className='small'>{Math.min(200, participants.length)} dari {report.participants.length} pasangan peserta–course ditampilkan.</p><div className='table-wrap'><table><thead><tr><th scope="col">Peserta</th><th scope="col">Course / progres</th><th scope="col">Kuis / kode periode</th><th scope="col">Tugas / posting periode</th><th scope="col">Aktivitas terakhir tercatat</th></tr></thead><tbody>{participants.slice(0, 200).map(p => <tr key={p.userId + '\n' + p.courseId}><td><strong>{p.name}</strong><small>{reportAccess(p.accessStatus)} · {p.role === 'tutor' ? 'Tutor' : 'Siswa'}</small></td><td>{p.courseTitle}<small>{p.completed}/{p.total} tahap lulus · {p.percent}%{p.finished ? ' · Selesai' : ''}{p.stale ? ` · ${p.stale} materi revisi lama` : ''}</small>{p.classResults?.map(r=><small key={r.classId||"independent"}>{r.className||"Mandiri"}: {r.completed}/{r.total} tahap lulus{r.finished?" · Lulus":""}</small>)}</td><td>{p.quizAttempts} / {p.codeAttempts}</td><td>{p.submissions} / {p.posts}</td><td>{reportDate(p.lastActivityAt)}</td></tr>)}</tbody></table></div>{!participants.length && <p>Tidak ada peserta yang cocok.</p>}{participants.length > 200 && <p>Tabel menampilkan 200 baris pertama. Gunakan pencarian atau ekspor untuk daftar lengkap.</p>}
    <h3>Beban review Tutor</h3><p className='small'>Kelas nonarsip dengan penugasan saat ini. Antrean menghitung kiriman terakhir yang menunggu review dari anggota disetujui. Review periode menghitung kiriman yang memiliki review tercatat di kelas tersebut; bukan jumlah tindakan pribadi Tutor. Keanggotaan dapat menghitung Siswa yang sama di beberapa kelas.</p><div className='table-wrap'><table><thead><tr><th scope="col">Tutor / penugasan</th><th scope="col">Kelas</th><th scope="col">Keanggotaan</th><th scope="col">Menunggu review</th><th scope="col">Kiriman tertua menunggu</th><th scope="col">Kiriman direview periode</th></tr></thead><tbody>{report.tutors.map(t => <tr key={t.id || 'unassigned'}><td><strong>{t.name}</strong><small>{reportAccess(t.accessStatus)}</small></td><td>{t.classes}</td><td>{t.approvedMemberships}</td><td>{t.pendingReviews}</td><td>{t.oldestSubmittedAt ? reportDate(t.oldestSubmittedAt) : 'Tidak ada antrean'}</td><td>{t.reviewsInPeriod}</td></tr>)}</tbody></table></div>{!report.tutors.length && <p>Belum ada Tutor atau kelas pada laporan.</p>}
  </>}
  </section>;
}
