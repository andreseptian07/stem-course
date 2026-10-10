"use client";
import {clientFetch, responseJson} from '@/lib/client-fetch';
import { useState, useEffect, useRef } from "react";
import { ClipboardList, Plus, ArrowLeft, RefreshCw } from "lucide-react";
import type {projectList, assignmentSchema} from "@/lib/projects";
import type {z} from "zod";
type ProjectsData = Awaited<ReturnType<typeof projectList>>;
type AssignmentForm = Omit<z.infer<typeof assignmentSchema>,"dueAt"> & {dueAt:string};
type ReviewForm = {id:string;version:number;status:"accepted"|"changes_requested";feedback:string;score:string};
type ProjectFile = {
  id: string;
  assignmentId: string;
  submissionId: string | null;
  name: string;
  size: number;
  ready: number;
};
const labels: Record<string, string> = {
  draft: "Draft",
  published: "Pengumpulan dibuka",
  closed: "Pengumpulan ditutup",
  submitted: "Menunggu review",
  accepted: "Diterima",
  changes_requested: "Perlu revisi",
  stale:"Perlu mengerjakan revisi terbaru",
  configuration_required:"Syarat tugas sedang disiapkan",
};
const projectHost = (url: string) => {
  try { return new URL(url).hostname; } catch { return "Tautan tersimpan tidak valid"; }
};
const date = (s: string | null) =>
  s
    ? new Intl.DateTimeFormat("id-ID", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Jakarta",
      }).format(new Date(s)) + " WIB"
    : "Tanpa tenggat";
const local = (s: string | null) => {
  if (!s) return "";
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Jakarta",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(s))
      .map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
};
function api(classId: string): Promise<ProjectsData>;
function api(classId: string, body: unknown): Promise<unknown>;
async function api(classId: string, body?: unknown) {
  const r = await clientFetch(
    "/api/projects" + (!body ? "?class=" + encodeURIComponent(classId) : ""),
    body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : { cache: "no-store" },
  );
  return responseJson<ProjectsData>(r, !!body);
}
export default function Projects({
  classId,
  userId,
  archived,
  isParticipant,
  onChanged,
}: {
  classId: string;
  userId: string;
  archived: boolean;
  isParticipant: boolean;
  onChanged?:()=>Promise<void>;
}) {
  const [data, setData] = useState<ProjectsData | null>(null),
    [selected, setSelected] = useState(""),
    [form, setForm] = useState<AssignmentForm | null>(null),
    [error, setError] = useState(""),
    [backgroundError, setBackgroundError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [answer, setAnswer] = useState(""),
    [url, setUrl] = useState(""),
    [review, setReview] = useState<ReviewForm | null>(null);
  const dirty = useRef(false);
  const mutationInFlight = useRef(false);
  const retry=useRef<{key:string;id:string}|null>(null);
  const task = data?.tasks.find((t) => t.id === selected),
    staff = !!data?.staff;
  const requiredReview = data?.graduation?.lessons.flatMap(l => l.requiredReviews).find(r => r.assignmentId === selected);
  const history =
    data?.submissions.filter((s) => s.assignmentId === selected) || [];
  const own = history
      .filter((s) => s.studentId === userId)
      .sort((a, b) => b.attempt - a.attempt),
    latest = own[0];
  const files: ProjectFile[] = data?.files || [];
  const drafts = files.filter((f) => f.assignmentId === selected && !f.submissionId);
  const incompleteUpload = drafts.some((f) => f.ready === 0);
  const canSubmit =
    isParticipant &&
    task?.status === "published" &&
    !archived &&
    task?.canSubmit;
  async function load() {
    const d = await api(classId);
    setData(d);
    setBackgroundError("");
    setError("");
  }
  useEffect(() => {
    let live = true;
    const initialTask = new URLSearchParams(location.search).get("task") || "";
    api(classId)
      .then((d) => {
        if (live) {setData(d);setSelected(initialTask);}
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [classId]);
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible")
        api(classId)
          .then((next) => { setData(next); setBackgroundError(""); })
          .catch((e) => {
            setBackgroundError(e.message);
            if ([401, 403, 404].includes(e.status)) {
              setData(null);
              setForm(null);
              setReview(null);
              dirty.current = false;
            }
          });
    }, 15000);
    return () => clearInterval(timer);
  }, [classId]);
  useEffect(() => {
    const f = (e: BeforeUnloadEvent) => {
      if (dirty.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", f);
    return () => window.removeEventListener("beforeunload", f);
  }, []);
  function navigate(id: string) {
    if (dirty.current && !confirm("Isian belum disimpan. Tinggalkan isian?"))
      return false;
    dirty.current = false;
    const destination = new URL(location.href);
    destination.searchParams.set("class", classId);
    if (id) destination.searchParams.set("task", id);
    else destination.searchParams.delete("task");
    window.history.replaceState(null, "", destination.pathname + destination.search + destination.hash);
    setSelected(id);
    setForm(null);
    setReview(null);
    setAnswer("");
    setUrl("");
    setError("");
    setNotice("");
    return true;
  }
  async function mutate(body: unknown, message: string) {
    if (mutationInFlight.current) return;
    mutationInFlight.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if(body&&typeof body==="object"&&"action" in body&&["submit","review"].includes(String(body.action))){
        const value=body as Record<string,unknown>;
        const {id,requestId,...rest}=value;void id;void requestId;
        const key=JSON.stringify(rest);
        if(retry.current?.key!==key)retry.current={key,id:crypto.randomUUID()};
        body={...value,[value.action==="submit"?"id":"requestId"]:retry.current!.id};
      }
      await api(classId, body);
      retry.current=null;
      dirty.current = false;
      setForm(null);
      setReview(null);
      setAnswer("");
      setUrl("");
      setNotice(message);
      try{await load();await onChanged?.();}catch{setError("Perubahan sudah tersimpan, tetapi tampilan belum dimuat ulang. Muat ulang sebelum mengirim lagi.");}
    } catch (e) {
      setError((e as Error).message);
    } finally {
      mutationInFlight.current = false;
      setBusy(false);
    }
  }
  async function upload(file: File) {
    if (busy || !task) return;
    if (file.size > 5 * 1024 * 1024 || !file.size) {
      setError("Berkas harus berisi data dan maksimal 5 MB.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch(
        "/api/project-files?assignment=" + encodeURIComponent(task.id),
        { method: "POST", body: form },
      );
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Upload belum berhasil.");
      await load();
      setNotice("Lampiran diunggah. Kirim pekerjaan agar Tutor dapat mengaksesnya.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function removeFile(id: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/project-files", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Lampiran belum dapat dihapus.");
      await load();
      setNotice("Lampiran belum dikirim telah dihapus.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const draftFiles = !!drafts.length && (
    <ul className="project-files" aria-label="Lampiran belum dikirim">
      {drafts.map((file) => (
        <li key={file.id}>
          <span>
            {file.ready === 0 ? (
              <>{file.name} · Upload belum selesai, hapus lalu coba kembali.</>
            ) : (
              <a href={"/api/project-files/" + encodeURIComponent(file.id)}>{file.name}</a>
            )}
          </span>
          <span>{(file.size / 1024).toFixed(0)} KB</span>
          <button
            type="button"
            className="class-outline"
            disabled={busy}
            onClick={() => void removeFile(file.id)}
            aria-label={"Hapus lampiran " + file.name}
          >Hapus</button>
        </li>
      ))}
    </ul>
  );
  const field = <K extends keyof AssignmentForm>(key: K, value: AssignmentForm[K]) => {
    dirty.current = true;
    setForm(previous => previous ? {...previous, [key]: value} : previous);
  };
  return (
    <section
      className="class-panel projects-panel"
      aria-labelledby="projects-title"
    >
      <div className="class-section-head">
        <h2 id="projects-title">
          <ClipboardList size={21} /> Tugas proyek
        </h2>
        <div className="class-actions">
          <button
            className="class-outline"
            disabled={busy}
            onClick={() => load().catch((e) => setError(e.message))}
            aria-label="Muat ulang tugas"
          >
            <RefreshCw size={16} />
          </button>
          {staff && !archived && (
            <button
              className="class-primary"
              disabled={busy}
              onClick={() => {
                if (!navigate("")) return;
                setForm({
                  id: crypto.randomUUID(),
                  classId,
                  version: 0,
                  title: "",
                  instructions: "",
                  rubric:"",requirementId:null,
                  dueAt: "",
                  status: "draft",
                });
              }}
            >
              <Plus size={16} />
              Buat tugas
            </button>
          )}
        </div>
      </div>
      <p className="class-help">
        Kumpulkan penjelasan hasil, lampiran, dan tautan proyek. Mentor meninjau pekerjaan
        Anda. Tugas wajib mengikuti standar nilai course dan status Diterima untuk melanjutkan materi.
      </p>
      {(error || backgroundError) && (
        <p className="class-error" role="alert">
          {error || backgroundError}
        </p>
      )}
      {notice && (
        <p className="class-notice" role="status">
          {notice}
        </p>
      )}
      {!data && !error && <p>Memuat tugas…</p>}
      {form && data && staff && !archived && (
        <form
          className="project-form"
          onSubmit={(e) => {
            e.preventDefault();
            mutate(
              {
                action: "saveAssignment",
                assignment: {
                  id:form.id,classId:form.classId,version:form.version,title:form.title,instructions:form.instructions,
                  rubric:form.rubric||"",requirementId:form.requirementId||null,status:form.status,
                  ...(form.change?.reason?.trim()?{change:form.change}:{}),
                  dueAt: form.dueAt
                    ? new Date(form.dueAt + ":00+07:00").toISOString()
                    : null,
                },
              },
              "Tugas tersimpan.",
            );
          }}
        >
          <h3>{form.version ? "Pengaturan tugas" : "Tugas baru"}</h3>
          <label className="class-field">
            <span>Judul tugas</span>
            <input
              required
              maxLength={160}
              value={form.title}
              onChange={(e) => field("title", e.target.value)}
            />
          </label>
          <label className="class-field">
            <span>Instruksi dan kriteria penilaian</span>
            <textarea
              required
              rows={6}
              maxLength={8000}
              value={form.instructions}
              onChange={(e) => field("instructions", e.target.value)}
            />
          </label>
          <label className="class-field"><span>Rubrik penilaian</span><textarea rows={3} value={form.rubric||""} maxLength={8000} onChange={e=>field("rubric",e.target.value)}/></label>
          <label className="class-field"><span>Syarat review materi</span><select value={form.requirementId||""} disabled={!!task?.requirementId} onChange={e=>{const r=data.requirements.find((r)=>r.id===e.target.value);setForm({...form,requirementId:r?.id||null,...(r?{instructions:r.instructions,rubric:r.rubric,title:r.title}:{})});dirty.current=true;}}><option value="">Tugas opsional</option>{data.requirements?.map((r)=><option value={r.id} key={r.id}>{r.lessonTitle} · {r.title}</option>)}</select></label>
          {data.owner&&form.version>0&&<div className="context-card"><label className="class-field"><span>Dampak perubahan instruksi/rubrik</span><select value={form.change?.kind||"substantial"} onChange={e=>field("change",{kind:e.target.value as "editorial" | "substantial",reason:form.change?.reason||""})}><option value="substantial">Substansial: wajib mengirim ulang</option><option value="editorial">Editorial: koreksi tanpa perubahan makna</option></select></label>{form.change?.kind==="editorial"&&<label className="class-field"><span>Alasan konfirmasi editorial Admin</span><textarea required maxLength={2000} value={form.change.reason} onChange={e=>field("change",{kind:form.change?.kind || "substantial",reason:e.target.value})}/></label>}<p>Sertifikat yang sudah terbit tetap merekam hasil saat diterbitkan.</p></div>}
          <div className="class-form-grid">
            <label className="class-field">
              <span>Tenggat (WIB, opsional)</span>
              <input
                type="datetime-local"
                value={form.dueAt}
                onChange={(e) => field("dueAt", e.target.value)}
              />
            </label>
            <label className="class-field">
              <span>Status tugas</span>
              <select
                value={form.status}
                onChange={(e) => field("status", e.target.value as "draft" | "published" | "closed")}
              >
                <option value="draft">Draft</option>
                <option value="published">Pengumpulan dibuka</option>
                <option value="closed">Pengumpulan ditutup</option>
              </select>
            </label>
          </div>
          <p className="class-help">
            Kiriman terlambat tetap diterima dan ditandai. Tutup pengumpulan
            untuk menghentikan kiriman baru. Tugas yang sudah menerima kiriman
            tidak dapat dikembalikan menjadi draft.
          </p>
          <div className="class-actions">
            <button className="class-primary" disabled={busy}>
              Simpan tugas
            </button>
            <button
              type="button"
              className="class-outline"
              onClick={() => navigate(selected)}
            >
              Batalkan
            </button>
          </div>
        </form>
      )}
      {!form && !task && data && (
        <>
          <div className="project-task-list">
            {data.tasks.map((t) => {
              const academicReview = data.graduation?.lessons.flatMap(l => l.requiredReviews).find(r => r.assignmentId === t.id);
              const submissions = data.submissions.filter(
                (s) => s.assignmentId === t.id,
              );
              const people = new Set(submissions.map((s) => s.studentId))
                .size;
              return (
                <button
                  className="project-task"
                  key={t.id}
                  onClick={() => navigate(t.id)}
                >
                  <span className="class-badge">{labels[t.status]}</span>
                  <h3>{t.title}</h3>
                  <p>{date(t.dueAt)}</p>
                  <small>
                    {staff
                      ? `${people} peserta mengirim`
                      : submissions.length
                        ? labels[academicReview?.status === "stale" ? "stale" : submissions[0].status]
                        : "Belum ada kiriman"}
                  </small>
                </button>
              );
            })}
          </div>
          {!data.tasks.length && (
            <p>
              Belum ada tugas
              {staff
                ? ". Buat tugas pertama untuk kelas ini."
                : " yang dibuka mentor."}
            </p>
          )}
        </>
      )}
      {!form && task && (
        <>
          <div className="class-section-head">
            <button className="class-outline" onClick={() => navigate("")}>
              <ArrowLeft size={16} />
              Semua tugas
            </button>
            {staff && !archived && (
              <button
                className="class-outline"
                onClick={() => {
                  if (
                    dirty.current &&
                    !confirm("Tinggalkan isian yang belum disimpan?")
                  )
                    return;
                  dirty.current = false;
                  setForm({ ...task, dueAt: local(task.dueAt) });
                }}
              >
                Pengaturan tugas
              </button>
            )}
          </div>
          <div className="project-brief">
            <span className="class-badge">{labels[task.status]}</span>
            <h3>{task.title}</h3>
            <p>
              {date(task.dueAt)} · Versi instruksi {task.version}
            </p>
            <p className="project-text">{task.locked?task.blocker:task.instructions}</p>{!task.locked&&task.rubric&&<p className="project-text">Rubrik: {task.rubric}</p>}<p>{task.requirementId?`Review wajib: minimal ${data?.reviewPassThreshold ?? 80} dan Diterima untuk melanjutkan.`:"Tugas opsional; tidak menahan kelulusan materi."}</p>
            {requiredReview?.status === "stale" && <p>Hasil sebelumnya tetap tersimpan sebagai riwayat. Kerjakan ulang tugas ini sesuai revisi penilaian terbaru.</p>}
          </div>
          {canSubmit && (
            <form
              className="project-form"
              onSubmit={(e) => {
                e.preventDefault();
                mutate(
                  {
                    action: "submit",
                    id: crypto.randomUUID(),
                    assignmentId: task.id,
                    assignmentVersion: task.version,
                    previousId: latest?.id || null,
                    previousVersion: latest?.version || 0,
                    attachmentIds: drafts.filter((f) => f.ready !== 0).map((f) => f.id),
                    body: answer,
                    url,
                  },
                  "Kiriman tersimpan. Tunggu review mentor.",
                );
              }}
            >
              <h3>{latest ? "Kirim revisi" : "Kumpulkan pekerjaan"}</h3>
              <label className="class-field">
                <span>Penjelasan hasil dan langkah pengerjaan</span>
                <textarea
                  required
                  rows={5}
                  maxLength={10000}
                  value={answer}
                  onChange={(e) => {
                    dirty.current = true;
                    setAnswer(e.target.value);
                  }}
                />
              </label>
              <label className="class-field">
                <span>
                  Tautan repositori, demo, atau dokumen (HTTPS, opsional)
                </span>
                <input
                  type="url"
                  maxLength={2000}
                  placeholder="https://…"
                  value={url}
                  onChange={(e) => {
                    dirty.current = true;
                    setUrl(e.target.value);
                  }}
                />
              </label>
              <label className="class-field">
                <span>Lampiran pekerjaan (opsional)</span>
                <input type="file" accept=".pdf,.png,.jpg,.jpeg,.txt" disabled={busy || drafts.length >= 3 || data?.uploadsAvailable === false}
                  onChange={(e) => {const file=e.target.files?.[0];e.target.value="";if(file) void upload(file);}} />
              </label>
              {data?.uploadsAvailable === false && <p className="class-help">Upload belum tersedia. Anda tetap dapat mengirim penjelasan dan tautan pekerjaan.</p>}
              <p className="class-help">PDF, PNG, JPEG, atau TXT · maksimal 5 MB per berkas dan 3 lampiran per kiriman. Lampiran tersimpan sampai Anda mengirim atau menghapusnya.</p>
              {draftFiles}
              <p className="class-help">
                Pastikan mentor dapat membuka tautan Anda. Kiriman tersimpan
                sebagai riwayat dan dapat direvisi setelah mentor meminta
                perbaikan.
              </p>
              <button className="class-primary" disabled={busy || incompleteUpload}>
                Kirim pekerjaan
              </button>
            </form>
          )}
          {!canSubmit && drafts.length > 0 && <div><h3>Lampiran belum dikirim</h3>{draftFiles}</div>}
          {!staff && latest && !canSubmit && (
            <p className="class-help">
              {latest.status === "submitted"
                ? "Pekerjaan sedang menunggu review mentor."
                : latest.status === "accepted"
                  ? "Pekerjaan Anda telah diterima."
                  : "Pengumpulan sedang ditutup."}
            </p>
          )}
          <h3>
            {staff ? "Kiriman peserta" : "Riwayat pekerjaan saya"} (
            {history.length})
          </h3>
          {!history.length && <p>Belum ada pekerjaan yang dikumpulkan.</p>}
          {history.map((s) => {
            const current = !history.some(
              (x) => x.studentId === s.studentId && x.attempt > s.attempt,
            );
            return (
              <article key={s.id} className="project-submission">
                <div className="class-section-head">
                  <h4>
                    {s.studentName} · Kiriman {s.attempt}
                  </h4>
                  <span className="class-badge">
                    {labels[s.status]}
                    {s.late ? " · Terlambat" : ""}
                  </span>
                </div>
                <small>
                  {date(s.submittedAt)} · Instruksi versi {s.assignmentVersion}
                  {!current ? " · Riwayat" : ""}
                </small>
                <p className="project-text">{s.body}</p>
                {s.url && (
                  <a
                    className="class-outline"
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Buka proyek · {projectHost(s.url)}
                  </a>
                )}
                {files.some((f) => f.submissionId === s.id) && <ul className="project-files" aria-label="Lampiran kiriman">
                  {files.filter((f) => f.submissionId === s.id).map((f) => <li key={f.id}>
                    <a href={"/api/project-files/" + encodeURIComponent(f.id)}>Unduh {f.name}</a><span>{(f.size / 1024).toFixed(0)} KB</span>
                  </li>)}
                </ul>}
                <details>
                  <summary>Instruksi saat dikirim</summary>
                  <p className="project-text">{s.instructions}</p>
                </details>
                {s.feedback && (
                  <div className="project-review">
                    <strong>
                      Feedback {s.reviewerName}
                      {s.score !== null ? ` · Nilai ${s.score}/100` : ""}
                    </strong>
                    <p className="project-text">{s.feedback}</p>
                    <small>{date(s.reviewedAt)}</small>
                  </div>
                )}
                {staff && current && !archived && review?.id !== s.id && (
                  <button
                    className="class-outline"
                    disabled={busy}
                    onClick={() => {
                      if (
                        dirty.current &&
                        !confirm("Tinggalkan isian yang belum disimpan?")
                      )
                        return;
                      dirty.current = false;
                      setReview({
                        id: s.id,
                        version: s.version,
                        status:
                          s.status === "accepted"
                            ? "accepted"
                            : "changes_requested",
                        feedback: s.feedback,
                        score: s.score === null ? "" : String(s.score),
                      });
                    }}
                  >
                    Review pekerjaan {s.studentName}
                  </button>
                )}
                {s.rubric&&<p className="project-text">Rubrik saat dikirim: {s.rubric}</p>}{s.reviewPassThreshold!==undefined&&<p>Standar nilai saat dikirim: minimal {s.reviewPassThreshold} dan Diterima.</p>}
                {data?.reviewHistory?.some((r:{submissionId:string})=>r.submissionId===s.id)&&<details><summary>Riwayat review kiriman ini</summary>{data?.reviewHistory.filter((r:{submissionId:string})=>r.submissionId===s.id).map((r:{id:string;sequence:number;status:string;score:number|null;feedback:string;reviewerName:string;reviewedAt:string})=><div className="context-card" key={r.id}><b>Review {r.sequence}: {labels[r.status]||r.status}{r.score!==null?` · Nilai ${r.score}/100`:" · Belum ada nilai"}</b><p className="project-text">{r.feedback}</p><small>{r.reviewerName} · {date(r.reviewedAt)}</small></div>)}</details>}
                {staff && !archived && current && review?.id === s.id && (
                  <form
                    className="project-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      mutate(
                        {
                          action: "review",
                          submissionId: s.id,
                          version: review.version,
                          status: review.status,
                          feedback: review.feedback,
                          score:
                            review.score === "" ? null : Number(review.score),
                        },
                        "Review tersimpan untuk peserta.",
                      );
                    }}
                  >
                    <label className="class-field">
                      <span>Hasil review</span>
                      <select
                        value={review.status}
                        onChange={(e) => {
                          dirty.current = true;
                          setReview({ ...review, status: e.target.value as "accepted" | "changes_requested" });
                        }}
                      >
                        <option value="changes_requested">Perlu revisi</option>
                        <option value="accepted">Diterima</option>
                      </select>
                    </label>
                    <label className="class-field">
                      <span>Feedback review</span>
                      <textarea
                        required
                        rows={4}
                        maxLength={8000}
                        value={review.feedback}
                        onChange={(e) => {
                          dirty.current = true;
                          setReview({ ...review, feedback: e.target.value });
                        }}
                      />
                    </label>
                    <label className="class-field">
                      <span>{task.requirementId&&review.status==="accepted"?`Nilai ${data?.reviewPassThreshold ?? 80}–100 (wajib untuk Diterima)`:"Nilai 0–100 (opsional)"}</span>
                      <input
                        type="number"
                        min={task.requirementId&&review.status==="accepted"?(data?.reviewPassThreshold ?? 80):0}
                        required={!!task.requirementId&&review.status==="accepted"}
                        max={100}
                        step={1}
                        value={review.score}
                        onChange={(e) => {
                          dirty.current = true;
                          setReview({ ...review, score: e.target.value });
                        }}
                      />
                    </label>
                    <div className="class-actions">
                      <button className="class-primary" disabled={busy}>
                        Simpan review
                      </button>
                      <button
                        type="button"
                        className="class-outline"
                        onClick={() => {
                          if (
                            !dirty.current ||
                            confirm("Batalkan isian review?")
                          ) {
                            setReview(null);
                            dirty.current = false;
                          }
                        }}
                      >
                        Batalkan review
                      </button>
                    </div>
                  </form>
                )}
              </article>
            );
          })}
        </>
      )}
    </section>
  );
}
