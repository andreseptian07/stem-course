"use client";
import { useState } from "react";
import { ArrowUpRight, CalendarDays, ClipboardList, Users, GraduationCap } from "lucide-react";
import type { TutorDashboard } from "@/lib/tutor-dashboard";

const date = (value: string) => new Intl.DateTimeFormat("id-ID", {
  dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta",
}).format(new Date(value)) + " WIB";
const classLink = (id: string) => `/classes?class=${encodeURIComponent(id)}`;

export default function TutorSummary({ teaching, owner }: { teaching: TutorDashboard; owner: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const reviews = expanded ? teaching.reviews : teaching.reviews.slice(0, 6);
  return <div className="tutor-dashboard">
    <section className="account-stats" aria-label="Ringkasan pendampingan">
      <div><GraduationCap /><strong>{teaching.classes.length}</strong><span>Kelas ditangani</span></div>
      <div><Users /><strong>{teaching.classes.reduce((n, c) => n + c.studentCount, 0)}</strong><span>Keanggotaan siswa aktif</span></div>
      <div><ClipboardList /><strong>{teaching.pendingCount}</strong><span>Kiriman menunggu review</span></div>
      <div><CalendarDays /><strong>{teaching.sessions.length}</strong><span>Sesi mengajar</span></div>
    </section>
    <section className="account-project-section" aria-labelledby="teaching-reviews-title">
      <div className="account-section-heading">
        <div><div className="eyebrow teal">TINDAK LANJUT SISWA</div><h2 id="teaching-reviews-title">Antrean review</h2></div>
        <span>Kiriman terlama lebih dahulu</span>
      </div>
      {!teaching.reviews.length ? <div className="account-session-empty"><ClipboardList size={25} /><div><h3>Belum ada kiriman yang perlu direview</h3><p>Kiriman baru dari siswa kelas Anda akan muncul di sini.</p></div></div> : <>
        <div className="account-projects">
          {reviews.map((r) => <article key={r.id}>
            <div className="project-summary-meta">{r.className}</div>
            <h3>{r.taskTitle}</h3>
            <p><strong>{r.studentName}</strong> · Kiriman {r.attempt}</p>
            <p className="project-summary-meta">Dikirim {date(r.submittedAt)}</p>
            {r.late && <p><span className="project-status late">Dikirim terlambat</span></p>}
            <a className="secondary button-link" href={`${classLink(r.classId)}&task=${encodeURIComponent(r.taskId)}`}>Review tugas <ArrowUpRight size={16} /></a>
          </article>)}
        </div>
        {teaching.reviews.length > 6 && <button type="button" className="secondary project-show-more" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? "Tampilkan lebih sedikit" : `Tampilkan ${teaching.reviews.length - 6} kiriman lainnya`}</button>}
        {teaching.pendingCount > teaching.reviews.length && <p>Menampilkan 50 kiriman terlama dari {teaching.pendingCount}. Buka kelas untuk melihat seluruh kiriman.</p>}
      </>}
    </section>
    <section className="account-course-section" aria-labelledby="teaching-classes-title">
      <div className="account-section-heading"><h2 id="teaching-classes-title">{owner ? "Kelas yang dikelola" : "Kelas yang saya tangani"}</h2><a href="/classes">{owner ? "Kelola kelas" : "Lihat semua kelas"}</a></div>
      {!teaching.classes.length ? <div className="account-session-empty"><Users size={25} /><div><h3>{owner ? "Belum ada kelas aktif" : "Belum ada penugasan kelas"}</h3><p>{owner ? "Buat kelas dan tugaskan Tutor melalui Kelola kelas." : "Kelas akan muncul setelah Super Admin menugaskan Anda sebagai Tutor."}</p></div></div> : <div className="account-projects">
        {teaching.classes.map((c) => <article key={c.id}>
          <div className="project-summary-meta">{c.courseTitle}</div><h3>{c.name}</h3>
          <p>{c.studentCount} siswa · {c.status === "open" ? "Pendaftaran dibuka" : "Kelas aktif"}</p>
          <p>{c.pendingCount ? `${c.pendingCount} kiriman menunggu review` : "Tidak ada antrean review"}</p>
          <a className="secondary button-link" href={classLink(c.id)}>Buka kelas <ArrowUpRight size={16} /></a>
        </article>)}
      </div>}
    </section>
    <section className="account-session-section" aria-labelledby="teaching-sessions-title">
      <div className="account-section-heading"><div><div className="eyebrow teal">AGENDA KELAS</div><h2 id="teaching-sessions-title">Jadwal mengajar</h2></div></div>
      {!teaching.sessions.length ? <div className="account-session-empty"><CalendarDays size={25} /><div><h3>Belum ada jadwal mengajar</h3><p>Jadwalkan sesi online atau tatap muka dari ruang kelas.</p></div></div> : <div className="account-sessions">
        {teaching.sessions.map((s) => <article key={s.id}>
          <div className="account-session-icon"><CalendarDays size={23} /></div>
          <div><span>{s.className} · {s.kind === "online" ? "Online" : "Tatap muka"}</span><h3>{s.title}</h3><p>{date(s.startsAt)} · {s.duration} menit</p></div>
          <a className="secondary button-link" href={classLink(s.classId)}>Buka sesi di kelas</a>
        </article>)}
      </div>}
    </section>
  </div>;
}
