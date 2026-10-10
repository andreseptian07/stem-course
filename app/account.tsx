"use client";
import Link from "next/link";
import {responseJson} from "@/lib/client-fetch";
import {useUnsavedNavigation} from "./use-unsaved-navigation";
import AccountFrame from "./account-frame";
import type {NavigationUser} from "@/lib/account-navigation";

import { PrivatePhoto, PhotoControl } from "./media-controls";
import { useEffect, useRef, useState } from "react";
import { BookOpen, CalendarDays, GraduationCap, CheckCircle2, Clock3, Video, MapPin, Save, Loader2, Check, RefreshCw } from "lucide-react";
import type { AccountState, Profile, DashboardCourse } from "@/lib/account";
import "./account.css";
import ProjectSummary from "./project-summary";
import TutorSummary from "./tutor-summary";
async function request<T = AccountState>(body?: unknown): Promise<T> {
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
  return responseJson<T>(r, !!body);
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
    .toUpperCase() || "RS";
const resumeLink = (c: DashboardCourse) =>
  `/learn?course=${encodeURIComponent(c.id)}${c.classId?`&class=${encodeURIComponent(c.classId)}`:""}${c.resumeLesson ? `&lesson=${encodeURIComponent(c.resumeLesson)}` : ""}`;
export default function Account({
  view,
  join,
  navigation,
}: {
  view: "dashboard" | "profile";
  join?: string;
  navigation: NavigationUser;
}) {
  const [refreshing, setRefreshing] = useState(false);
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
  const {guard,dialog: leaveDialog} = useUnsavedNavigation(dirty,()=>{if(data)setForm(data.profile);setDirty(false);},"Perubahan profil belum tersimpan. Tetap di halaman untuk menyimpan atau lanjutkan tanpa perubahan ini.");
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
    setRefreshing(true);
    try {
      if (!data && join) await request({ action: "enroll", courseId: join });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Data belum dapat dimuat.");
      if (e && typeof e === "object" && "status" in e && [401, 403].includes(Number(e.status))) {
        setData(null);
        setForm(null);
        setDirty(false);
      }
    } finally {
      setRefreshing(false);
    }
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setBusy(true);
    setError("");
    try {
      const d = await request<{profile:Profile}>({ action: "saveProfile", profile: form });
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
  const name = form?.displayName || data?.user.name || navigation.name;
  const learner=data ? data.user.kind === "student" && !data.user.owner : navigation.kind === "student" && !navigation.owner;
  const teaching = data?.teaching && !learner;
  return (
    <AccountFrame user={{...navigation,name:data?.user.name || navigation.name}} current={view} onNavigate={guard}>
      {leaveDialog}
          <div className="account-page-heading">
            <div>
              <div className="eyebrow teal">
                {view === "dashboard"
                  ? !learner ? "RUANG KERJA ANDA" : "PERJALANAN BELAJAR ANDA"
                  : "PROFIL AKUN"}
              </div>
              <h1>
                {view === "dashboard"
                  ? `Selamat datang${data ? ", " + data.user.name.split(" ")[0] : ""}.`
                  : "Profil saya"}
              </h1>
              <p>
                {view === "dashboard"
                  ? !learner ? "Kelola pekerjaan sesuai izin dan penugasan Anda." : "Lanjutkan course Anda dan siapkan waktu untuk belajar bersama mentor."
                  : learner ? "Lengkapi informasi dan tujuan belajar Anda." : "Lengkapi informasi profil kerja Anda."}
              </p>
            </div>
            {view === "dashboard" && data && <button type="button" className="secondary" onClick={reload} disabled={refreshing}><RefreshCw size={17} className={refreshing ? "spin" : undefined} />{refreshing ? "Memuat…" : "Muat ulang"}</button>}
            {view === "profile" && data && (
              <span className="pill">
                {data.user.role === "owner" ? "Super Admin" : data.user.role === "tutor" ? "Tutor" : data.curriculum ? "Tim Kurikulum" : learner ? "Siswa" : "Staf"}
              </span>
            )}
          </div>
          {error && (
            <div className="feedback warning" role="alert">
              {error}
              <button className="secondary" onClick={reload} disabled={refreshing}>
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
              {teaching ? <TutorSummary teaching={data.teaching!} owner={data.user.owner} /> : !learner ? <section className="account-empty"><h2>{data.curriculum ? "Ruang kerja Tim Kurikulum" : "Belum ada izin kerja aktif"}</h2><p>{data.curriculum ? "Buka course yang ditugaskan untuk menyusun dan meninjau materi." : "Hubungi Super Admin untuk memperoleh izin dan penugasan kerja."}</p>{data.curriculum && <Link className="primary button-link" href="/curriculum">Buka Tim Kurikulum</Link>}</section> : <>
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
                  <span>Tahap lulus di seluruh kelas</span>
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
                            {c.completed}/{c.lessonCount} tahap lulus{c.classResults.length>1?" di seluruh kelas":""}
                          </span>
                          <strong>{c.percent}%</strong>
                        </div>
                        <progress
                          aria-label={`Progres ${c.title}`}
                          value={c.completed}
                          max={c.lessonCount || 1}
                        />
                        {c.classResults.map(result=><p key={result.classId} className="account-course-meta"><Link href={`/learn?course=${encodeURIComponent(c.id)}&class=${encodeURIComponent(result.classId||"")}`}>{result.className}: {result.completed}/{result.total} tahap lulus</Link></p>)}
                        {c.stale > 0 && (
                          <p className="account-stale">
                            {c.stale} materi berubah dan perlu ditinjau kembali.
                          </p>
                        )}
                        <div className="account-course-actions">
                          <Link
                            className="primary button-link"
                            href={resumeLink(c)}
                          >
                            {c.graduation.problem?.code==="CLASS_CONTEXT_REQUIRED"?"Pilih kelas belajar":c.finished ? "Tinjau course" : "Lanjutkan belajar"}
                          </Link>
                          <Link href={`/courses/${encodeURIComponent(c.id)}`}>
                            Detail course
                          </Link>
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
                        : "Jelajahi katalog, buka detail course, lalu pilih Daftar course."}
                    </p>
                    {data.courses.length ? <button className="primary" type="button" onClick={() => setFilter("all")}>Tampilkan semua course saya</button> : <Link className="primary button-link" href="/courses">Jelajahi course</Link>}
                  </div>
                )}
              </section>
              <section className="account-session-section">
                <div className="account-section-heading">
                  <div>
                    <div className="eyebrow teal">BELAJAR BERSAMA</div>
                    <h2>Jadwal mentor saya</h2>
                  </div>
                  <Link href="/learn?view=sessions">Lihat semua sesi</Link>
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
                          <Link
                            className="secondary button-link"
                            href={s.url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Buka meeting
                          </Link>
                        ) : (
                          <Link
                            className="secondary button-link"
                            href={
                              s.classId
                                ? `/classes?class=${encodeURIComponent(s.classId)}`
                                : "/learn?view=sessions"
                            }
                          >
                            Lihat sesi
                          </Link>
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
              </>}
            </>
          ) : (
            form && (
              <form className="profile-form" onSubmit={save}>
                <div className="profile-grid">
                  <aside className="profile-card">
                    <PrivatePhoto key={data.photo?.id || "initials"} className={`profile-avatar ${form.avatarColor}`} url={data.photo?.url || null} fallback={initials(name)} />
                    <PhotoControl photo={data.photo || null} disabled={busy} onBusy={setBusy} onError={setError} onNotice={setSaved} onChange={(photo) => setData((current) => current ? {...current,photo} : current)} />
                    <h2>{name}</h2>
                    <p>{form.institution || "Institusi belum ditambahkan"}</p>
                    <span className="pill">
                      {data.user.role === "owner"
                        ? "Pengelola platform"
                        : learner ? "Peserta Ruang STEM" : "Staf Ruang STEM"}
                    </span>
                    <div className="profile-colors">
                      <span>{data.photo ? "Warna avatar inisial" : "Warna avatar"}</span>
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
                          <small>Email akun tidak dapat diubah melalui halaman profil.</small><Link href="/password">Ganti password</Link>
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
                    {learner && (
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
                    )}
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
    </AccountFrame>
  );
}
