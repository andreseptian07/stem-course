"use client";
import { useState, useEffect, useRef } from "react";
import { ClipboardList, Plus, ArrowLeft, RefreshCw } from "lucide-react";
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
async function api(classId: string, body?: unknown) {
  const r = await fetch(
    "/api/projects" + (!body ? "?class=" + encodeURIComponent(classId) : ""),
    body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : { cache: "no-store" },
  );
  const d: any = await r.json();
  if (!r.ok)
    throw Object.assign(new Error(d.error || "Permintaan belum berhasil."), {
      status: r.status,
    });
  return d;
}
export default function Projects({
  classId,
  userId,
  archived,
  isParticipant,
}: {
  classId: string;
  userId: string;
  archived: boolean;
  isParticipant: boolean;
}) {
  const [data, setData] = useState<any>(null),
    [selected, setSelected] = useState(""),
    [form, setForm] = useState<any>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [answer, setAnswer] = useState(""),
    [url, setUrl] = useState(""),
    [review, setReview] = useState<any>(null);
  const dirty = useRef(false);
  const task = data?.tasks.find((t: any) => t.id === selected),
    staff = !!data?.staff;
  const history =
    data?.submissions.filter((s: any) => s.assignmentId === selected) || [];
  const own = history
      .filter((s: any) => s.studentId === userId)
      .sort((a: any, b: any) => b.attempt - a.attempt),
    latest = own[0];
  const files: ProjectFile[] = data?.files || [];
  const drafts = files.filter((f) => f.assignmentId === selected && !f.submissionId);
  const incompleteUpload = drafts.some((f) => f.ready === 0);
  const canSubmit =
    isParticipant &&
    task?.status === "published" &&
    !archived &&
    (!latest || latest.status === "changes_requested");
  async function load() {
    const d = await api(classId);
    setData(d);
  }
  useEffect(() => {
    let live = true;
    setSelected(new URLSearchParams(location.search).get("task") || "");
    api(classId)
      .then((d) => {
        if (live) setData(d);
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
          .then(setData)
          .catch((e) => {
            setError(e.message);
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
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api(classId, body);
      dirty.current = false;
      setForm(null);
      setReview(null);
      setAnswer("");
      setUrl("");
      await load();
      setNotice(message);
    } catch (e) {
      setError((e as Error).message);
    } finally {
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
  const field = (key: string, value: any) => {
    dirty.current = true;
    setForm({ ...form, [key]: value });
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
        Anda; penilaian ini tidak mengubah kelulusan tes course.
      </p>
      {error && (
        <p className="class-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="class-notice" role="status">
          {notice}
        </p>
      )}
      {!data && !error && <p>Memuat tugas…</p>}
      {form && staff && !archived && (
        <form
          className="project-form"
          onSubmit={(e) => {
            e.preventDefault();
            mutate(
              {
                action: "saveAssignment",
                assignment: {
                  ...form,
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
                onChange={(e) => field("status", e.target.value)}
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
            {data.tasks.map((t: any) => {
              const submissions = data.submissions.filter(
                (s: any) => s.assignmentId === t.id,
              );
              const people = new Set(submissions.map((s: any) => s.studentId))
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
                        ? labels[submissions[0].status]
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
            <p className="project-text">{task.instructions}</p>
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
                <input type="file" accept=".pdf,.png,.jpg,.jpeg,.txt" disabled={busy || drafts.length >= 3 || data.uploadsAvailable === false}
                  onChange={(e) => {const file=e.target.files?.[0];e.target.value="";if(file) void upload(file);}} />
              </label>
              {data.uploadsAvailable === false && <p className="class-help">Upload belum tersedia. Anda tetap dapat mengirim penjelasan dan tautan pekerjaan.</p>}
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
          {history.map((s: any) => {
            const current = !history.some(
              (x: any) => x.studentId === s.studentId && x.attempt > s.attempt,
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
                    Buka proyek
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
                          setReview({ ...review, status: e.target.value });
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
                      <span>Nilai 0–100 (opsional)</span>
                      <input
                        type="number"
                        min={0}
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
