"use client";
import { useState } from "react";
import { ClipboardList, Clock3, ArrowUpRight } from "lucide-react";
import type { DashboardProject } from "@/lib/projects";
const labels = {
  not_submitted: "Belum dikirim",
  submitted: "Menunggu review",
  changes_requested: "Perlu revisi",
  accepted: "Diterima",
  stale: "Instruksi berubah — kerjakan ulang",
  configuration_required: "Aturan tugas sedang disiapkan",
};
const date = (s: string) =>
  new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  }).format(new Date(s)) + " WIB";
export default function ProjectSummary({
  projects,
}: {
  projects: DashboardProject[];
}) {
  const [filter, setFilter] = useState("all"),
    [expanded, setExpanded] = useState(false);
  const counts = {
    all: projects.length,
    work: projects.filter((p) => p.needsWork).length,
    waiting: projects.filter((p) => p.status === "submitted").length,
    accepted: projects.filter((p) => p.status === "accepted").length,
  };
  const filtered = projects.filter(
    (p) =>
      filter === "all" ||
      (filter === "work" && p.needsWork) ||
      (filter === "waiting" && p.status === "submitted") ||
      (filter === "accepted" && p.status === "accepted"),
  );
  const visible = expanded ? filtered : filtered.slice(0, 6);
  return (
    <section
      className="account-project-section"
      aria-labelledby="project-summary-title"
    >
      <div className="account-section-heading">
        <div>
          <div className="eyebrow teal">PEKERJAAN & FEEDBACK</div>
          <h2 id="project-summary-title">
            <ClipboardList size={23} />
            Tugas proyek saya
          </h2>
        </div>
        <a href="/classes">Lihat kelas saya</a>
      </div>
      <div
        className="account-filter project-filters"
        role="group"
        aria-label="Filter tugas proyek"
      >
        {[
          ["all", "Semua"],
          ["work", "Perlu dikerjakan"],
          ["waiting", "Menunggu review"],
          ["accepted", "Diterima"],
        ].map(([key, label]) => (
          <button
            key={key}
            className={filter === key ? "selected" : ""}
            aria-pressed={filter === key}
            onClick={() => {
              setFilter(key);
              setExpanded(false);
            }}
          >
            {label} <span>{counts[key as keyof typeof counts]}</span>
          </button>
        ))}
      </div>
      {!projects.length ? (
        <div className="account-session-empty">
          <ClipboardList size={25} />
          <div>
            <h3>Belum ada tugas dari kelas Anda</h3>
            <p>
              Tugas muncul setelah keanggotaan kelas disetujui dan mentor
              membuka tugas.
            </p>
            <a href="/classes">Jelajahi kelas</a>
          </div>
        </div>
      ) : !filtered.length ? (
        <div className="account-session-empty">
          <p>
            Belum ada tugas dengan status ini. Pilih Semua untuk melihat tugas
            lainnya.
          </p>
        </div>
      ) : (
        <>
          <div className="account-projects">
            {visible.map((p) => (
              <article key={p.id}>
                <div className="project-summary-meta">
                  {p.className} · {p.courseTitle}
                </div>
                <h3>{p.title}</h3>
                <div className="project-summary-tags">
                  <span className={`project-status ${p.status}`}>
                    {labels[p.status]}
                  </span>
                  {p.taskStatus === "closed" && (
                    <span className="project-status closed">
                      Pengumpulan ditutup
                    </span>
                  )}
                  {p.overdue && (
                    <span className="project-status late">
                      Tenggat terlewat
                    </span>
                  )}
                  {p.late && (
                    <span className="project-status late">
                      Dikirim terlambat
                    </span>
                  )}
                </div>
                <p className="project-summary-date">
                  <Clock3 size={16} />
                  {p.dueAt ? `Tenggat ${date(p.dueAt)}` : "Tanpa tenggat"}
                </p>
                {p.submittedAt && (
                  <p className="project-summary-meta">
                    Kiriman {p.attempt} · {date(p.submittedAt)}
                  </p>
                )}
                {p.reviewedAt && (
                  <p className="project-summary-review">
                    Review {date(p.reviewedAt)}
                    {p.score !== null ? ` · Nilai ${p.score}/100` : ""}
                  </p>
                )}
                {p.overdue && (
                  <p className="project-summary-meta">
                    Anda masih dapat mengirim selama pengumpulan dibuka.
                  </p>
                )}
                <a
                  className="secondary button-link"
                  href={`/classes?class=${encodeURIComponent(p.classId)}&task=${encodeURIComponent(p.id)}`}
                >
                  {p.needsWork
                    ? p.status === "changes_requested"
                      ? "Lihat feedback & revisi"
                      : "Kerjakan tugas"
                    : p.reviewedAt
                      ? "Lihat hasil review"
                      : "Lihat tugas"}
                  <ArrowUpRight size={16} />
                </a>
              </article>
            ))}
          </div>
          {filtered.length > 6 && (
            <button
              className="secondary project-show-more"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded
                ? "Tampilkan lebih sedikit"
                : `Tampilkan ${filtered.length - 6} tugas lainnya`}
            </button>
          )}
        </>
      )}
    </section>
  );
}
