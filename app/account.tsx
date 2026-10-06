"use client";
import { useEffect, useRef, useState } from "react";
import {
  BookOpen,
  Layers3,
  LayoutDashboard,
  UserRound,
  CalendarDays,
  LogOut,
  Search,
  GraduationCap,
  CheckCircle2,
  Clock3,
  Video,
  MapPin,
  Save,
  Loader2,
  Check,
  Settings2,
  Users,
} from "lucide-react";
import type { AccountState, Profile, DashboardCourse } from "@/lib/account";
import "./account.css";
import ProjectSummary from "./project-summary";
async function request(body?: unknown): Promise<any> {
  const r = await fetch(
    "/api/account",
    body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : { cache: "no-store" },
  );
  const d = (await r.json()) as any;
  if (!r.ok)
    throw Object.assign(new Error(d.error || "Permintaan belum berhasil."), {
      status: r.status,
    });
  return d;
}
const interests = [
  "Sains",
  "Matematika",
  "Coding",
  "Cyber Security",
  "Embedded Systems",
  "Digital Signal Processing",
] as const;
const date = (value: string) =>
  new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  }).format(new Date(value)) + " WIB";
const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0])
    .join("")
    .toUpperCase() || "ST";
const resumeLink = (c: DashboardCourse) =>
  `/learn?course=${encodeURIComponent(c.id)}${c.resumeLesson ? `&lesson=${encodeURIComponent(c.resumeLesson)}` : ""}`;
export default function Account({
  view,
  join,
}: {
  view: "dashboard" | "profile";
  join?: string;
}) {
  const [data, setData] = useState<AccountState | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [form, setForm] = useState<Profile | null>(null),
    [dirty, setDirty] = useState(false),
    [saved, setSaved] = useState(""),
    [filter, setFilter] = useState("all");
  const started = useRef(false);
  async function load() {
    const d = await request();
    setData(d);
    setForm(d.profile);
    setDirty(false);
  }
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    async function init() {
      try {
        if (join) {
          await request({ action: "enroll", courseId: join });
          history.replaceState(null, "", "/dashboard");
          setSaved("Course sudah masuk ke daftar belajar Anda.");
        }
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Data belum dapat dimuat.");
      }
    }
    void init();
  }, []);
  useEffect(() => {
    const prevent = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [dirty]);
  function guard(e: React.MouseEvent<HTMLAnchorElement>) {
    if (
      dirty &&
      !confirm(
        "Tinggalkan halaman dan abaikan perubahan profil yang belum disimpan?",
      )
    )
      e.preventDefault();
  }
  function patch(p: Partial<Profile>) {
    if (form) {
      setForm({ ...form, ...p });
      setDirty(true);
      setSaved("");
    }
  }
  async function reload() {
    if (
      dirty &&
      !confirm("Muat ulang dan abaikan perubahan profil yang belum disimpan?")
    )
      return;
    setError("");
    try {
      if (!data && join) await request({ action: "enroll", courseId: join });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Data belum dapat dimuat.");
    }
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setBusy(true);
    setError("");
    try {
      const d = await request({ action: "saveProfile", profile: form });
      setForm(d.profile);
      setDirty(false);
      setSaved("Profil tersimpan.");
      setData((prev) =>
        prev
          ? {
              ...prev,
              profile: d.profile,
              user: { ...prev.user, name: d.profile.displayName },
            }
          : prev,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Profil belum tersimpan.");
    } finally {
      setBusy(false);
    }
  }
  const courses = (data?.courses || []).filter(
    (c) =>
      filter === "all" || (filter === "finished" ? c.finished : !c.finished),
  );
  const name = form?.displayName || data?.user.name || "Peserta";
  return (
    <div className="account-app">
      <a className="account-skip" href="#account-main">
        Lewati ke konten
      </a>
      <header className="account-header">
        <a className="account-brand" href="/" onClick={guard}>
          <span>
            <Layers3 size={24} />
          </span>
          <b>
            STEM<span>studio</span>
          </b>
        </a>
        <a href="/courses" onClick={guard}>
          <Search size={17} />
          Jelajahi course
        </a>
        <div className="account-user">
          <span
            className={`account-avatar ${data?.profile.avatarColor || "teal"}`}
          >
            {initials(data?.user.name || "ST")}
          </span>
          <span>{data?.user.name || "Akun saya"}</span>
        </div>
      </header>
      <div className="account-layout">
        <aside className="account-sidebar">
          <span className="eyebrow">RUANG PESERTA</span>
          <nav aria-label="Navigasi akun">
            <a
              className={view === "dashboard" ? "selected" : ""}
              href="/dashboard"
              onClick={guard}
            >
              <LayoutDashboard size={19} />
              Dashboard
            </a>
            <a
              className={view === "profile" ? "selected" : ""}
              href="/profile"
              onClick={guard}
            >
              <UserRound size={19} />
              Profil saya
            </a>
            <a href="/classes" onClick={guard}>
              <Users size={19} />
              Kelas & mentor
            </a>
            <a href="/learn?view=sessions" onClick={guard}>
              <CalendarDays size={19} />
              Sesi mentor
            </a>
            <a href="/courses" onClick={guard}>
              <BookOpen size={19} />
              Katalog course
            </a>
            {data?.user.role === "owner" && (
              <a href="/learn?view=admin" onClick={guard}>
                <Settings2 size={19} />
                Kelola course
              </a>
            )}
          </nav>
          <div className="account-sidebar-bottom">
            <p>
              Satu langkah belajar,
              <br />
              satu pemahaman baru.
            </p>
            <a href="/signout-with-chatgpt?return_to=/" onClick={guard}>
              <LogOut size={17} />
              Keluar
            </a>
          </div>
        </aside>
        <main id="account-main" className="account-main">
          <div className="account-page-heading">
            <div>
              <div className="eyebrow teal">
                {view === "dashboard"
                  ? "PERJALANAN BELAJAR ANDA"
                  : "AKUN PESERTA"}
              </div>
              <h1>
                {view === "dashboard"
                  ? `Selamat datang${data ? ", " + data.user.name.split(" ")[0] : ""}.`
                  : "Profil saya"}
              </h1>
              <p>
                {view === "dashboard"
                  ? "Lanjutkan course Anda dan siapkan waktu untuk belajar bersama mentor."
                  : "Lengkapi informasi dan tujuan belajar Anda."}
              </p>
            </div>
            {view === "profile" && data && (
              <span className="pill">
                {data.user.role === "owner" ? "Pengelola" : "Peserta"}
              </span>
            )}
          </div>
          {error && (
            <div className="feedback warning" role="alert">
              {error}
              <button className="secondary" onClick={reload}>
                Muat ulang
              </button>
            </div>
          )}
          {saved && (
            <div className="feedback success" role="status">
              <Check size={17} />
              {saved}
            </div>
          )}
          {!data ? (
            !error && (
              <div className="account-empty" role="status">
                <Loader2 className="spin" />
                Memuat data akun…
              </div>
            )
          ) : view === "dashboard" ? (
            <>
              <section className="account-stats" aria-label="Ringkasan belajar">
                <div>
                  <BookOpen />
                  <strong>{data.courses.length}</strong>
                  <span>Course diikuti</span>
                </div>
                <div>
                  <CheckCircle2 />
                  <strong>
                    {data.courses.reduce((n, c) => n + c.completed, 0)}
                  </strong>
                  <span>Materi selesai</span>
                </div>
                <div>
                  <GraduationCap />
                  <strong>
                    {data.courses.filter((c) => c.finished).length}
                  </strong>
                  <span>Course selesai</span>
                </div>
                <div>
                  <CalendarDays />
                  <strong>{data.sessions.length}</strong>
                  <span>Sesi akan datang</span>
                </div>
              </section>
              <ProjectSummary projects={data.projects || []} />
              <section className="account-course-section">
                <div className="account-section-heading">
                  <h2>Course saya</h2>
                  <div
                    className="account-filter"
                    role="group"
                    aria-label="Filter course saya"
                  >
                    {[
                      ["all", "Semua"],
                      ["active", "Dalam proses"],
                      ["finished", "Selesai"],
                    ].map(([key, label]) => (
                      <button
                        key={key}
                        aria-pressed={filter === key}
                        className={filter === key ? "selected" : ""}
                        onClick={() => setFilter(key)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                {courses.length ? (
                  <div className="account-course-grid">
                    {courses.map((c) => (
                      <article className="account-course" key={c.id}>
                        <div className="account-course-top">
                          <span className="account-course-icon">
                            <BookOpen size={25} />
                          </span>
                          <span className="pill">
                            {c.finished
                              ? "Selesai"
                              : c.percent
                                ? "Dalam proses"
                                : "Siap dimulai"}
                          </span>
                        </div>
                        <div className="eyebrow teal">
                          {c.category || "STEM"}
                        </div>
                        <h3>{c.title}</h3>
                        <p className="account-course-meta">
                          {c.level} · {c.lessonCount} materi
                          {c.sample ? " · Course contoh" : ""}
                        </p>
                        <div className="account-progress-label">
                          <span>
                            {c.completed}/{c.lessonCount} materi selesai
                          </span>
                          <strong>{c.percent}%</strong>
                        </div>
                        <progress
                          aria-label={`Progres ${c.title}`}
                          value={c.completed}
                          max={c.lessonCount || 1}
                        />
                        {c.stale > 0 && (
                          <p className="account-stale">
                            {c.stale} materi berubah dan perlu ditinjau kembali.
                          </p>
                        )}
                        <div className="account-course-actions">
                          <a
                            className="primary button-link"
                            href={resumeLink(c)}
                          >
                            {c.finished ? "Tinjau course" : "Lanjutkan belajar"}
                          </a>
                          <a href={`/courses/${encodeURIComponent(c.id)}`}>
                            Detail course
                          </a>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="account-empty">
                    <BookOpen size={32} />
                    <h3>
                      {data.courses.length
                        ? "Belum ada course pada kategori ini"
                        : "Mulai perjalanan belajar Anda"}
                    </h3>
                    <p>
                      {data.courses.length
                        ? "Pilih filter Semua untuk melihat daftar course."
                        : "Jelajahi katalog, buka detail course, lalu pilih Mulai belajar."}
                    </p>
                    <a className="primary button-link" href="/courses">
                      Jelajahi course
                    </a>
                  </div>
                )}
              </section>
              <section className="account-session-section">
                <div className="account-section-heading">
                  <div>
                    <div className="eyebrow teal">BELAJAR BERSAMA</div>
                    <h2>Jadwal mentor saya</h2>
                  </div>
                  <a href="/learn?view=sessions">Lihat semua sesi</a>
                </div>
                {data.sessions.length ? (
                  <div className="account-sessions">
                    {data.sessions.map((s) => (
                      <article key={s.id}>
                        <div className="account-session-icon">
                          {s.kind === "online" ? (
                            <Video size={23} />
                          ) : (
                            <MapPin size={23} />
                          )}
                        </div>
                        <div>
                          <span>
                            {s.className
                              ? `${s.className} · ${s.courseTitle}`
                              : s.courseTitle}
                          </span>
                          <h3>{s.title}</h3>
                          <p>
                            <Clock3 size={15} />
                            {date(s.startsAt)} · {s.duration} menit
                          </p>
                          <small>
                            {s.kind === "online"
                              ? "Live online"
                              : `Tatap muka · ${s.location}`}
                          </small>
                        </div>
                        {s.kind === "online" ? (
                          <a
                            className="secondary button-link"
                            href={s.url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Buka meeting
                          </a>
                        ) : (
                          <a
                            className="secondary button-link"
                            href={
                              s.classId
                                ? `/classes?class=${encodeURIComponent(s.classId)}`
                                : "/learn?view=sessions"
                            }
                          >
                            Lihat sesi
                          </a>
                        )}
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="account-session-empty">
                    <CalendarDays size={24} />
                    <div>
                      <h3>Belum ada sesi yang Anda ikuti</h3>
                      <p>
                        Daftar pada jadwal mentor untuk menampilkannya di sini.
                      </p>
                    </div>
                  </div>
                )}
              </section>
            </>
          ) : (
            form && (
              <form className="profile-form" onSubmit={save}>
                <div className="profile-grid">
                  <aside className="profile-card">
                    <span className={`profile-avatar ${form.avatarColor}`}>
                      {initials(name)}
                    </span>
                    <h2>{name}</h2>
                    <p>{form.institution || "Institusi belum ditambahkan"}</p>
                    <span className="pill">
                      {data.user.role === "owner"
                        ? "Pengelola platform"
                        : "Peserta STEM Studio"}
                    </span>
                    <div className="profile-colors">
                      <span>Warna avatar</span>
                      <div role="group" aria-label="Warna avatar">
                        {[
                          ["teal", "Hijau"],
                          ["blue", "Biru"],
                          ["violet", "Ungu"],
                        ].map(([key, label]) => (
                          <button
                            key={key}
                            type="button"
                            aria-label={`Avatar ${label}`}
                            aria-pressed={form.avatarColor === key}
                            className={key}
                            onClick={() =>
                              patch({
                                avatarColor: key as Profile["avatarColor"],
                              })
                            }
                          >
                            {form.avatarColor === key && <Check size={17} />}
                          </button>
                        ))}
                      </div>
                    </div>
                    <small>
                      Nama tampilan digunakan pada diskusi bersama mentor.
                    </small>
                  </aside>
                  <div className="profile-fields">
                    <section>
                      <h2>Informasi diri</h2>
                      <p className="profile-section-intro">
                        Email mengikuti akun yang Anda gunakan untuk masuk.
                      </p>
                      <div className="profile-field-grid">
                        <label>
                          Nama tampilan
                          <input
                            required
                            maxLength={100}
                            value={form.displayName}
                            onChange={(e) =>
                              patch({ displayName: e.target.value })
                            }
                            autoComplete="nickname"
                          />
                        </label>
                        <label>
                          Email akun
                          <input
                            readOnly
                            value={data.user.email}
                            type="email"
                          />
                          <small>Dikelola melalui akun ChatGPT Anda.</small>
                        </label>
                        <label className="profile-wide">
                          Institusi atau organisasi
                          <input
                            maxLength={160}
                            value={form.institution}
                            onChange={(e) =>
                              patch({ institution: e.target.value })
                            }
                            placeholder="Opsional"
                            autoComplete="organization"
                          />
                        </label>
                        <label className="profile-wide">
                          Tentang saya
                          <textarea
                            rows={3}
                            maxLength={1000}
                            value={form.bio}
                            onChange={(e) => patch({ bio: e.target.value })}
                            placeholder="Ceritakan latar belakang dan pengalaman Anda."
                          />
                        </label>
                      </div>
                    </section>
                    <section>
                      <h2>Arah belajar</h2>
                      <fieldset>
                        <legend>Bidang yang diminati</legend>
                        <div className="profile-interests">
                          {interests.map((s) => (
                            <label key={s}>
                              <input
                                type="checkbox"
                                checked={form.interests.includes(s)}
                                onChange={(e) =>
                                  patch({
                                    interests: e.target.checked
                                      ? [...form.interests, s]
                                      : form.interests.filter((x) => x !== s),
                                  })
                                }
                              />
                              {s}
                            </label>
                          ))}
                        </div>
                      </fieldset>
                      <label>
                        Tujuan belajar
                        <textarea
                          rows={4}
                          maxLength={1500}
                          value={form.goal}
                          onChange={(e) => patch({ goal: e.target.value })}
                          placeholder="Apa yang ingin Anda pahami atau bangun?"
                        />
                      </label>
                      <p className="profile-private">
                        Tentang saya, institusi, minat, dan tujuan belajar hanya
                        ditampilkan di profil akun Anda.
                      </p>
                    </section>
                    <div className="profile-save-bar">
                      <span>
                        {dirty
                          ? "Ada perubahan yang belum disimpan"
                          : "Semua perubahan tersimpan"}
                      </span>
                      <div>
                        <button
                          type="button"
                          className="secondary"
                          disabled={!dirty || busy}
                          onClick={() => {
                            setForm(data.profile);
                            setDirty(false);
                            setError("");
                          }}
                        >
                          Batalkan
                        </button>
                        <button
                          type="submit"
                          className="primary"
                          disabled={!dirty || busy}
                        >
                          <Save size={17} />
                          {busy ? "Menyimpan…" : "Simpan profil"}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </form>
            )
          )}
        </main>
      </div>
    </div>
  );
}
