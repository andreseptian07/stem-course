"use client";
import {useUnsavedNavigation} from "./use-unsaved-navigation";
import AccountFrame from "./account-frame";
import type {NavigationUser} from "@/lib/account-navigation";

import { useState, useEffect, useRef, useCallback } from "react";
import { Users, CalendarDays, ArrowLeft, Plus, Video, MapPin, MessageCircle, GraduationCap, RefreshCw } from "lucide-react";
import Link from "next/link";
import {browserModelContext} from "@/lib/browser-tools";
import {responseJson, clientFetch} from "@/lib/client-fetch";
import type {ClassList,ClassDetail,ClassSummary,ClassSession} from "@/lib/client-dto";
import type { ClassForm } from "@/lib/classes";
import Projects from "./projects";
import "./account.css";
import "./classroom.css";
const date = (s: string | null) =>
  s
    ? new Intl.DateTimeFormat("id-ID", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Jakarta",
      }).format(new Date(s)) + " WIB"
    : "Belum ditentukan";
const statuses: Record<string, string> = {
  open: "Pendaftaran dibuka",
  active: "Kelas berjalan",
  archived: "Diarsipkan",
  pending: "Menunggu persetujuan",
  approved: "Peserta",
  declined: "Permintaan ditolak",
  removed: "Keanggotaan berakhir",
};
function api(): Promise<ClassList>;
function api(body: undefined, id: string): Promise<ClassDetail>;
function api(body: unknown): Promise<{id:string}>;
async function api(body?: unknown, id?: string) {
  const r = await clientFetch(
    "/api/classes" + (id ? "?class=" + encodeURIComponent(id) : ""),
    body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : { cache: "no-store" },
  );
  return responseJson<unknown>(r, !!body);
}
function Label({
  name,
  children,
}: {
  name: string;
  children: React.ReactNode;
}) {
  return (
    <label className="class-field">
      <span>{name}</span>
      {children}
    </label>
  );
}
const local = (s: string | null) => {
  if (!s) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(s));
  const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
};
const iso = (s: string) => (s ? new Date(s + ":00+07:00").toISOString() : null);
export default function Classes({navigation}:{navigation:NavigationUser}) {
  const [data, setData] = useState<ClassList | null>(null),
    [detail, setDetail] = useState<ClassDetail | null>(null),
    [id, setId] = useState(""),
    [error, setError] = useState(""),
    [backgroundError, setBackgroundError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [filter, setFilter] = useState("mine"),
    [form, setForm] = useState<ClassForm | null>(null),
    [dirty, setDirty] = useState(false),
    [body, setBody] = useState(""),
    [kind, setKind] = useState("discussion"),
    [student, setStudent] = useState(""),
    [invitee, setInvitee] = useState(""),
    [feedback, setFeedback] = useState(""),
    [session, setSession] = useState<ClassSession | null>(null);
  const initialized = useRef(false);
  const mutationInFlight = useRef(false);
  const load = useCallback(async (classId = id) => {
    const d = await api();
    setData(d);
    if (classId) setDetail(await api(undefined, classId));
    setBackgroundError("");
  }, [id]);
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    const selected = new URLSearchParams(location.search).get("class") || "";
    setId(selected);
    load(selected).catch((e) => setError(e.message));
  }, [load]);
  useEffect(() => {
    const timer = setInterval(() => {
      if (id && document.visibilityState === "visible")
        api(undefined, id)
          .then((next) => { setDetail(next); setBackgroundError(""); })
          .catch((e) => {
            if ([401, 403, 404].includes(e.status)) {
              setDetail(null);
              setForm(null);
              setSession(null);
              setDirty(false);
            }
            setBackgroundError(e.message);
          });
    }, 15000);
    return () => clearInterval(timer);
  }, [id]);
  useEffect(() => {
    const listener = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", listener);
    return () => window.removeEventListener("beforeunload", listener);
  }, [dirty]);
  const owner = data?.user.role === "owner",
    c = detail?.class,
    staff = c?.isStaff,
    archived = c?.status === "archived",
    member = staff || c?.membership === "approved";
  const approved =
    detail?.members?.filter((m) => m.status === "approved") || [];
  const cards =
    data?.classes?.filter(
      (c) =>
        filter === "all" ||
        c.isStaff ||
        c.membership === "approved" ||
        c.membership === "pending",
    ) || [];
  const toolsState = useRef({ cards, detail });
  useEffect(() => { toolsState.current = {cards,detail}; });
  useEffect(() => {
    const ctx = browserModelContext();
    if (!ctx?.registerTool) return;
    const lifecycle = new AbortController();
    Promise.resolve(
      ctx.registerTool(
        {
          name: "read_classroom_state",
          description:
            "Read the currently displayed class summaries, selected class, membership and staff status. Does not change enrollment, mentor assignments or send messages.",
          inputSchema: {
            type: "object",
            properties: {},
            additionalProperties: false,
          },
          annotations: { readOnlyHint: true, untrustedContentHint: true },
          execute: () => ({
            classes: toolsState.current.cards.map((c) => ({
              id: c.id,
              name: c.name,
              course: c.courseTitle,
              status: c.status,
              membership: c.membership,
              isMentor: c.isMentor,
            })),
            selected: toolsState.current.detail?.class
              ? {
                  name: toolsState.current.detail.class.name,
                  status: toolsState.current.detail.class.status,
                  membership: toolsState.current.detail.class.membership,
                  isStaff: toolsState.current.detail.class.isStaff,
                }
              : null,
          }),
        },
        { signal: lifecycle.signal },
      ),
    ).catch(() => {});
    return () => lifecycle.abort();
  }, []);
  async function mutate(payload: unknown, success: string) {
    if (mutationInFlight.current) return false;
    mutationInFlight.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api(payload);
      await load();
      setNotice(success);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Permintaan gagal.");
      return false;
    } finally {
      mutationInFlight.current = false;
      setBusy(false);
    }
  }
  function editClass(value?: ClassSummary) {
    if (value) {
      setForm({
        id: value.id,
        version: value.version,
        courseId: value.courseId,
        mentorId: value.mentorId || null,
        targetGrantVersion: value.mentorGrantVersion || 0,
        name: value.name,
        description: value.description,
        startsAt: value.startsAt,
        endsAt: value.endsAt,
        capacity: value.capacity,
        status: value.status,
      });
    } else {
      setForm({
        id: crypto.randomUUID(),
        version: 0,
        courseId: data?.courses[0]?.id || "",
        mentorId: null,
        targetGrantVersion: 0,
        name: "",
        description: "",
        startsAt: null,
        endsAt: null,
        capacity: 20,
        status: "open",
      });
    }
    setDirty(false);
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form || mutationInFlight.current) return;
    mutationInFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const r = await api({ action: "saveClass", class: form });
      setForm(null);
      setDirty(false);
      setId(r.id);
      history.replaceState(null, "", "/classes?class=" + r.id);
      await load(r.id);
      setNotice("Kelas tersimpan.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kelas belum tersimpan.");
    } finally {
      mutationInFlight.current = false;
      setBusy(false);
    }
  }
  function patch(p: Partial<ClassForm>) {
    setForm((prev) => (prev ? { ...prev, ...p } : prev));
    setDirty(true);
  }
  const {guard,dialog: leaveDialog} = useUnsavedNavigation(dirty,()=>setDirty(false),"Perubahan kelas belum tersimpan. Tetap di halaman untuk menyimpan atau lanjutkan tanpa perubahan ini.");
  return (
    <AccountFrame user={navigation} current="classes" mainId="classes-main" className="classes-main" onNavigate={guard}>
      {leaveDialog}
          <div className="account-page-heading">
            <div>
              <div className="eyebrow teal">KELAS & PENDAMPINGAN</div>
              <h1>{c ? c.name : navigation.kind === "student" && !navigation.owner ? "Kelas saya" : "Kelas & Tutor"}</h1>
              <p>
                {c
                  ? c.courseTitle
                  : navigation.kind === "student" && !navigation.owner ? "Ikuti kelas, diskusikan kendala, dan bangun proyek bersama." : "Kelola kelas, jadwal, dan pekerjaan peserta sesuai penugasan Anda."}
              </p>
            </div>
            <button
              className="class-outline"
              disabled={busy}
              onClick={() =>
                load()
                  .then(() => setError(""))
                  .catch((e) => setError(e.message))
              }
            >
              <RefreshCw size={16} />
              Muat ulang
            </button>
          </div>
          {(error || backgroundError) && (
            <div className="class-alert error" role="alert">
              {error || backgroundError}
            </div>
          )}
          {notice && (
            <div className="class-alert success" role="status">
              {notice}
            </div>
          )}
          {!data && !error && <p role="status">Menyiapkan kelas Anda…</p>}
          {form && (
            <section className="class-panel">
              <div className="class-section-head">
                <h2>{form.version ? "Pengaturan kelas" : "Buat kelas baru"}</h2>
              </div>
              <form onSubmit={save}>
                <div className="class-form-grid">
                  <Label name="Nama kelas">
                    <input
                      required
                      maxLength={160}
                      value={form.name}
                      onChange={(e) => patch({ name: e.target.value })}
                    />
                  </Label>
                  <Label name="Course">
                    <select
                      required
                      disabled={form.version > 0}
                      value={form.courseId}
                      onChange={(e) => patch({ courseId: e.target.value })}
                    >
                      <option value="">Pilih course</option>
                      {data?.courses?.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.title}
                          {!c.published ? " (draft)" : ""}
                        </option>
                      ))}
                    </select>
                  </Label>
                  <Label name="Mentor kelas">
                    <select
                      value={form.mentorId || ""}
                      onChange={(e) =>
                        patch({ mentorId:e.target.value||null,targetGrantVersion:data?.mentors?.find((u)=>u.id===e.target.value)?.grantVersion||0 })
                      }
                    >
                      <option value="">Belum ditugaskan</option>
                      {data?.mentors?.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name} · {u.id.slice(0, 8)}
                        </option>
                      ))}
                    </select>
                  </Label>
                  <Label name="Kapasitas peserta">
                    <input
                      type="number"
                      min={1}
                      max={500}
                      required
                      value={form.capacity}
                      onChange={(e) =>
                        patch({ capacity: Number(e.target.value) })
                      }
                    />
                  </Label>
                  <Label name="Mulai kelas (WIB)">
                    <input
                      type="datetime-local"
                      value={local(form.startsAt)}
                      onChange={(e) => patch({ startsAt: iso(e.target.value) })}
                    />
                  </Label>
                  <Label name="Selesai kelas (WIB)">
                    <input
                      type="datetime-local"
                      value={local(form.endsAt)}
                      onChange={(e) => patch({ endsAt: iso(e.target.value) })}
                    />
                  </Label>
                  <Label name="Status kelas">
                    <select
                      value={form.status}
                      onChange={(e) =>
                        patch({ status: e.target.value as ClassForm["status"] })
                      }
                    >
                      <option value="open">Pendaftaran dibuka</option>
                      <option value="active">Kelas berjalan</option>
                      <option value="archived">Diarsipkan</option>
                    </select>
                  </Label>
                </div>
                <Label name="Deskripsi kelas">
                  <textarea
                    rows={3}
                    maxLength={2000}
                    value={form.description}
                    onChange={(e) => patch({ description: e.target.value })}
                  />
                </Label>
                <p className="class-help">
                  Mentor dipilih dari akun yang sudah masuk ke platform. Course
                  draft belum bisa menerima permintaan peserta. Arsip
                  mempertahankan riwayat dan menutup aktivitas baru.
                </p>
                <div className="class-actions">
                  <button className="class-primary" disabled={busy}>
                    Simpan kelas
                  </button>
                  <button
                    type="button"
                    className="class-outline"
                    disabled={busy}
                    onClick={() => {
                      if (!dirty || confirm("Abaikan perubahan kelas?")) {
                        setForm(null);
                        setDirty(false);
                      }
                    }}
                  >
                    Batalkan
                  </button>
                </div>
              </form>
            </section>
          )}
          {data && !id && !form && (
            <>
              <div className="class-list-bar">
                <div className="class-tabs" aria-label="Filter kelas">
                  <button
                    aria-pressed={filter === "mine"}
                    onClick={() => setFilter("mine")}
                  >
                    Kelas saya
                  </button>
                  <button
                    aria-pressed={filter === "all"}
                    onClick={() => setFilter("all")}
                  >
                    {owner ? "Semua kelas" : "Jelajahi kelas"}
                  </button>
                </div>
                {owner && (
                  <button className="class-primary" onClick={() => editClass()}>
                    <Plus size={17} />
                    Buat kelas
                  </button>
                )}
              </div>
              <div className="class-cards">
                {cards.map((c) => (
                  <article className="class-card" key={c.id}>
                    <div className="class-card-top">
                      <GraduationCap size={26} />
                      <span className="class-badge">
                        {c.isMentor ? "Anda mentor" : statuses[c.status]}
                      </span>
                    </div>
                    <p className="eyebrow teal">{c.courseTitle}</p>
                    <h2>{c.name}</h2>
                    <p>
                      {c.description || "Kelas dengan pendampingan mentor."}
                    </p>
                    <div className="class-card-meta">
                      <span>Mentor: {c.mentorName}</span>
                      <span>
                        {c.count}/{c.capacity} peserta
                      </span>
                      <span>Mulai: {date(c.startsAt)}</span>
                    </div>
                    {c.membership && (
                      <p className="class-help">{statuses[c.membership]}</p>
                    )}
                    <Link
                      className="class-primary"
                      href={"/classes?class=" + encodeURIComponent(c.id)}
                    >
                      Buka kelas
                    </Link>
                  </article>
                ))}
              </div>
              {!cards.length && (
                <section className="class-panel class-empty">
                  <Users size={38} />
                  <h2>
                    {owner
                      ? "Belum ada kelas"
                      : "Belum ada kelas yang Anda ikuti"}
                  </h2>
                  <p>
                    {owner
                      ? "Buat kelas pertama, pilih course, lalu tugaskan mentor."
                      : "Jelajahi kelas yang tersedia dan ajukan permintaan bergabung."}
                  </p>
                  {!owner && filter === "mine" && (
                    <button
                      className="class-outline"
                      onClick={() => setFilter("all")}
                    >
                      Jelajahi kelas
                    </button>
                  )}
                </section>
              )}
            </>
          )}
          {c && !form && (
            <>
              <Link className="class-back" href="/classes">
                <ArrowLeft size={16} />
                Semua kelas
              </Link>
              <section className="class-panel">
                <div className="class-section-head">
                  <span className="class-badge">
                    {statuses[c.status]}
                    {c.isMentor ? " · Anda mentor" : ""}
                  </span>
                  {owner && (
                    <button
                      className="class-outline"
                      onClick={() => editClass(c)}
                    >
                      Pengaturan kelas
                    </button>
                  )}
                </div>
                <p>{c.description || "Belajar dengan pendampingan mentor."}</p>
                <div className="class-info">
                  <span>
                    <b>Mentor</b>
                    {c.mentorName}
                  </span>
                  <span>
                    <b>Peserta</b>
                    {c.count}/{c.capacity}
                  </span>
                  <span>
                    <b>Mulai</b>
                    {date(c.startsAt)}
                  </span>
                  <span>
                    <b>Selesai</b>
                    {date(c.endsAt)}
                  </span>
                </div>
                {!member && (
                  <div className="class-join">
                    <p>
                      {c.membership
                        ? statuses[c.membership]
                        : "Ajukan permintaan bergabung. Jadwal dan diskusi tersedia setelah disetujui."}
                    </p>
                    {!c.membership && c.status === "open" && c.published && (
                      <button
                        className="class-primary"
                        disabled={busy || c.count >= c.capacity}
                        onClick={() =>
                          mutate(
                            { action: "requestJoin", classId: id },
                            "Permintaan bergabung terkirim.",
                          )
                        }
                      >
                        {c.count >= c.capacity
                          ? "Kelas penuh"
                          : "Ajukan bergabung"}
                      </button>
                    )}
                  </div>
                )}
                {member && c.published && data?.user.kind==='student' && (
                  <Link
                    className="class-outline"
                    href={"/learn?course=" + encodeURIComponent(c.courseId)+"&class="+encodeURIComponent(c.id)}
                  >
                    Buka materi course
                  </Link>
                )}
                {staff && c.published && <Link className="class-outline" href={'/preview?course='+encodeURIComponent(c.courseId)}>Pratinjau materi</Link>}
                {!c.published && (
                  <p className="class-help">
                    Course sedang tidak diterbitkan. Materi belum tersedia untuk
                    peserta.
                  </p>
                )}
                {archived && (
                  <p className="class-help">
                    Kelas diarsipkan. Riwayat dapat dibaca; diskusi dan
                    perubahan peserta ditutup.
                  </p>
                )}
              </section>
              {member && (
                <>
                  <Projects
                    key={c.id}
                    classId={c.id}
                    userId={detail?.user.id || ""}
                    archived={!!archived}
                    isParticipant={c.membership === "approved"}
                    onChanged={()=>load(c.id)}
                  />
                  {staff && (
                    <section className="class-panel">
                      <div className="class-section-head">
                        <h2>Peserta & progres</h2>
                        <span>{approved.length} peserta aktif</span>
                      </div>
                      <p className="class-help">
                        Hasil aktivitas, kuis, dan kode mengikuti course.
                        Kelulusan tugas wajib diperiksa khusus untuk kelas ini.
                        Hasil pada revisi materi lama tidak meluluskan revisi baru.
                      </p>
                      {owner && !archived && (
                        <form
                          className="class-inline-form"
                          onSubmit={async (e) => {
                            e.preventDefault();
                            if (invitee)
                              await mutate(
                                {
                                  action: "membership",
                                  classId: id,
                                  userId: invitee,
                                  status: "approved",
                                },
                                "Peserta ditambahkan.",
                              );
                          }}
                        >
                          <Label name="Tambah peserta dari akun terdaftar">
                            <select
                              required
                              value={invitee}
                              onChange={(e) => setInvitee(e.target.value)}
                            >
                              <option value="">Pilih akun</option>
                              {data?.users.map((u) => (
                                <option value={u.id} key={u.id}>
                                  {u.name} · {u.id.slice(0, 8)}
                                </option>
                              ))}
                            </select>
                          </Label>
                          <button className="class-primary" disabled={busy}>
                            Tambah peserta
                          </button>
                        </form>
                      )}
                      {!detail.members?.length && (
                        <p>Belum ada peserta atau permintaan bergabung.</p>
                      )}
                      <div className="class-roster">
                        {detail.members?.map((m) => (
                          <div className="class-roster-item" key={m.userId}>
                            <div className="class-roster-top">
                              <div>
                                <h3>{m.name}</h3>
                                <span className="class-help">
                                  {statuses[m.status]}
                                </span>
                              </div>
                              {owner && !archived && (
                                <div className="class-actions">
                                  {m.status !== "approved" && (
                                    <button
                                      className="class-outline"
                                      disabled={busy}
                                      onClick={() =>
                                        mutate(
                                          {
                                            action: "membership",
                                            classId: id,
                                            userId: m.userId,
                                            status: "approved",
                                          },
                                          "Peserta disetujui.",
                                        )
                                      }
                                    >
                                      Setujui
                                    </button>
                                  )}
                                  {m.status === "pending" && (
                                    <button
                                      className="class-outline"
                                      disabled={busy}
                                      onClick={() =>
                                        mutate(
                                          {
                                            action: "membership",
                                            classId: id,
                                            userId: m.userId,
                                            status: "declined",
                                          },
                                          "Permintaan ditolak.",
                                        )
                                      }
                                    >
                                      Tolak
                                    </button>
                                  )}
                                  {m.status === "approved" && (
                                    <button
                                      className="class-outline"
                                      disabled={busy}
                                      onClick={() => {
                                        if (
                                          confirm(
                                            "Akhiri keanggotaan " +
                                              m.name +
                                              "? Progres course tetap tersimpan.",
                                          )
                                        )
                                          mutate(
                                            {
                                              action: "membership",
                                              classId: id,
                                              userId: m.userId,
                                              status: "removed",
                                            },
                                            "Keanggotaan diakhiri.",
                                          );
                                      }}
                                    >
                                      Akhiri keanggotaan
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                            {m.progress && (
                              <>
                                <div className="class-progress">
                                  <progress
                                    max={100}
                                    value={m.progress.percent}
                                    aria-label={"Progres " + m.name}
                                  />
                                  <span>
                                    {m.progress.completed}/{m.progress.total}{" "}
                                    tahap lulus · {m.progress.percent}%
                                  </span>
                                </div>
                                {m.progress.stale > 0 && (
                                  <p className="class-help">
                                    {m.progress.stale} materi berubah dan perlu
                                    ditinjau lagi.
                                  </p>
                                )}
                                <details>
                                  <summary>
                                    Progres per materi & kuota latihan
                                  </summary>
                                  {m.lessons?.map((l) => (
                                    <div
                                      className="class-lesson-row"
                                      key={l.id}
                                    >
                                      <span>
                                        <b>{l.title}</b>
                                        <small>
                                          {l.complete
                                            ? "Aktivitas selesai"
                                            : "Aktivitas belum selesai"}{" "}
                                          · Kuis: {l.quizAttempts} percobaan ·
                                          Kode: {l.codeAttempts} percobaan
                                        </small>
                                      </span>
                                      {!archived &&
                                        (l.quizAttempts > 0 ||
                                          l.codeAttempts > 0) && (
                                          <button
                                            className="class-outline"
                                            disabled={busy}
                                            onClick={() => {
                                              if (
                                                confirm(
                                                  "Buka ulang kuota latihan " +
                                                    m.name +
                                                    " pada " +
                                                    l.title +
                                                    "? Ini tidak memberikan nilai lulus.",
                                                )
                                              )
                                                mutate(
                                                  {
                                                    action: "resetAttempts",
                                                    classId: id,
                                                    studentId: m.userId,
                                                    lessonId: l.id,
                                                  },
                                                  "Kuota latihan dibuka kembali.",
                                                );
                                            }}
                                          >
                                            Buka kuota
                                          </button>
                                        )}
                                    </div>
                                  ))}
                                </details>
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    </section>
                  )}
                  <div className="class-detail-grid">
                    <section className="class-panel">
                      <div className="class-section-head">
                        <h2>
                          <CalendarDays size={21} />
                          Jadwal kelas
                        </h2>
                        {staff && !archived && (
                          <button
                            className="class-outline"
                            disabled={busy}
                            onClick={() =>
                              setSession({
                                id: crypto.randomUUID(),
                                version: 0,
                                title: "",
                                kind: "online",
                                startsAt: "",
                                duration: 60,
                                location: "",
                                url: "",
                              })
                            }
                          >
                            <Plus size={15} />
                            Jadwalkan
                          </button>
                        )}
                      </div>
                      <p className="class-help">
                        Jadwal ini tampil di kelas, dashboard, dan Sesi Tutor peserta. Sesi online memakai tautan layanan meeting pilihan
                        mentor. Jadwal dan tautan hanya tersedia untuk anggota
                        kelas.
                      </p>
                      {session && (
                        <form
                          onSubmit={async (e) => {
                            e.preventDefault();
                            if (
                              await mutate(
                                {
                                  action: "saveSession",
                                  session: {
                                    ...session,
                                    classId: id,
                                    startsAt: iso(session.startsAt),
                                  },
                                },
                                "Jadwal kelas tersimpan.",
                              )
                            )
                              setSession(null);
                          }}
                        >
                          <Label name="Judul sesi">
                            <input
                              required
                              maxLength={160}
                              value={session.title}
                              onChange={(e) =>
                                setSession({
                                  ...session,
                                  title: e.target.value,
                                })
                              }
                            />
                          </Label>
                          <div className="class-form-grid">
                            <Label name="Jenis pertemuan">
                              <select
                                value={session.kind}
                                onChange={(e) =>
                                  setSession({
                                    ...session,
                                    kind: e.target.value as "online" | "offline",
                                  })
                                }
                              >
                                <option value="online">Live online</option>
                                <option value="offline">Tatap muka</option>
                              </select>
                            </Label>
                            <Label name="Waktu pertemuan (WIB)">
                              <input
                                type="datetime-local"
                                required
                                value={session.startsAt}
                                onChange={(e) =>
                                  setSession({
                                    ...session,
                                    startsAt: e.target.value,
                                  })
                                }
                              />
                            </Label>
                            <Label name="Durasi (menit)">
                              <input
                                type="number"
                                required
                                min={15}
                                max={480}
                                value={session.duration}
                                onChange={(e) =>
                                  setSession({
                                    ...session,
                                    duration: Number(e.target.value),
                                  })
                                }
                              />
                            </Label>
                          </div>
                          {session.kind === "online" ? (
                            <Label name="Tautan meeting HTTPS">
                              <input
                                type="url"
                                required
                                maxLength={2000}
                                value={session.url}
                                onChange={(e) =>
                                  setSession({
                                    ...session,
                                    url: e.target.value,
                                  })
                                }
                              />
                            </Label>
                          ) : (
                            <Label name="Lokasi pertemuan">
                              <input
                                required
                                maxLength={500}
                                value={session.location}
                                onChange={(e) =>
                                  setSession({
                                    ...session,
                                    location: e.target.value,
                                  })
                                }
                              />
                            </Label>
                          )}
                          <div className="class-actions">
                            <button className="class-primary" disabled={busy}>
                              Simpan jadwal
                            </button>
                            <button
                              type="button"
                              className="class-outline"
                              onClick={() => setSession(null)}
                            >
                              Batalkan
                            </button>
                          </div>
                        </form>
                      )}
                      {!detail.sessions?.length && (
                        <p>Belum ada pertemuan yang dijadwalkan.</p>
                      )}
                      {detail.sessions?.map((s) => (
                        <article className="class-session" key={s.id}>
                          {s.kind === "online" ? (
                            <Video size={20} />
                          ) : (
                            <MapPin size={20} />
                          )}
                          <div>
                            <h3>{s.title}</h3>
                            <p>
                              {date(s.startsAt)} · {s.duration} menit
                            </p>
                            <small>
                              {s.kind === "online" ? "Live online" : s.location}
                            </small>
                            <div className="class-actions">
                              {s.kind === "online" && (
                                <Link
                                  className="class-outline"
                                  href={s.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  Buka meeting
                                </Link>
                              )}
                              {staff && !archived && (
                                <button
                                  className="class-outline"
                                  onClick={() =>
                                    setSession({
                                      ...s,
                                      startsAt: local(s.startsAt),
                                    })
                                  }
                                >
                                  Ubah jadwal
                                </button>
                              )}
                            </div>
                          </div>
                        </article>
                      ))}
                    </section>
                    <section className="class-panel">
                      <h2>
                        <MessageCircle size={21} />
                        Feedback pribadi
                      </h2>
                      <p className="class-help">
                        Feedback hanya dapat dibaca peserta yang dituju, mentor
                        kelas yang ditugaskan saat ini, dan pengelola.
                      </p>
                      {staff && !archived && (
                        <form
                          onSubmit={async (e) => {
                            e.preventDefault();
                            if (
                              await mutate(
                                {
                                  action: "feedback",
                                  classId: id,
                                  studentId: student,
                                  body: feedback,
                                },
                                "Feedback terkirim.",
                              )
                            )
                              setFeedback("");
                          }}
                        >
                          <Label name="Peserta penerima feedback">
                            <select
                              required
                              value={student}
                              onChange={(e) => setStudent(e.target.value)}
                            >
                              <option value="">Pilih peserta</option>
                              {approved.map((m) => (
                                <option key={m.userId} value={m.userId}>
                                  {m.name}
                                </option>
                              ))}
                            </select>
                          </Label>
                          <Label name="Feedback mentor">
                            <textarea
                              required
                              rows={3}
                              maxLength={4000}
                              value={feedback}
                              onChange={(e) => setFeedback(e.target.value)}
                            />
                          </Label>
                          <button
                            className="class-primary"
                            disabled={busy || !approved.length}
                          >
                            Kirim feedback
                          </button>
                        </form>
                      )}
                      {!detail.feedback?.length && <p>Belum ada feedback.</p>}
                      {detail.feedback?.map((f) => (
                        <article className="class-message" key={f.id}>
                          <div>
                            <b>{f.mentorName}</b>
                            <small>{date(f.createdAt)}</small>
                          </div>
                          {staff && <small>Untuk {f.studentName}</small>}
                          <p>{f.body}</p>
                        </article>
                      ))}
                    </section>
                  </div>
                  <section className="class-panel">
                    <div className="class-section-head">
                      <h2>
                        <MessageCircle size={21} />
                        Diskusi kelas
                      </h2>
                      <span className="class-help">
                        100 pesan terbaru · diperbarui berkala
                      </span>
                    </div>
                    <p className="class-help">
                      Pesan hanya tersedia untuk peserta aktif, mentor kelas,
                      dan pengelola.
                    </p>
                    {!detail.posts?.length && (
                      <p>Mulai diskusi tentang materi atau proyek kelas.</p>
                    )}
                    <div className="class-message-list">
                      {detail.posts?.map((p) => (
                        <article
                          className={
                            "class-message " +
                            (p.kind === "announcement" ? "announcement" : "")
                          }
                          key={p.id}
                        >
                          <div>
                            <b>
                              {p.name}{" "}
                              <span className="class-badge">
                                {p.role === "owner"
                                  ? "Pengelola"
                                  : p.role === "mentor"
                                    ? "Mentor"
                                    : "Peserta"}
                                {p.kind === "announcement"
                                  ? " · Pengumuman"
                                  : ""}
                              </span>
                            </b>
                            <small>{date(p.createdAt)}</small>
                          </div>
                          <p>{p.body}</p>
                        </article>
                      ))}
                    </div>
                    {!archived && (
                      <form
                        onSubmit={async (e) => {
                          e.preventDefault();
                          if (
                            await mutate(
                              { action: "post", classId: id, kind, body },
                              "Pesan terkirim.",
                            )
                          )
                            setBody("");
                        }}
                      >
                        {staff && (
                          <Label name="Jenis pesan">
                            <select
                              value={kind}
                              onChange={(e) => setKind(e.target.value)}
                            >
                              <option value="discussion">Diskusi</option>
                              <option value="announcement">
                                Pengumuman mentor
                              </option>
                            </select>
                          </Label>
                        )}
                        <Label name="Pesan diskusi kelas">
                          <textarea
                            required
                            maxLength={4000}
                            rows={3}
                            value={body}
                            onChange={(e) => setBody(e.target.value)}
                          />
                        </Label>
                        <button
                          className="class-primary"
                          disabled={busy || !body.trim()}
                        >
                          Kirim pesan
                        </button>
                      </form>
                    )}
                  </section>
                </>
              )}
            </>
          )}
    </AccountFrame>
  );
}
