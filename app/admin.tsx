"use client";
import {publicationImpact} from "@/lib/academic-revisions";
import {hasRequiredCoding,REQUIRED_CODING_WARNING} from "@/lib/judge-policy";
import ManagementReports from "./management-reports";
import { CertificateList } from "./certificates-panel";
import { CourseUpload, CourseFileLibrary } from "./media-controls";
import { mediaId, type MediaInfo } from "@/lib/media-model";
import { useState, useEffect, useCallback } from "react";
import {
  Plus,
  Save,
  Eye,
  ChevronUp,
  ChevronDown,
  Trash2,
  BookOpen,
  CalendarDays,
  Users,
  Code2,
  Layers3,
  Settings2,
  MessageCircle,
  Check,
} from "lucide-react";
import type {LucideIcon} from "lucide-react";
import type {AdminStudio} from "@/lib/client-dto";
import type { Course, Lesson, Block, Session } from "@/lib/model";
import { api, localDate, DiscussionPanel } from "./studio";
const uid = () => crypto.randomUUID();
const newLesson = (): Lesson => ({
  id: uid(),
  revision: 1,
  module: "01 · Modul pertama",
  title: "Materi baru",
  minutes: 10,
  blocks: [{ id: uid(), type: "text", content: "" }],
});
function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
function JudgeCheck({onChecked}:{onChecked:(passed:boolean)=>void}) {
  const [result, setResult] = useState<{message?:string;passed?:boolean;checks?:{label:string;ok:boolean}[]} | null>(null),
    [busy, setBusy] = useState(false);
  async function check() {
    setBusy(true);
    try {
      const checked=await api<{message?:string;passed?:boolean;checks?:{label:string;ok:boolean}[]}>("/api/judge", {});
      setResult(checked);onChecked(checked.passed===true);
    } catch (e) {
      setResult({
        message: e instanceof Error ? e.message : "Pemeriksaan belum berhasil.",
      });
      onChecked(false);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <button className="secondary" disabled={busy} onClick={check}>
        {busy ? "Memeriksa…" : "Periksa koneksi dan konfigurasi"}
      </button>
      {result && (
        <div role="status">
          <p>
            {result.message ||
              (result.passed
                ? "Konfigurasi dasar lolos. Tetap uji sandbox sebelum kelas dimulai."
                : "Konfigurasi layanan belum memenuhi pemeriksaan dasar.")}
          </p>
          {result.checks?.map((c) => (
            <p key={c.label}>
              {c.ok ? "✓" : "×"} {c.label}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
export default function Admin({
  reload,
  onPreview,
  onDirtyChange,
  curriculum,
}: {
  curriculum?: {course: Course; save: (course: Course) => Promise<Course>};
  reload: () => Promise<void>;
  onPreview: (course: string, lesson: string) => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [data, setData] = useState<AdminStudio | null>(null),
    [editing, setEditing] = useState<Course | null>(null),
    [selected, setSelected] = useState(""),
    [tab, setTab] = useState("content"),
    [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    onDirtyChange(dirty);
    const protect = (event: BeforeUnloadEvent) => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", protect);
    return () => {
      window.removeEventListener("beforeunload", protect);
      onDirtyChange(false);
    };
  }, [dirty, onDirtyChange]);
  const load=useCallback(async () => {
    try {
      const d = curriculum ? {courses:[curriculum.course],progress:[],users:[],sessions:[],judgeReady:(await api<{passed:boolean}>("/api/judge")).passed} : await api<AdminStudio>("/api/studio?admin=1");
      setData(d);
      setEditing(current=>current || d.courses[0] || null);
      setSelected(current=>current || d.courses[0]?.lessons[0]?.id || "");
    } catch (cause) {
      const e = cause as Error & {status?: number};
      setError(e.message);
    }
  },[curriculum]);
  useEffect(() => {
    const startup=setTimeout(load,0);return()=>clearTimeout(startup);
  }, [load]);
  const lesson = editing?.lessons.find((l) => l.id === selected);
  function edit(c: Course) {
    setEditing(c);
    setDirty(true);
    setMessage("");
  }
  function patchLesson(p: Partial<Lesson>) {
    if (editing && lesson)
      edit({
        ...editing,
        lessons: editing.lessons.map((l) =>
          l.id === lesson.id ? { ...l, ...p } : l,
        ),
      });
  }
  function switchCourse(c: Course) {
    if (busy) return;
    if (
      dirty &&
      !confirm("Perubahan belum disimpan. Pindah course dan abaikan perubahan?")
    )
      return;
    setEditing(structuredClone(c));
    setSelected(c.lessons[0]?.id || "");
    setDirty(false);
    setError("");
    setMessage("");
  }
  function uploadedBlock(blockId: string, file: MediaInfo) {
    if (!editing || !lesson) return;
    const courseId = editing.id, lessonId = lesson.id;
    setEditing((current) => !current || current.id !== courseId ? current : {
      ...current, lessons: current.lessons.map((item) => item.id !== lessonId ? item : {
        ...item, blocks: item.blocks.map((block) => block.id !== blockId ? block : {...block,content:file.url,caption:file.name}),
      }),
    });
    setDirty(true);
    setMessage("Berkas diunggah. Simpan course untuk memasangnya pada materi.");
  }
  async function save() {
    if (!editing) return;
    setBusy(true);
    setError("");
    try {
      if(!curriculum){
        const before=data?.courses.find((c:Course)=>c.id===editing.id);
        const impact=publicationImpact(editing,before);
        if(impact.substantial.length||impact.removed.length){
          const ids=new Set(impact.substantial.map(l=>l.id));
          const count=new Set((data?.progress||[]).filter((p:{course_id:string;lesson_id:string;user_id:string})=>p.course_id===editing.id&&ids.has(p.lesson_id)).map((p:{user_id:string})=>p.user_id)).size;
          if(!confirm(`Dampak publikasi: ${impact.substantial.map(l=>l.title).join(", ")||"Tidak ada materi berubah"}. ${count} peserta dengan progres terdampak perlu mengulang. ${impact.removed.length} materi dihapus. Sertifikat yang telah terbit tetap. Terapkan perubahan?`))return;
        }
      }
      const d = curriculum ? {course:await curriculum.save(editing)} : await api<{course:Course}>("/api/studio", {
        action: "saveCourse",
        course: {
          ...editing,
          overview: editing.overview
            ? {
                ...editing.overview,
                outcomes: editing.overview.outcomes
                  .map((s) => s.trim())
                  .filter(Boolean),
                requirements: editing.overview.requirements
                  .map((s) => s.trim())
                  .filter(Boolean),
              }
            : undefined,
        },
      });
      setEditing(d.course);
      setDirty(false);
      setMessage("Perubahan tersimpan.");
      const next = curriculum ? {courses:[d.course],progress:[],users:[],sessions:[],judgeReady:data?.judgeReady||false} : await api<AdminStudio>("/api/studio?admin=1");
      setData(next);
      await reload();
    } catch (cause) {
      const e = cause as Error & {status?: number};
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  function moveLesson(index: number, direction: number) {
    if (!editing) return;
    const lessons = [...editing.lessons];
    [lessons[index], lessons[index + direction]] = [
      lessons[index + direction],
      lessons[index],
    ];
    edit({ ...editing, lessons });
  }
  const Container = curriculum ? "div" : "main";
  return (
    <Container className="admin-page">
      <div className="admin-heading">
        <div>
          <div className="eyebrow teal">{curriculum ? "DRAF TIM KURIKULUM" : "EDITOR COURSE"}</div>
          <h1>{curriculum ? "Susun draf materi" : "Kelola pengalaman belajar"}</h1>
          <p>{curriculum ? "Draf tersimpan terpisah. Ajukan untuk review setelah selesai menyusun." : "Susun materi, tentukan capaian, dan dampingi prosesnya."}</p>
        </div>
        <button
          className="primary"
          disabled={busy || !editing || !dirty}
          onClick={save}
        >
          <Save size={17} />
          {busy ? "Menyimpan…" : "Simpan perubahan"}
        </button>
      </div>
      {!curriculum && <div className="admin-tabs">
        {([
          ["content", "Konten & kurikulum", Layers3],
          ["sessions", "Sesi Tutor", CalendarDays],
          ["progress", "Progres siswa", Users],
          ["certificates", "Sertifikat", Check],
          ["reports", "Laporan", Users],
          ["integration", "Pemeriksa kode", Code2],
        ] as [string,string,LucideIcon][]).map(([key, label, Icon]) => (
          <button
            key={key}
            className={tab === key ? "active" : ""}
            onClick={() => setTab(key)}
          >
            <Icon size={17} />
            {label}
          </button>
        ))}
      </div>}
      {error && (
        <div className="feedback warning" role="alert">
          {error}
        </div>
      )}
      {message && (
        <div className="feedback success" role="status">
          <Check size={17} />
          {message}
        </div>
      )}
      {!data ? (
        <div className="empty">Memuat workspace…</div>
      ) : tab === "sessions" ? (
        <SessionAdmin
          courses={data.courses}
          sessions={data.sessions}
          refresh={async () => {
            await load();
            await reload();
          }}
        />
      ) : tab === "reports" ? (
        <ManagementReports courses={data.courses} />
      ) : tab === "certificates" ? (
        <CertificateList admin />
      ) : tab === "progress" ? (
        <section>
          <div className="section-heading">
            <h2>Perjalanan peserta</h2>
            <span className="pill">{data.users.length} akun</span>
          </div>
          <p className="small">
            Progres disimpan per akun dan versi materi. Perubahan isi materi
            membuat peserta perlu meninjau materi yang berubah.
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Peserta</th>
                  <th>Course / materi</th>
                  <th>Status</th>
                  <th>Nilai terakhir</th>
                  <th>Percobaan</th>
                  <th>Tindakan</th>
                </tr>
              </thead>
              <tbody>
                {data.progress.map((p) => {
                  const c = data?.courses.find(
                      (c: Course) => c.id === p.course_id,
                    ),
                    l = c?.lessons.find((l: Lesson) => l.id === p.lesson_id);
                  return (
                    <tr key={p.user_id + p.course_id + p.lesson_id}>
                      <td>{p.name}</td>
                      <td>
                        <b>{l?.title || "Materi dihapus"}</b>
                        <small>{c?.title}</small>
                      </td>
                      <td>
                        {p.revision !== l?.revision
                          ? "Perlu ditinjau"
                          : p.complete
                            ? "Selesai"
                            : "Dalam proses"}
                      </td>
                      <td>{p.score}/100</td>
                      <td>
                        Kuis {p.quiz_attempts}
                        <br />
                        Kode {p.code_attempts}
                      </td>
                      <td>
                        <button
                          className="secondary"
                          onClick={async () => {
                            try {
                              await api("/api/studio", {
                                action: "resetAttempts",
                                userId: p.user_id,
                                courseId: p.course_id,
                                lessonId: p.lesson_id,
                              });
                              await load();
                              setMessage("Kuota percobaan dibuka kembali.");
                            } catch (cause) {
      const e = cause as Error & {status?: number};
                              setError(e.message);
                            }
                          }}
                        >
                          Buka percobaan
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!data.progress.length && (
              <div className="empty">Belum ada aktivitas belajar.</div>
            )}
          </div>
        </section>
      ) : tab === "integration" ? (
        <section className="integration-panel">
          <span className={`pill ${data.judgeReady ? "" : "warning"}`}>
            {data.judgeReady
              ? "Pemeriksaan kesiapan layanan lolos"
              : "Penilaian resmi belum siap"}
          </span>
          <h2>Latihan gratis & penilaian resmi</h2>
          <p>
            Gunakan tombol “Coba gratis di browser” untuk Python dan JavaScript.
            C++ serta penilaian resmi memerlukan layanan server.
          </p>
          <JudgeCheck onChecked={passed=>setData(current=>current?{...current,judgeReady:passed}:current)} />
          <p>
            Latihan dinilai berdasarkan test case. Input dan jawaban tersembunyi
            tetap berada di server; kode dijalankan pada sandbox terpisah dengan
            batas waktu, memori, dan akses jaringan dimatikan.
          </p>
          <div className="integration-grid">
            <div>
              <h3>Bahasa latihan</h3>
              <p>
                Python, JavaScript, dan C++. Pengajar memilih bahasa pada setiap
                soal.
              </p>
            </div>
            <div>
              <h3>Penilaian</h3>
              <p>
                Nilai berasal dari jumlah test case yang lulus. Semua test case
                harus lulus jika latihan menjadi prasyarat.
              </p>
            </div>
          </div>
          <div className="intro-note">
            Untuk penilaian resmi, pengelola teknis perlu mengatur JUDGE0_URL,
            JUDGE0_TOKEN (atau kredensial provider), dan JUDGE0_ENABLED pada
            konfigurasi server. Kredensial tidak dimasukkan ke materi. Setelah
            terhubung, uji satu solusi benar, solusi salah, dan kode yang
            melewati batas waktu.
          </div>
          <p className="small">
            Latihan Python dan JavaScript gratis dapat dijalankan di browser
            tanpa layanan tambahan. Hasil latihan browser tidak membuka
            prasyarat coding wajib. Konfigurasi endpoint belum membuktikan
            layanan sehat. Untuk ESP32/STM32, tes ini memeriksa logika program;
            perilaku perangkat fisik tetap memerlukan praktik dan penilaian
            mentor.
          </p>
        </section>
      ) : (
        <>
          <div className="course-picker">
            <label>
              Course
              <select
                value={editing?.id || ""}
                onChange={(e) => {
                  const c = data?.courses.find(
                    (c: Course) => c.id === e.target.value,
                  );
                  if (c) switchCourse(c);
                }}
              >
                {editing &&
                  !data.courses.some((c: Course) => c.id === editing.id) && (
                    <option value={editing.id}>{editing.title} (baru)</option>
                  )}
                {data.courses.map((c: Course) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                    {c.published ? "" : " · Draft"}
                  </option>
                ))}
              </select>
            </label>
            {!curriculum && <button
              className="secondary"
              onClick={() => {
                if (dirty && !confirm("Abaikan perubahan yang belum disimpan?"))
                  return;
                const l = newLesson();
                edit({
                  id: uid(),
                  version: 0,
                  title: "Course baru",
                  description: "",
                  category: "STEM",
                  level: "Pemula",
                  published: false,
                  sample: false,
                  lessons: [l],
                });
                setSelected(l.id);
              }}
            >
              <Plus size={17} />
              Course baru
            </button>}
          </div>
          {editing && (
            <>
              {hasRequiredCoding(editing)&&!data.judgeReady&&<p className="feedback warning" role="status">{REQUIRED_CODING_WARNING}</p>}
              <details className="course-settings" open={editing.version === 0}>
                <summary>
                  <Settings2 size={17} />
                  Pengaturan course{" "}
                  <span className="pill">
                    {curriculum ? "Draf kurikulum" : editing.published ? "Terbit" : "Draft"}
                  </span>
                </summary>
                <div className="form-grid">
                  <Field label="Judul course">
                    <input
                      value={editing.title}
                      onChange={(e) =>
                        edit({ ...editing, title: e.target.value })
                      }
                    />
                  </Field>
                  <Field label="Kategori">
                    <input
                      value={editing.category}
                      onChange={(e) =>
                        edit({ ...editing, category: e.target.value })
                      }
                    />
                  </Field>
                  <Field label="Level">
                    <select
                      value={editing.level}
                      onChange={(e) =>
                        edit({ ...editing, level: e.target.value })
                      }
                    >
                      <option>Pemula</option>
                      <option>Menengah</option>
                      <option>Lanjutan</option>
                    </select>
                  </Field>
                  <Field label={curriculum ? "Status course saat ini" : "Status"}>
                    <select disabled={!!curriculum}
                      value={editing.published ? "published" : "draft"}
                      onChange={(e) =>
                        edit({
                          ...editing,
                          published: e.target.value === "published",
                        })
                      }
                    >
                      <option value="draft">Draft</option>
                      <option value="published">Terbit</option>
                    </select>
                  </Field>
                  <Field label="Deskripsi">
                    <textarea
                      rows={3}
                      value={editing.description}
                      onChange={(e) =>
                        edit({ ...editing, description: e.target.value })
                      }
                    />
                  </Field>
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      disabled={!!curriculum}
                      checked={editing.sample}
                      onChange={(e) =>
                        edit({ ...editing, sample: e.target.checked })
                      }
                    />
                    Tandai sebagai course contoh
                  </label>
                </div>
                <Field label="Jalur belajar"><select value={editing.learningMode||"independent_allowed"} onChange={e=>edit({...editing,learningMode:e.target.value as Course["learningMode"]})}><option value="independent_allowed">Belajar mandiri tanpa review wajib</option><option value="class_required">Kelas dengan pendampingan Tutor</option></select></Field>
                <Field label="Nilai minimal review wajib (0–100)"><input type="number" min={0} max={100} step={1} value={editing.reviewPassThreshold ?? 80} onChange={e=>edit({...editing,reviewPassThreshold:Number(e.target.value)})}/></Field>
                <p className="small">Standar ini berlaku untuk semua review wajib pada course ini. Perubahan standar memerlukan penilaian ulang materi yang memiliki review wajib setelah draf disetujui.</p>
                <label className="checkbox-label"><input type="checkbox" checked={editing.policyState==="ready"} onChange={e=>edit({...editing,graduationPolicyVersion:2,policyState:e.target.checked?"ready":"needs_mapping"})}/>Pemetaan syarat kelulusan sudah diperiksa</label>
                <label className="checkbox-label"><input type="checkbox" checked={!!editing.certificateEnabled} onChange={e=>edit({...editing,certificateEnabled:e.target.checked})}/>Aktifkan sertifikat penyelesaian</label>
                <p className="small">Syarat: semua materi versi terbaru selesai, tes wajib lulus, serta semua review wajib pada kelas yang dipilih Diterima dengan nilai sesuai standar course. Tugas opsional tidak menahan kelulusan. Course contoh tidak menerbitkan sertifikat. Sertifikat lama tetap merekam versi penerbitannya.</p>
                <CourseOverview course={editing} update={edit} />
              </details>
              <div className="authoring">
                <aside className="author-outline">
                  <div className="section-heading">
                    <h3>Kurikulum</h3>
                    <span>{editing.lessons.length} materi</span>
                  </div>
                  {editing.lessons.map((l, i) => (
                    <div
                      key={l.id}
                      className={`author-lesson ${selected === l.id ? "active" : ""}`}
                    >
                      <button
                        className="lesson-title"
                        onClick={() => setSelected(l.id)}
                      >
                        <small>{l.module}</small>
                        {l.title}
                      </button>
                      <div className="row">
                        <button
                          aria-label={`Naikkan ${l.title}`}
                          disabled={i === 0}
                          onClick={() => moveLesson(i, -1)}
                        >
                          <ChevronUp size={14} />
                        </button>
                        <button
                          aria-label={`Turunkan ${l.title}`}
                          disabled={i === editing.lessons.length - 1}
                          onClick={() => moveLesson(i, 1)}
                        >
                          <ChevronDown size={14} />
                        </button>
                        <button
                          aria-label={`Hapus ${l.title}`}
                          onClick={() => {
                            if (
                              !confirm(
                                "Hapus materi dari draft? Perubahan berlaku setelah disimpan.",
                              )
                            )
                              return;
                            edit({
                              ...editing,
                              lessons: editing.lessons.filter(
                                (x) => x.id !== l.id,
                              ),
                            });
                            if (selected === l.id)
                              setSelected(
                                editing.lessons.find((x) => x.id !== l.id)
                                  ?.id || "",
                              );
                          }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                  <button
                    className="secondary full"
                    onClick={() => {
                      const l = newLesson();
                      l.module = lesson?.module || l.module;
                      edit({ ...editing, lessons: [...editing.lessons, l] });
                      setSelected(l.id);
                    }}
                  >
                    <Plus size={16} />
                    Tambah materi
                  </button>
                  <p className="small muted">
                    Urutan modul mengikuti urutan materi. Gunakan nama modul
                    yang sama untuk mengelompokkan materi.
                  </p>
                </aside>
                <div className="author-main">
                  {lesson ? (
                    <>
                      <div className="section-heading">
                        <h2>Editor materi</h2>
                        {!curriculum && <button
                          className="secondary"
                          disabled={dirty}
                          title={
                            dirty ? "Simpan sebelum membuka ruang belajar" : ""
                          }
                          onClick={() => onPreview(editing.id, lesson.id)}
                        >
                          <Eye size={16} />
                          Lihat sebagai peserta
                        </button>}
                      </div>
                      <div className="form-grid">
                        <Field label="Judul materi">
                          <input
                            value={lesson.title}
                            onChange={(e) =>
                              patchLesson({ title: e.target.value })
                            }
                          />
                        </Field>
                        <Field label="Jenis perubahan materi"><select value={lesson.change?.kind||"substantial"} onChange={e=>patchLesson({change:{kind:e.target.value as "editorial"|"substantial",reason:lesson.change?.reason||"Pembaruan materi."}})}><option value="substantial">Substansial: peserta perlu mengulang materi terdampak</option><option value="editorial">Editorial: koreksi tanpa perubahan makna</option></select></Field>
                    <Field label="Alasan perubahan"><input value={lesson.change?.reason||""} maxLength={2000} onChange={e=>patchLesson({change:{kind:lesson.change?.kind||"substantial",reason:e.target.value}})}/></Field>
                    <section><h3>Review Tutor wajib</h3>{(lesson.reviewRequirements||[]).map((r,i)=><div key={r.id} className="context-card"><Field label="Judul tugas"><input value={r.title} onChange={e=>patchLesson({reviewRequirements:lesson.reviewRequirements!.map((x,j)=>j===i?{...x,title:e.target.value}:x)})}/></Field><Field label="Template instruksi"><textarea value={r.instructions} onChange={e=>patchLesson({reviewRequirements:lesson.reviewRequirements!.map((x,j)=>j===i?{...x,instructions:e.target.value}:x)})}/></Field><Field label="Rubrik"><textarea value={r.rubric} onChange={e=>patchLesson({reviewRequirements:lesson.reviewRequirements!.map((x,j)=>j===i?{...x,rubric:e.target.value}:x)})}/></Field><button type="button" className="secondary" onClick={()=>patchLesson({reviewRequirements:lesson.reviewRequirements!.filter(x=>x.id!==r.id)})}>Hapus syarat review</button></div>)}<button type="button" className="secondary" onClick={()=>{edit({...editing,learningMode:"class_required",lessons:editing.lessons.map(l=>l.id===lesson.id?{...l,reviewRequirements:[...(l.reviewRequirements||[]),{id:uid(),revision:1,title:"Proyek wajib",instructions:"",rubric:""}]}:l)});}}>Tambah review wajib</button><p>Nilai minimal {editing.reviewPassThreshold ?? 80} dan status Diterima. Pasang tugas yang terkait di setiap kelas sebelum pembelajaran dibuka.</p></section>
                    <Field label="Modul">
                          <input
                            value={lesson.module}
                            onChange={(e) =>
                              patchLesson({ module: e.target.value })
                            }
                          />
                        </Field>
                        <Field label="Estimasi belajar (menit)">
                          <input
                            type="number"
                            min="1"
                            max="600"
                            value={lesson.minutes}
                            onChange={(e) =>
                              patchLesson({ minutes: Number(e.target.value) })
                            }
                          />
                        </Field>
                      </div>
                      <div className="section-heading">
                        <h3>Blok materi</h3>
                        <span className="small muted">
                          Urutkan sesuai alur penjelasan
                        </span>
                      </div>
                      {lesson.blocks.map((b, i) => (
                        <div className="block-editor" key={b.id}>
                          <div className="row spread">
                            <span className="block-label">
                              {i + 1}.{" "}
                              {
                                {
                                  text: "Teks",
                                  heading: "Judul",
                                  callout: "Catatan",
                                  video: "Video",
                                  image: "Gambar",
                                  file: "Dokumen",
                                  code: "Contoh kode",
                                  diagram: "Diagram alur",
                                }[b.type]
                              }
                            </span>
                            <div className="row">
                              <button
                                aria-label="Naikkan blok"
                                disabled={i === 0}
                                onClick={() => {
                                  const bs = [...lesson.blocks];
                                  [bs[i - 1], bs[i]] = [bs[i], bs[i - 1]];
                                  patchLesson({ blocks: bs });
                                }}
                              >
                                <ChevronUp size={16} />
                              </button>
                              <button
                                aria-label="Turunkan blok"
                                disabled={i === lesson.blocks.length - 1}
                                onClick={() => {
                                  const bs = [...lesson.blocks];
                                  [bs[i + 1], bs[i]] = [bs[i], bs[i + 1]];
                                  patchLesson({ blocks: bs });
                                }}
                              >
                                <ChevronDown size={16} />
                              </button>
                              <button
                                aria-label="Hapus blok"
                                onClick={() =>
                                  patchLesson({
                                    blocks: lesson.blocks.filter(
                                      (x) => x.id !== b.id,
                                    ),
                                  })
                                }
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </div>
                          {(b.type === "file" || (b.type === "image" && mediaId(b.content))) ? (
                            <p className="small">{b.content ? <a href={b.content + "?download=1"}>{b.caption || "Unduh berkas terpilih"}</a> : "Belum ada dokumen. Pilih berkas melalui upload atau daftar berkas course."}</p>
                          ) : ["text", "callout", "code"].includes(b.type) ? (
                            <textarea
                              aria-label={`Isi blok ${i + 1}`}
                              rows={b.type === "code" ? 5 : 4}
                              className={b.type === "code" ? "mono" : ""}
                              value={b.content}
                              onChange={(e) =>
                                patchLesson({
                                  blocks: lesson.blocks.map((x) =>
                                    x.id === b.id
                                      ? { ...x, content: e.target.value }
                                      : x,
                                  ),
                                })
                              }
                            />
                          ) : (
                            <input
                              aria-label={`Isi blok ${i + 1}`}
                              placeholder={
                                b.type === "video"
                                  ? "https://www.youtube.com/watch?v=…"
                                  : b.type === "image"
                                    ? "https://…/diagram.png"
                                    : b.type === "diagram"
                                      ? "Sensor|ESP32|Dashboard"
                                      : "Judul bagian"
                              }
                              value={b.content}
                              onChange={(e) =>
                                patchLesson({
                                  blocks: lesson.blocks.map((x) =>
                                    x.id === b.id
                                      ? { ...x, content: e.target.value }
                                      : x,
                                  ),
                                })
                              }
                            />
                          )}{" "}
                          {["image", "video", "file"].includes(b.type) && (
                            <CourseUpload courseId={editing.version > 0 ? editing.id : null} type={b.type as "image" | "video" | "file"} disabled={busy} onBusy={setBusy} onUploaded={(file) => uploadedBlock(b.id, file)} />
                          )}
                          {["video", "image", "file"].includes(b.type) && (
                            <input
                              aria-label="Keterangan media"
                              placeholder="Keterangan / teks alternatif"
                              value={b.caption || ""}
                              onChange={(e) =>
                                patchLesson({
                                  blocks: lesson.blocks.map((x) =>
                                    x.id === b.id
                                      ? { ...x, caption: e.target.value }
                                      : x,
                                  ),
                                })
                              }
                            />
                          )}
                        </div>
                      ))}
                      <div className="add-block">
                        {[
                          ["text", "Teks"],
                          ["heading", "Judul"],
                          ["callout", "Catatan"],
                          ["video", "Video"],
                          ["image", "Gambar"],
                          ["file", "Dokumen"],
                          ["code", "Kode"],
                          ["diagram", "Diagram"],
                        ].map(([type, label]) => (
                          <button
                            key={type}
                            className="secondary"
                            onClick={() =>
                              patchLesson({
                                blocks: [
                                  ...lesson.blocks,
                                  {
                                    id: uid(),
                                    type: type as Block["type"],
                                    content:
                                      type === "diagram"
                                        ? "Sensor|ESP32|Dashboard"
                                        : "",
                                  },
                                ],
                              })
                            }
                          >
                            <Plus size={14} />
                            {label}
                          </button>
                        ))}
                      </div>
                      {editing.version > 0 && <CourseFileLibrary allowRemoval={!curriculum} key={editing.id} courseId={editing.id} usedIds={editing.lessons.flatMap(item => item.blocks.map(block => mediaId(block.content)).filter((id): id is string => !!id))} disabled={busy} onChoose={(file) => patchLesson({blocks:[...lesson.blocks,{id:uid(),type:file.mime.startsWith("image/") ? "image" : file.mime === "video/mp4" ? "video" : "file",content:file.url,caption:file.name}]})} />}
                      <QuizEditor lesson={lesson} patch={patchLesson} />
                      <ExerciseEditor lesson={lesson} patch={patchLesson} />
                      {!curriculum && <details className="course-settings">
                        <summary>
                          <MessageCircle size={17} />
                          Diskusi peserta pada materi ini
                        </summary>
                        {editing.version > 0 && !dirty ? (
                          <DiscussionPanel
                            courseId={editing.id}
                            lessonId={lesson.id}
                          />
                        ) : (
                          <p>Simpan perubahan untuk membuka diskusi.</p>
                        )}
                      </details>}
                      <div className="save-bar">
                        <span>
                          {dirty
                            ? "Ada perubahan yang belum disimpan"
                            : "Semua perubahan tersimpan"}
                        </span>
                        <button
                          className="primary"
                          disabled={busy || !dirty}
                          onClick={save}
                        >
                          <Save size={16} />
                          Simpan perubahan
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="empty">
                      <BookOpen size={32} />
                      <h2>Tambahkan materi pertama</h2>
                      <p>
                        Susun course dari penjelasan, praktik, dan evaluasi.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </>
      )}
    </Container>
  );
}
function QuizEditor({
  lesson,
  patch,
}: {
  lesson: Lesson;
  patch: (p: Partial<Lesson>) => void;
}) {
  const quiz = lesson.quiz;
  if (!quiz)
    return (
      <button
        className="add-section"
        onClick={() =>
          patch({
            quiz: {
              mode: "review",
              threshold: 80,
              maxAttempts: 0,
              feedback: "always",
              questions: [
                {
                  id: uid(),
                  prompt: "Pertanyaan baru",
                  options: ["Pilihan A", "Pilihan B"],
                  correct: [0],
                  explanation: "",
                },
              ],
            },
          })
        }
      >
        <Plus size={18} />
        Tambahkan tes pemahaman
      </button>
    );
  const update = (p: Partial<NonNullable<Lesson["quiz"]>>) => patch({ quiz: { ...quiz, ...p } });
  return (
    <section className="config-card">
      <div className="section-heading">
        <h2>Tes pemahaman</h2>
        <button className="danger" onClick={() => patch({ quiz: undefined })}>
          Hapus tes
        </button>
      </div>
      <div className="form-grid">
        <Field label="Fungsi tes">
          <select
            value={quiz.mode}
            onChange={(e) => update({ mode: e.target.value as "required" | "review" })}
          >
            <option value="review">Review — tidak mengunci</option>
            <option value="required">
              Wajib lulus — mengunci materi berikutnya
            </option>
          </select>
        </Field>
        <Field label="Nilai minimum (100 = semua benar)">
          <input
            type="number"
            min="1"
            max="100"
            value={quiz.threshold}
            onChange={(e) => update({ threshold: Number(e.target.value) })}
          />
        </Field>
        <Field label="Batas percobaan (0 = tanpa batas)">
          <input
            type="number"
            min="0"
            max="100"
            value={quiz.maxAttempts}
            onChange={(e) => update({ maxAttempts: Number(e.target.value) })}
          />
        </Field>
        <Field label="Tampilkan pembahasan">
          <select
            value={quiz.feedback}
            onChange={(e) => update({ feedback: e.target.value as "always" | "after_pass" | "never" })}
          >
            <option value="always">Setelah setiap percobaan</option>
            <option value="after_pass">Setelah lulus</option>
            <option value="never">Tidak ditampilkan</option>
          </select>
        </Field>
      </div>
      {quiz.questions.map((q, i) => (
        <div className="question-editor" key={q.id}>
          <div className="row spread">
            <strong>Soal {i + 1}</strong>
            <button
              className="danger"
              disabled={quiz.questions.length === 1}
              onClick={() =>
                update({
                  questions: quiz.questions.filter((x) => x.id !== q.id),
                })
              }
            >
              <Trash2 size={15} />
              Hapus
            </button>
          </div>
          <Field label="Pertanyaan">
            <textarea
              rows={2}
              value={q.prompt}
              onChange={(e) =>
                update({
                  questions: quiz.questions.map((x) =>
                    x.id === q.id ? { ...x, prompt: e.target.value } : x,
                  ),
                })
              }
            />
          </Field>
          <small className="muted">
            Centang satu atau beberapa jawaban yang benar.
          </small>
          {q.options.map((o, index) => (
            <div className="answer-edit" key={index}>
              <input
                aria-label={`Jawaban ${index + 1} benar`}
                type="checkbox"
                checked={q.correct.includes(index)}
                onChange={(e) =>
                  update({
                    questions: quiz.questions.map((x) =>
                      x.id === q.id
                        ? {
                            ...x,
                            correct: e.target.checked
                              ? [...x.correct, index]
                              : x.correct.filter((n) => n !== index),
                          }
                        : x,
                    ),
                  })
                }
              />
              <input
                aria-label={`Pilihan ${index + 1}`}
                value={o}
                onChange={(e) =>
                  update({
                    questions: quiz.questions.map((x) =>
                      x.id === q.id
                        ? {
                            ...x,
                            options: x.options.map((v, n) =>
                              n === index ? e.target.value : v,
                            ),
                          }
                        : x,
                    ),
                  })
                }
              />
              <button
                aria-label="Hapus pilihan"
                disabled={q.options.length <= 2}
                onClick={() =>
                  update({
                    questions: quiz.questions.map((x) =>
                      x.id === q.id
                        ? {
                            ...x,
                            options: x.options.filter((_, n) => n !== index),
                            correct: x.correct
                              .filter((n) => n !== index)
                              .map((n) => (n > index ? n - 1 : n)),
                          }
                        : x,
                    ),
                  })
                }
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          <button
            className="text-button"
            disabled={q.options.length >= 8}
            onClick={() =>
              update({
                questions: quiz.questions.map((x) =>
                  x.id === q.id
                    ? { ...x, options: [...x.options, "Pilihan baru"] }
                    : x,
                ),
              })
            }
          >
            <Plus size={14} />
            Pilihan
          </button>
          <Field label="Pembahasan">
            <textarea
              rows={2}
              value={q.explanation}
              onChange={(e) =>
                update({
                  questions: quiz.questions.map((x) =>
                    x.id === q.id ? { ...x, explanation: e.target.value } : x,
                  ),
                })
              }
            />
          </Field>
        </div>
      ))}
      <button
        className="secondary"
        onClick={() =>
          update({
            questions: [
              ...quiz.questions,
              {
                id: uid(),
                prompt: "Pertanyaan baru",
                options: ["Pilihan A", "Pilihan B"],
                correct: [0],
                explanation: "",
              },
            ],
          })
        }
      >
        <Plus size={16} />
        Tambah soal
      </button>
    </section>
  );
}
function ExerciseEditor({
  lesson,
  patch,
}: {
  lesson: Lesson;
  patch: (p: Partial<Lesson>) => void;
}) {
  const ex = lesson.exercise;
  if (!ex)
    return (
      <button
        className="add-section"
        onClick={() =>
          patch({
            exercise: {
              language: "python",
              prompt: "",
              starter: "",
              required: false,
              maxAttempts: 0,
              tests: [{ input: "", expected: "", hidden: false }],
            },
          })
        }
      >
        <Plus size={18} />
        Tambahkan latihan kode
      </button>
    );
  const update = (p: Partial<NonNullable<Lesson["exercise"]>>) => patch({ exercise: { ...ex, ...p } });
  return (
    <section className="config-card">
      <div className="section-heading">
        <h2>Latihan kode</h2>
        <button
          className="danger"
          onClick={() => patch({ exercise: undefined })}
        >
          Hapus latihan
        </button>
      </div>
      <div className="form-grid">
        <Field label="Bahasa">
          <select
            value={ex.language}
            onChange={(e) => update({ language: e.target.value as "python" | "javascript" | "cpp" })}
          >
            <option value="python">Python</option>
            <option value="javascript">JavaScript (Node.js)</option>
            <option value="cpp">C++</option>
          </select>
        </Field>
        <Field label="Batas percobaan (0 = tanpa batas)">
          <input
            type="number"
            min="0"
            max="100"
            value={ex.maxAttempts}
            onChange={(e) => update({ maxAttempts: Number(e.target.value) })}
          />
        </Field>
      </div>
      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={ex.required}
          onChange={(e) => update({ required: e.target.checked })}
        />
        Wajib lulus semua test case untuk membuka materi berikutnya
      </label>
      <Field label="Instruksi soal">
        <textarea
          rows={3}
          value={ex.prompt}
          onChange={(e) => update({ prompt: e.target.value })}
        />
      </Field>
      <Field label="Kode awal">
        <textarea
          className="mono"
          rows={5}
          value={ex.starter}
          onChange={(e) => update({ starter: e.target.value })}
        />
      </Field>
      <h3>Test case</h3>
      <p className="small">
        Program membaca standard input dan mencetak hasil ke standard output.
        Test tersembunyi tidak dikirim ke browser peserta.
      </p>
      {ex.tests.map((t, i) => (
        <div className="question-editor" key={i}>
          <div className="row spread">
            <strong>Test {i + 1}</strong>
            <button
              className="danger"
              disabled={ex.tests.length === 1}
              onClick={() =>
                update({ tests: ex.tests.filter((_, n) => n !== i) })
              }
            >
              <Trash2 size={14} />
              Hapus
            </button>
          </div>
          <div className="form-grid">
            <Field label="Input">
              <textarea
                className="mono"
                rows={3}
                value={t.input}
                onChange={(e) =>
                  update({
                    tests: ex.tests.map((x, n) =>
                      n === i ? { ...x, input: e.target.value } : x,
                    ),
                  })
                }
              />
            </Field>
            <Field label="Output yang diharapkan">
              <textarea
                className="mono"
                rows={3}
                value={t.expected}
                onChange={(e) =>
                  update({
                    tests: ex.tests.map((x, n) =>
                      n === i ? { ...x, expected: e.target.value } : x,
                    ),
                  })
                }
              />
            </Field>
          </div>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={t.hidden}
              onChange={(e) =>
                update({
                  tests: ex.tests.map((x, n) =>
                    n === i ? { ...x, hidden: e.target.checked } : x,
                  ),
                })
              }
            />
            Sembunyikan test dari peserta
          </label>
        </div>
      ))}
      <button
        className="secondary"
        disabled={ex.tests.length >= 8}
        onClick={() =>
          update({
            tests: [...ex.tests, { input: "", expected: "", hidden: true }],
          })
        }
      >
        <Plus size={16} />
        Tambah test case
      </button>
    </section>
  );
}
function SessionAdmin({
  courses,
  sessions,
  refresh,
}: {
  courses: Course[];
  sessions: Session[];
  refresh: () => Promise<void>;
}) {
  const empty = {
    courseId: courses[0]?.id || "",
    title: "",
    kind: "online" as "online" | "offline",
    startsAt: "",
    duration: 90,
    location: "",
    url: "",
    capacity: 12,
  };
  const [form, setForm] = useState<typeof empty & {id?:string}>(empty),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  return (
    <div className="session-admin">
      <form
        className="config-card"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            const iso = new Date(form.startsAt + ":00+07:00").toISOString();
            await api("/api/studio", {
              action: "saveSession",
              session: { ...form, startsAt: iso },
            });
            setForm(empty);
            setMessage("Jadwal tersimpan.");
            await refresh();
          } catch (cause) {
      const e = cause as Error & {status?: number};
            setError(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <h2>{form.id ? "Edit sesi" : "Jadwalkan sesi mentor"}</h2>
        <div className="form-grid">
          <Field label="Course">
            <select
              required
              value={form.courseId}
              onChange={(e) => setForm({ ...form, courseId: e.target.value })}
            >
              {courses.map((c) => (
                <option value={c.id} key={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Judul sesi">
            <input
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </Field>
          <Field label="Bentuk sesi">
            <select
              value={form.kind}
              onChange={(e) => setForm({ ...form, kind: e.target.value as "online" | "offline" })}
            >
              <option value="online">Live online</option>
              <option value="offline">Tatap muka</option>
            </select>
          </Field>
          <Field label="Tanggal dan waktu (WIB)">
            <input
              type="datetime-local"
              required
              value={form.startsAt}
              onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
            />
          </Field>
          <Field label="Durasi (menit)">
            <input
              type="number"
              min="15"
              max="480"
              value={form.duration}
              onChange={(e) =>
                setForm({ ...form, duration: Number(e.target.value) })
              }
            />
          </Field>
          <Field label="Kapasitas">
            <input
              type="number"
              min="1"
              max="500"
              value={form.capacity}
              onChange={(e) =>
                setForm({ ...form, capacity: Number(e.target.value) })
              }
            />
          </Field>
        </div>
        {form.kind === "online" ? (
          <Field label="Tautan meeting HTTPS">
            <input
              type="url"
              required
              placeholder="https://…"
              value={form.url}
              onChange={(e) => setForm({ ...form, url: e.target.value })}
            />
          </Field>
        ) : (
          <Field label="Lokasi tatap muka">
            <textarea
              required
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
            />
          </Field>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {message && (
          <p className="success-text" role="status">
            {message}
          </p>
        )}
        <button className="primary" disabled={busy || !courses.length}>
          <CalendarDays size={16} />
          Simpan jadwal
        </button>
        {form.id && (
          <button type="button" onClick={() => setForm(empty)}>
            Batal edit
          </button>
        )}
      </form>
      <div>
        <h2>Sesi terjadwal</h2>
        {!sessions.length && (
          <div className="empty">
            <CalendarDays size={28} />
            <p>Belum ada jadwal. Buat sesi pertama untuk peserta Anda.</p>
          </div>
        )}
        {sessions.map((s) => (
          <div className="session-card" key={s.id}>
            <span className="pill">
              {s.kind === "online" ? "Live online" : "Tatap muka"}
            </span>
            <h3>{s.title}</h3>
            <p>
              {localDate(s.startsAt)}
              <br />
              {s.count}/{s.capacity} peserta
            </p>
            <button
              className="secondary"
              onClick={() => {
                const date = new Date(Date.parse(s.startsAt) + 7 * 3600000)
                  .toISOString()
                  .slice(0, 16);
                setForm({
                  id: s.id,
                  courseId: s.courseId,
                  title: s.title,
                  kind: s.kind,
                  startsAt: date,
                  duration: s.duration,
                  location: s.location,
                  url: s.url,
                  capacity: s.capacity,
                });
              }}
            >
              Edit jadwal
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function CourseOverview({
  course,
  update,
}: {
  course: Course;
  update: (c: Course) => void;
}) {
  const o = course.overview || {
    outcomes: [],
    requirements: [],
    audience: "",
    mentorName: "",
    mentorBio: "",
    format: "self_paced" as const,
  };
  const patch = (p: Partial<NonNullable<Course["overview"]>>) =>
    update({ ...course, overview: { ...o, ...p } });
  return (
    <section className="config-card" style={{ marginTop: 24 }}>
      <div className="section-heading">
        <h3>Informasi halaman detail course</h3>
        <a
          className="secondary button-link"
          href={`/courses/${encodeURIComponent(course.id)}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          Lihat halaman detail
        </a>
      </div>
      <p className="small">
        Informasi ini tampil di katalog setelah course diterbitkan. Simpan
        perubahan sebelum membuka pratinjau.
      </p>
      <div className="form-grid">
        <Field
          label="Tujuan belajar"
          hint="Satu tujuan per baris, maksimal 20."
        >
          <textarea
            rows={4}
            value={o.outcomes.join("\n")}
            onChange={(e) => patch({ outcomes: e.target.value.split("\n") })}
          />
        </Field>
        <Field
          label="Prasyarat dan kebutuhan alat"
          hint="Satu kebutuhan per baris, maksimal 20."
        >
          <textarea
            rows={4}
            value={o.requirements.join("\n")}
            onChange={(e) =>
              patch({ requirements: e.target.value.split("\n") })
            }
          />
        </Field>
        <Field label="Peserta yang dituju">
          <textarea
            rows={3}
            value={o.audience}
            onChange={(e) => patch({ audience: e.target.value })}
          />
        </Field>
        <Field label="Format belajar">
          <select
            value={o.format}
            onChange={(e) =>
              patch({ format: e.target.value as typeof o.format })
            }
          >
            <option value="self_paced">Belajar mandiri</option>
            <option value="blended">Mandiri + sesi mentor</option>
          </select>
        </Field>
        <Field label="Nama mentor">
          <input
            value={o.mentorName}
            onChange={(e) => patch({ mentorName: e.target.value })}
          />
        </Field>
        <Field label="Profil mentor">
          <textarea
            rows={3}
            value={o.mentorBio}
            onChange={(e) => patch({ mentorBio: e.target.value })}
          />
        </Field>
      </div>
    </section>
  );
}
