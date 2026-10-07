"use client";
import { useEffect, useState } from "react";
import {
  BookOpen,
  Layers3,
  Search,
  Clock3,
  Code2,
  CalendarDays,
  Users,
  SlidersHorizontal,
  Check,
  Cpu,
  ShieldCheck,
  Calculator,
  Radio,
  Video,
  MapPin,
  Loader2,
  LogIn,
  LogOut,
} from "lucide-react";
import type { CatalogCourse, CatalogState } from "@/lib/catalog";
import NotificationLink from "./notification-link";
import "./portal.css";
const format = (c: CatalogCourse) =>
  c.overview.format === "blended" ? "Mandiri + sesi mentor" : "Belajar mandiri";
const duration = (minutes: number) =>
  minutes >= 60
    ? `${Math.floor(minutes / 60)} jam${minutes % 60 ? ` ${minutes % 60} menit` : ""}`
    : `${minutes} menit`;
const courseUrl = (id: string) => `/courses/${encodeURIComponent(id)}`;
const learnUrl = (c: CatalogCourse) =>
  `/dashboard?join=${encodeURIComponent(c.id)}`;
const when = (value: string) =>
  new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  }).format(new Date(value)) + " WIB";
function CategoryIcon({
  category,
  size = 26,
}: {
  category: string;
  size?: number;
}) {
  const Icon = /security|keamanan/i.test(category)
    ? ShieldCheck
    : /matematik/i.test(category)
      ? Calculator
      : /signal|radio|sinyal/i.test(category)
        ? Radio
        : /coding|program/i.test(category)
          ? Code2
          : Cpu;
  return <Icon size={size} />;
}
function CourseCard({ course: c }: { course: CatalogCourse }) {
  return (
    <a className="catalog-card" href={courseUrl(c.id)}>
      <div className="catalog-cover">
        <CategoryIcon category={c.category} size={42} />
        <span>{c.category || "STEM"}</span>
        <span className="catalog-cover-code">{c.level}</span>
      </div>
      <div className="catalog-card-body">
        <div className="catalog-tags">
          <span>{format(c)}</span>
          {c.sample && <span>Course contoh</span>}
        </div>
        <h3>{c.title}</h3>
        <p>{c.description || "Lihat kurikulum dan informasi course."}</p>
        <div className="catalog-card-meta">
          <span>
            <BookOpen size={15} />
            {c.lessonCount} materi
          </span>
          <span>
            <Clock3 size={15} />
            {duration(c.minutes)}
          </span>
        </div>
        <div className="catalog-card-link">Lihat detail course</div>
      </div>
    </a>
  );
}
function EmptyCourses() {
  return (
    <div className="portal-empty">
      <BookOpen size={30} />
      <h3>Course sedang disiapkan</h3>
      <p>Course akan tampil di sini setelah pengajar menerbitkannya.</p>
      <a className="secondary button-link" href="/learn">
        Masuk ke ruang belajar
      </a>
    </div>
  );
}
export default function Portal({
  view,
  courseId,
}: {
  view: "home" | "catalog" | "detail";
  courseId?: string;
}) {
  const [data, setData] = useState<CatalogState | null>(null),
    [error, setError] = useState(""),
    [query, setQuery] = useState(""),
    [category, setCategory] = useState(""),
    [level, setLevel] = useState(""),
    [mode, setMode] = useState("");
  async function load() {
    setError("");
    try {
      const r = await fetch("/api/catalog", { cache: "no-store" });
      const d = (await r.json()) as CatalogState & { error?: string };
      if (!r.ok) throw new Error(d.error || "Katalog belum dapat dimuat.");
      setData(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Katalog belum dapat dimuat.");
    }
  }
  useEffect(() => {
    void load();
  }, []);
  const courses = data?.courses || [];
  const current = courses.find((c) => c.id === courseId);
  const filtered = courses.filter(
    (c) =>
      (!query ||
        `${c.title} ${c.description} ${c.category}`
          .toLowerCase()
          .includes(query.toLowerCase().trim())) &&
      (!category || c.category === category) &&
      (!level || c.level === level) &&
      (!mode || c.overview.format === mode),
  );
  const reset = () => {
    setQuery("");
    setCategory("");
    setLevel("");
    setMode("");
  };
  const loading = !data && !error;
  return (
    <div className="portal">
      <a className="portal-skip" href="#portal-content">
        Lewati ke konten
      </a>
      <header className="portal-header">
        <a className="portal-brand" href="/" aria-label="Ruang STEM beranda">
          <span>
            <Layers3 size={24} />
          </span>
          <b>
            Ruang<span> STEM</span>
          </b>
        </a>
        <nav aria-label="Navigasi utama">
          <a className={view === "home" ? "selected" : ""} aria-current={view === "home" ? "page" : undefined} href="/">
            Beranda
          </a>
          <a className={view !== "home" ? "selected" : ""} aria-current={view !== "home" ? "page" : undefined} href="/courses">
            Katalog course
          </a>
          <a href="/learn?view=sessions">Sesi Tutor</a>
        </nav>
        <div className="portal-auth-actions">
          {data?.user && <NotificationLink />}
          <a className="portal-login" href={data?.user ? "/dashboard" : "/login"}>
            {data?.user ? <BookOpen size={17} /> : <LogIn size={17} />}{" "}
            {data?.user ? "Dashboard" : "Masuk"}
          </a>
          {data?.user ? <a className="portal-login portal-logout" href="/logout"><LogOut size={17} />Keluar</a> : <a className="portal-register" href="/register">Daftar</a>}
        </div>
      </header>
      <main id="portal-content">
        {view === "home" && (
          <>
            <section className="portal-hero">
              <div className="portal-container hero-grid">
                <div className="hero-copy">
                  <div className="eyebrow">
                    SAINS · TEKNOLOGI · TEKNIK · MATEMATIKA
                  </div>
                  <h1>
                    Dari memahami konsep
                    <br />
                    ke membangun sesuatu.
                  </h1>
                  <p>
                    Jelajahi STEM melalui materi terstruktur, latihan coding,
                    dan praktik. Temukan jalur belajar Anda dan diskusikan
                    prosesnya bersama mentor.
                  </p>
                  <div className="hero-actions">
                    <a className="primary button-link" href="/courses">
                      Jelajahi course
                    </a>
                    <a className="hero-secondary" href="/learn">
                      Buka ruang belajar
                    </a>
                  </div>
                  <div className="hero-notes">
                    <span>
                      <BookOpen size={16} />
                      Materi bertahap
                    </span>
                    <span>
                      <Code2 size={16} />
                      Latihan praktis
                    </span>
                    <span>
                      <Users size={16} />
                      Pendampingan mentor
                    </span>
                  </div>
                </div>
                <aside className="hero-path">
                  <div className="path-label">
                    <Layers3 size={20} />
                    PERJALANAN BELAJAR
                  </div>
                  <ol>
                    <li>
                      <span>01</span>
                      <div>
                        <h3>Pahami konsepnya</h3>
                        <p>Baca materi dan pelajari penjelasannya.</p>
                      </div>
                    </li>
                    <li>
                      <span>02</span>
                      <div>
                        <h3>Uji pemahaman Anda</h3>
                        <p>Kerjakan latihan sebelum melangkah lebih jauh.</p>
                      </div>
                    </li>
                    <li>
                      <span>03</span>
                      <div>
                        <h3>Terapkan dalam praktik</h3>
                        <p>Hubungkan pengetahuan dengan proyek nyata.</p>
                      </div>
                    </li>
                  </ol>
                  <div className="path-footer">
                    <Users size={18} />
                    Ruang diskusi dalam setiap materi
                  </div>
                </aside>
              </div>
            </section>
            <section className="portal-container portal-section">
              <div className="portal-section-title">
                <div>
                  <div className="eyebrow teal">TEMUKAN TITIK MULAI</div>
                  <h2>Course untuk langkah berikutnya</h2>
                </div>
                <a className="portal-text-link" href="/courses">
                  Lihat semua course
                </a>
              </div>
              {loading ? (
                <Loading />
              ) : error ? (
                <ErrorBox error={error} retry={load} />
              ) : courses.length ? (
                <div className="catalog-grid">
                  {courses.slice(0, 3).map((c) => (
                    <CourseCard key={c.id} course={c} />
                  ))}
                </div>
              ) : (
                <EmptyCourses />
              )}
            </section>
            <section className="portal-method">
              <div className="portal-container">
                <div className="portal-section-title">
                  <div>
                    <div className="eyebrow teal">BELAJAR DENGAN ARAH</div>
                    <h2>Ruang belajar yang mengikuti proses Anda</h2>
                  </div>
                </div>
                <div className="method-grid">
                  <article>
                    <BookOpen />
                    <h3>Materi yang saling terhubung</h3>
                    <p>
                      Ikuti kurikulum bertahap dengan teks, video, dan latihan
                      sesuai kebutuhan materi.
                    </p>
                  </article>
                  <article>
                    <Check />
                    <h3>Umpan balik dari latihan</h3>
                    <p>
                      Kuis review membantu mengulang konsep. Tes wajib
                      memastikan prasyarat terpenuhi sebelum lanjut.
                    </p>
                  </article>
                  <article>
                    <Users />
                    <h3>Tempat untuk bertanya</h3>
                    <p>
                      Diskusikan kendala di ruang mentor dan ikuti sesi online
                      atau tatap muka sesuai jadwal course.
                    </p>
                  </article>
                </div>
              </div>
            </section>
          </>
        )}
        {view === "catalog" && (
          <section className="portal-container portal-section catalog-page">
            <div className="eyebrow teal">JALUR BELAJAR STEM</div>
            <h1>Temukan course Anda</h1>
            <p className="portal-intro">
              Pilih topik dan tingkat yang sesuai, lalu lihat tujuan belajar
              serta kurikulumnya.
            </p>
            <div className="catalog-workspace">
              <aside className="catalog-filters">
                <h2>
                  <SlidersHorizontal size={18} />
                  Filter course
                </h2>
                <label>
                  Bidang
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                  >
                    <option value="">Semua bidang</option>
                    {Array.from(new Set(courses.map((c) => c.category)))
                      .filter(Boolean)
                      .map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                  </select>
                </label>
                <label>
                  Tingkat
                  <select
                    value={level}
                    onChange={(e) => setLevel(e.target.value)}
                  >
                    <option value="">Semua tingkat</option>
                    {Array.from(new Set(courses.map((c) => c.level)))
                      .filter(Boolean)
                      .map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                  </select>
                </label>
                <label>
                  Format belajar
                  <select
                    value={mode}
                    onChange={(e) => setMode(e.target.value)}
                  >
                    <option value="">Semua format</option>
                    <option value="self_paced">Belajar mandiri</option>
                    <option value="blended">Mandiri + sesi mentor</option>
                  </select>
                </label>
                <button className="secondary" onClick={reset}>
                  Reset filter
                </button>
              </aside>
              <div className="catalog-results">
                <label className="catalog-search">
                  <Search size={19} />
                  <input
                    type="search"
                    aria-label="Cari course"
                    placeholder="Cari judul, topik, atau kata kunci…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </label>
                <p className="catalog-count" aria-live="polite">
                  {data
                    ? `${filtered.length} course ditemukan`
                    : "Memuat course…"}
                </p>
                {loading ? (
                  <Loading />
                ) : error ? (
                  <ErrorBox error={error} retry={load} />
                ) : !courses.length ? (
                  <EmptyCourses />
                ) : filtered.length ? (
                  <div className="catalog-grid">
                    {filtered.map((c) => (
                      <CourseCard key={c.id} course={c} />
                    ))}
                  </div>
                ) : (
                  <div className="portal-empty">
                    <Search size={30} />
                    <h3>Belum ada course yang cocok</h3>
                    <p>Coba kata kunci lain atau hapus filter.</p>
                    <button className="secondary" onClick={reset}>
                      Tampilkan semua course
                    </button>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}
        {view === "detail" &&
          (loading ? (
            <div className="portal-container portal-section">
              <Loading />
            </div>
          ) : error ? (
            <div className="portal-container portal-section">
              <ErrorBox error={error} retry={load} />
            </div>
          ) : !current ? (
            <section className="portal-container portal-section portal-empty">
              <BookOpen size={32} />
              <h1>Course belum tersedia</h1>
              <p>Course ini belum diterbitkan atau sudah tidak tersedia.</p>
              <a className="primary button-link" href="/courses">
                Kembali ke katalog
              </a>
            </section>
          ) : (
            <CourseDetail course={current} data={data!} />
          ))}
      </main>
      <footer className="portal-footer">
        <div className="portal-container">
          <div>
            <a className="portal-brand" href="/">
              <span>
                <Layers3 size={22} />
              </span>
              <b>
                Ruang<span> STEM</span>
              </b>
            </a>
            <p>Belajar konsep. Berlatih. Bangun pemahaman.</p>
          </div>
          <nav aria-label="Navigasi footer">
            <a href="/courses">Katalog course</a>
            <a href="/learn">Ruang belajar</a>
            {data?.user?.role === "owner" && (
              <a href="/learn?view=admin">Kelola course</a>
            )}
          </nav>
          <span>© {new Date().getFullYear()} Ruang STEM</span>
        </div>
      </footer>
    </div>
  );
}
function Loading() {
  return (
    <div className="portal-empty" role="status">
      <Loader2 className="spin" size={25} />
      <p>Memuat course…</p>
    </div>
  );
}
function ErrorBox({ error, retry }: { error: string; retry: () => void }) {
  return (
    <div className="portal-empty" role="alert">
      <h3>Katalog belum dapat ditampilkan</h3>
      <p>{error}</p>
      <button className="secondary" onClick={retry}>
        Coba lagi
      </button>
    </div>
  );
}
function CourseDetail({
  course: c,
  data,
}: {
  course: CatalogCourse;
  data: CatalogState;
}) {
  const modules = Array.from(new Set(c.curriculum.map((l) => l.module)));
  const sessions = data.sessions.filter((s) => s.courseId === c.id);
  const [joining, setJoining] = useState(false), [joinError, setJoinError] = useState("");
  const login = `/login?return_to=${encodeURIComponent(learnUrl(c))}`;
  const register = `/register?return_to=${encodeURIComponent(learnUrl(c))}`;
  async function requestEnrollment() {
    setJoining(true); setJoinError("");
    try {
      const r = await fetch("/api/account", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "enroll", courseId: c.id }) });
      const result = await r.json() as { error?: string };
      if (!r.ok) throw new Error(result.error || "Pendaftaran course belum tersimpan.");
      location.assign(data.user?.accessStatus === "pending" ? "/access" : "/dashboard");
    } catch (e) { setJoinError(e instanceof Error ? e.message : "Pendaftaran course belum berhasil."); }
    finally { setJoining(false); }
  }
  return (
    <>
      <section className="detail-hero">
        <div className="portal-container">
          <nav className="portal-breadcrumb" aria-label="Breadcrumb">
            <a href="/courses">Katalog course</a>
            <span>/</span>
            <span>{c.category || "STEM"}</span>
          </nav>
          <div className="detail-hero-grid">
            <div>
              <div className="catalog-tags">
                <span>{c.level}</span>
                <span>{format(c)}</span>
                {c.sample && <span>Course contoh</span>}
              </div>
              <h1>{c.title}</h1>
              <p>
                {c.description ||
                  "Pelajari kurikulum course berikut untuk menemukan langkah belajar Anda."}
              </p>
              <div className="detail-meta">
                <span>
                  <BookOpen size={18} />
                  {c.lessonCount} materi
                </span>
                <span>
                  <Clock3 size={18} />
                  {duration(c.minutes)} estimasi materi
                </span>
                <span>
                  <Layers3 size={18} />
                  {modules.length} modul
                </span>
              </div>
            </div>
            <div className="detail-category">
              <CategoryIcon category={c.category} size={60} />
              <span>{c.category || "STEM"}</span>
            </div>
          </div>
        </div>
      </section>
      <div className="portal-container detail-body">
        <div className="detail-main">
          <nav className="detail-section-nav" aria-label="Bagian course">
            <a href="#tujuan">Tujuan belajar</a>
            <a href="#kurikulum">Kurikulum</a>
            <a href="#mentor">Tutor & sesi</a>
          </nav>
          {c.sample && (
            <div className="detail-note">
              Ini course contoh untuk mencoba pengalaman belajar. Pengajar dapat
              mengganti materi dan informasi course melalui admin.
            </div>
          )}
          <section id="tujuan">
            <div className="eyebrow teal">HASIL BELAJAR</div>
            <h2>Yang akan Anda pelajari</h2>
            {c.overview.outcomes.length ? (
              <ul className="outcome-list">
                {c.overview.outcomes.map((s, i) => (
                  <li key={i}>
                    <Check size={18} />
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="detail-unfilled">
                Tujuan belajar belum ditambahkan oleh pengajar.
              </p>
            )}
            <div className="detail-preparation">
              <article>
                <h3>Untuk siapa course ini?</h3>
                <p>
                  {c.overview.audience ||
                    "Pengajar belum menambahkan keterangan peserta yang dituju."}
                </p>
              </article>
              <article>
                <h3>Persiapan sebelum mulai</h3>
                {c.overview.requirements.length ? (
                  <ul>
                    {c.overview.requirements.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                ) : (
                  <p>Prasyarat dan kebutuhan alat belum ditambahkan.</p>
                )}
              </article>
            </div>
          </section>
          <section id="kurikulum">
            <div className="portal-section-title">
              <div>
                <div className="eyebrow teal">LANGKAH DEMI LANGKAH</div>
                <h2>Kurikulum course</h2>
              </div>
              <span className="pill">{c.lessonCount} materi</span>
            </div>
            <div className="curriculum-list">
              {modules.map((m, index) => (
                <details key={m} open={index === 0}>
                  <summary>
                    <span>{m}</span>
                    <span>
                      {c.curriculum.filter((l) => l.module === m).length} materi
                    </span>
                  </summary>
                  <ol>
                    {c.curriculum
                      .filter((l) => l.module === m)
                      .map((l) => (
                        <li key={l.id}>
                          <div>
                            {l.coding ? (
                              <Code2 size={17} />
                            ) : (
                              <BookOpen size={17} />
                            )}
                            <span>
                              {l.title}
                              <small>
                                {l.coding
                                  ? "Latihan kode"
                                  : l.quiz
                                    ? "Materi & kuis"
                                    : "Materi"}
                                {l.required ? " · Wajib lulus" : ""}
                              </small>
                            </span>
                          </div>
                          <span>{l.minutes} menit</span>
                        </li>
                      ))}
                  </ol>
                </details>
              ))}
            </div>
          </section>
          <section id="mentor">
            <div className="eyebrow teal">PENDAMPINGAN</div>
            <h2>Tutor & sesi belajar</h2>
            <article className="detail-mentor">
              <span className="mentor-icon">
                <Users size={26} />
              </span>
              <div>
                <h3>
                  {c.overview.mentorName || "Profil mentor sedang disiapkan"}
                </h3>
                <p>
                  {c.overview.mentorBio ||
                    "Informasi mentor akan tampil setelah ditambahkan oleh pengajar."}
                </p>
              </div>
            </article>
            <h3>Sesi yang akan datang</h3>
            {sessions.length ? (
              <div className="detail-sessions">
                {sessions.map((s) => (
                  <article key={s.id}>
                    <span>
                      {s.kind === "online" ? (
                        <Video size={20} />
                      ) : (
                        <MapPin size={20} />
                      )}
                    </span>
                    <div>
                      <h3>{s.title}</h3>
                      <p>
                        {when(s.startsAt)} · {s.duration} menit
                      </p>
                      <p>
                        {s.kind === "online"
                          ? "Live online"
                          : `Tatap muka · ${s.location}`}{" "}
                        · {s.count}/{s.capacity} peserta
                      </p>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <p className="detail-unfilled">
                Belum ada sesi terjadwal untuk course ini. Anda tetap dapat
                bertanya melalui diskusi materi.
              </p>
            )}
          </section>
        </div>
        <aside className="detail-start">
          <div className="detail-start-card">
            <CategoryIcon category={c.category} size={34} />
            <h2>Mulai langkah pertama</h2>
            <p>
              Ikuti materi sesuai urutan dan simpan progres belajar dalam akun
              Anda.
            </p>
            <dl>
              <div>
                <dt>Level</dt>
                <dd>{c.level}</dd>
              </div>
              <div>
                <dt>Format</dt>
                <dd>{format(c)}</dd>
              </div>
              <div>
                <dt>Latihan</dt>
                <dd>
                  {c.quizzes} kuis · {c.exercises} latihan kode
                </dd>
              </div>
              <div>
                <dt>Pendampingan</dt>
                <dd>Diskusi per materi</dd>
              </div>
            </dl>
            {!data.user ? <>
              <a className="primary button-link" href={register}>Daftar course</a>
              <a className="portal-text-link" href={login}>Sudah punya akun? Masuk</a>
              <small>Akun Siswa dan pilihan course Anda disimpan. Akses belajar dibuka setelah persetujuan Super Admin.</small>
            </> : data.user.accessStatus === "suspended" ? <a className="primary button-link" href="/access">Lihat status akun</a> : <>
              <button className="primary" disabled={joining} onClick={requestEnrollment}>{joining ? "Mendaftarkan…" : "Daftar course"}</button>
              <small>{data.user.accessStatus === "pending" ? "Pilihan course disimpan sambil menunggu persetujuan Super Admin." : "Course akan masuk ke dashboard belajar Anda."}</small>
            </>}
            {joinError && <p className="error" role="alert">{joinError}</p>}
            <a
              className="portal-text-link"
              href={`/learn?view=sessions&course=${encodeURIComponent(c.id)}`}
            >
              Lihat jadwal mentor
            </a>
          </div>
        </aside>
      </div>
    </>
  );
}
