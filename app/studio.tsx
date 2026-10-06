"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import {
  BookOpen,
  Code2,
  CalendarDays,
  MessageCircle,
  Settings2,
  Check,
  LockKeyhole,
  CirclePlay,
  PanelLeft,
  Layers3,
  CircuitBoard,
  Clock3,
  CheckCircle2,
  Send,
  MapPin,
  Video,
  Loader2,
  Plus,
  RefreshCw,
  LogOut,
  ChevronDown,
} from "lucide-react";
import type {
  State,
  PublicCourse,
  PublicLesson,
  Progress,
  Session,
  Discussion,
  Block,
} from "@/lib/model";
import Admin from "./admin";
export async function api(path = "/api/studio", body?: unknown) {
  const r = await fetch(
    path,
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
    throw Object.assign(new Error(d.error || "Permintaan gagal."), {
      status: r.status,
    });
  return d;
}
export function localDate(value: string) {
  return (
    new Intl.DateTimeFormat("id-ID", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Jakarta",
    }).format(new Date(value)) + " WIB"
  );
}
export default function Studio() {
  const [state, setState] = useState<State | null>(null),
    [failure, setFailure] = useState(""),
    [signIn, setSignIn] = useState(false),
    [view, setView] = useState("learn"),
    [adminDirty, setAdminDirty] = useState(false),
    [courseId, setCourseId] = useState(""),
    [lessonId, setLessonId] = useState(""),
    [mobile, setMobile] = useState(false),
    [discussion, setDiscussion] = useState(false),
    [notice, setNotice] = useState("");
  const load = useCallback(async () => {
    try {
      const data = await api();
      setState(data);
      setFailure("");
      setSignIn(false);
    } catch (e: any) {
      setFailure(e.message);
      setSignIn(e.status === 401);
    }
  }, []);
  useEffect(() => {
    void load();
    const q = new URLSearchParams(location.search);
    setCourseId(q.get("course") || "");
    setLessonId(q.get("lesson") || "");
    if (q.get("view") === "sessions" || q.get("view") === "admin")
      setView(q.get("view")!);
  }, [load]);
  const course =
    state?.courses.find((c) => c.id === courseId) || state?.courses[0];
  const lesson =
    course?.lessons.find((l) => l.id === lessonId) || course?.lessons[0];
  const progress: Progress[] = course ? state?.progress[course.id] || [] : [];
  const p = lesson
    ? progress.find(
        (p) => p.lessonId === lesson.id && p.revision === lesson.revision,
      )
    : undefined;
  const selectLesson = (l: PublicLesson) => {
    setNotice("");
    if (l.locked) {
      setNotice(`Lulus tes pada “${l.blocker}” untuk membuka materi ini.`);
      return;
    }
    setLessonId(l.id);
    setDiscussion(false);
    setMobile(false);
    setView("learn");
    history.replaceState(null, "", `?course=${course?.id}&lesson=${l.id}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const toolsState = useRef({ state, course, lesson, view, selectLesson });
  toolsState.current = { state, course, lesson, view, selectLesson };
  useEffect(() => {
    const ctx = (document as any).modelContext;
    if (!ctx?.registerTool) return;
    const lifecycle = new AbortController();
    const register = (tool: any) =>
      Promise.resolve(
        ctx.registerTool(tool, { signal: lifecycle.signal }),
      ).catch(() => {});
    register({
      name: "read_learning_state",
      description:
        "Read visible courses, lesson titles, locks, and current view. Does not complete lessons.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: () => ({
        view: toolsState.current.view,
        course: toolsState.current.course?.title,
        lesson: toolsState.current.lesson?.title,
        courses: (toolsState.current.state?.courses || []).map((c) => ({
          id: c.id,
          title: c.title,
          lessons: c.lessons.map((l) => ({
            id: l.id,
            title: l.title,
            locked: l.locked,
          })),
        })),
      }),
    });
    register({
      name: "open_lesson",
      description:
        "Navigate to an unlocked lesson in the selected course. Does not change completion or submit tests.",
      inputSchema: {
        type: "object",
        properties: { lessonId: { type: "string" } },
        required: ["lessonId"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: (input: any) => {
        const l = toolsState.current.course?.lessons.find(
          (l) => l.id === input?.lessonId,
        );
        if (!l || l.locked)
          throw new Error("Materi tidak tersedia atau masih terkunci.");
        toolsState.current.selectLesson(l);
        return { opened: l.id };
      },
    });
    return () => lifecycle.abort();
  }, []);
  const done =
    course?.lessons.filter((l) =>
      progress.some(
        (p) => p.lessonId === l.id && p.revision === l.revision && p.complete,
      ),
    ).length || 0;
  const percent = course?.lessons.length
    ? Math.round((done / course.lessons.length) * 100)
    : 0;
  return (
    <div className="studio">
      <header className="topbar">
        <a className="brand" href="/">
          <span className="brand-mark">
            <Layers3 size={23} />
          </span>
          <strong>
            STEM<span>studio</span>
          </strong>
        </a>
        <nav>
          {[
            ["learn", "Ruang belajar", BookOpen],
            ["sessions", "Sesi mentor", CalendarDays],
            ...(state?.user.role === "owner"
              ? [["admin", "Kelola course", Settings2]]
              : []),
          ].map(([key, label, Icon]: any) => (
            <button
              key={key}
              aria-label={label}
              className={view === key ? "active" : ""}
              onClick={() => {
                if (
                  view === "admin" &&
                  key !== "admin" &&
                  adminDirty &&
                  !confirm("Abaikan perubahan course yang belum disimpan?")
                )
                  return;
                setView(key);
                setMobile(false);
              }}
            >
              <Icon size={17} />
              {label}
            </button>
          ))}
        </nav>
        {state && (
          <a
            className="icon-button"
            title="Keluar"
            aria-label="Keluar"
            href="/signout-with-chatgpt?return_to=/"
          >
            <LogOut size={16} />
          </a>
        )}
        <a
          className="avatar"
          title="Dashboard dan profil saya"
          aria-label="Dashboard dan profil saya"
          href="/dashboard"
        >
          ST
        </a>
      </header>
      {!state ? (
        <main className="welcome">
          <div className="mentor-icon">
            <BookOpen size={25} />
          </div>
          <span className="eyebrow teal">RUANG BELAJAR STEM</span>
          <h1>
            Bangun pemahaman.
            <br />
            Wujudkan lewat praktik.
          </h1>
          <p>
            {signIn
              ? "Masuk untuk membuka materi, menyimpan progres, dan berdiskusi dengan mentor."
              : failure || "Menyiapkan ruang belajar Anda…"}
          </p>
          {signIn ? (
            <a
              className="primary button-link"
              href={`/signin-with-chatgpt?return_to=${encodeURIComponent("/learn" + (typeof location !== "undefined" ? location.search : ""))}`}
              target="_top"
            >
              Masuk dengan ChatGPT
            </a>
          ) : failure ? (
            <button className="secondary" onClick={load}>
              <RefreshCw size={17} />
              Coba lagi
            </button>
          ) : (
            <Loader2 className="spin" />
          )}
        </main>
      ) : view === "admin" ? (
        <Admin
          reload={load}
          onDirtyChange={setAdminDirty}
          onPreview={(c, l) => {
            setCourseId(c);
            setLessonId(l);
            setView("learn");
          }}
        />
      ) : view === "sessions" ? (
        <main className="full-page">
          <div className="eyebrow teal">BELAJAR BERSAMA</div>
          <h1>Sesi bersama mentor</h1>
          <p>Ruang untuk bertanya, membahas proyek, dan berlatih bersama.</p>
          <SessionList
            sessions={state.sessions}
            courses={state.courses}
            refresh={load}
          />
        </main>
      ) : !course ? (
        <main className="welcome">
          <BookOpen size={36} />
          <h1>Course pertama sedang disiapkan</h1>
          <p>Materi akan muncul di sini setelah diterbitkan pengajar.</p>
          {state.user.role === "owner" && (
            <button className="primary" onClick={() => setView("admin")}>
              Buat course
            </button>
          )}
        </main>
      ) : (
        <div className="workspace">
          <aside className={`outline ${mobile ? "mobile-open" : ""}`}>
            <div className="eyebrow">
              LEARNING PATH / {course.category.toUpperCase()}
            </div>
            {state.courses.length > 1 ? (
              <select
                className="course-select"
                aria-label="Pilih course"
                value={course.id}
                onChange={(e) => {
                  setCourseId(e.target.value);
                  setLessonId("");
                  setDiscussion(false);
                }}
              >
                {state.courses.map((c) => (
                  <option value={c.id} key={c.id}>
                    {c.title}
                    {!c.published ? " (Draft)" : ""}
                  </option>
                ))}
              </select>
            ) : (
              <h2>{course.title}</h2>
            )}
            <div className="progress-caption">
              <span>
                {done} dari {course.lessons.length} materi selesai
              </span>
              <b>{percent}%</b>
            </div>
            <div className="progress">
              <span style={{ width: percent + "%" }} />
            </div>
            <div className="outline-label">
              KURIKULUM <span>{course.level}</span>
            </div>
            {course.lessons.map((l, i) => (
              <div key={l.id}>
                {(i === 0 || course.lessons[i - 1].module !== l.module) && (
                  <h4>{l.module}</h4>
                )}
                <button
                  className={`lesson ${l.id === lesson?.id ? "active" : ""} ${l.locked ? "locked" : ""}`}
                  aria-current={l.id === lesson?.id ? "step" : undefined}
                  onClick={() => selectLesson(l)}
                >
                  {l.locked ? (
                    <LockKeyhole size={17} />
                  ) : progress.some(
                      (p) =>
                        p.lessonId === l.id &&
                        p.revision === l.revision &&
                        p.complete,
                    ) ? (
                    <CheckCircle2 size={17} />
                  ) : l.exercise ? (
                    <Code2 size={17} />
                  ) : (
                    <BookOpen size={17} />
                  )}
                  <span>
                    {l.title}
                    <small>
                      {l.exercise
                        ? "Latihan kode"
                        : l.quiz?.mode === "required"
                          ? "Materi & tes wajib"
                          : "Materi"}{" "}
                      · {l.minutes} menit
                    </small>
                  </span>
                </button>
              </div>
            ))}
            <div className="sidebar-bottom">
              <CircuitBoard size={24} />
              <div>
                Belajar. Rangkai. Temukan.
                <small>Satu konsep, satu langkah nyata.</small>
              </div>
            </div>
          </aside>
          <main className="learning">
            <div className="lesson-toolbar">
              <button
                className="icon-button"
                aria-label="Buka daftar materi"
                onClick={() => setMobile(!mobile)}
              >
                <PanelLeft size={18} />
              </button>
              <span>{lesson?.module || "Course baru"}</span>
              <span>
                {lesson ? course.lessons.indexOf(lesson) + 1 : 0} dari{" "}
                {course.lessons.length}
              </span>
            </div>
            {notice && (
              <div className="banner" role="status">
                {notice}
              </div>
            )}
            {lesson ? (
              <div className="lesson-grid">
                <article>
                  <div className="eyebrow teal">
                    {course.category.toUpperCase()} /{" "}
                    {lesson.module.toUpperCase()}
                  </div>
                  <h1>{lesson.title}</h1>
                  <div className="meta">
                    <span>
                      <BookOpen size={15} />{" "}
                      {lesson.exercise ? "Praktik kode" : "Materi"}
                    </span>
                    <span>
                      <Clock3 size={15} /> {lesson.minutes} menit
                    </span>
                    {course.sample && (
                      <span className="pill">Course contoh</span>
                    )}
                    {p?.complete === 1 && (
                      <span className="pill">
                        <Check size={13} />
                        Selesai
                      </span>
                    )}
                  </div>
                  <div className="content-tabs">
                    <button
                      className={!discussion ? "active" : ""}
                      onClick={() => setDiscussion(false)}
                    >
                      Materi & latihan
                    </button>
                    <button
                      className={discussion ? "active" : ""}
                      onClick={() => setDiscussion(true)}
                    >
                      <MessageCircle size={15} />
                      Diskusi mentor
                    </button>
                  </div>
                  {lesson.locked ? (
                    <div className="empty">
                      <LockKeyhole size={30} />
                      <h2>Materi masih terkunci</h2>
                      <p>Lulus tes pada {lesson.blocker} terlebih dahulu.</p>
                    </div>
                  ) : discussion ? (
                    <DiscussionPanel
                      key={course.id + lesson.id}
                      courseId={course.id}
                      lessonId={lesson.id}
                    />
                  ) : (
                    <>
                      {lesson.blocks.length ? (
                        lesson.blocks.map((b) => (
                          <RenderBlock key={b.id} block={b} />
                        ))
                      ) : (
                        <div className="empty">
                          Pengajar sedang menyiapkan isi materi.
                        </div>
                      )}
                      {lesson.quiz && (
                        <QuizPanel
                          key={lesson.id + "quiz" + lesson.revision}
                          courseId={course.id}
                          lesson={lesson}
                          progress={p}
                          refresh={load}
                        />
                      )}{" "}
                      {lesson.exercise && (
                        <CodePanel
                          key={lesson.id + "code" + lesson.revision}
                          courseId={course.id}
                          lesson={lesson}
                          ready={state.judgeReady}
                          progress={p}
                          refresh={load}
                        />
                      )}
                      <Completion
                        course={course}
                        lesson={lesson}
                        progress={p}
                        refresh={load}
                        next={() => {
                          const next =
                            course.lessons[course.lessons.indexOf(lesson) + 1];
                          if (next) selectLesson(next);
                        }}
                      />
                    </>
                  )}
                </article>
                <aside className="context">
                  <div className="context-card">
                    <span className="eyebrow">PENDAMPINGAN MENTOR</span>
                    <div className="mentor-icon">
                      <MessageCircle size={23} />
                    </div>
                    <h3>Ada yang belum jelas?</h3>
                    <p>Diskusikan konsep dan kendala praktik bersama mentor.</p>
                    <button
                      className="secondary"
                      onClick={() => setDiscussion(true)}
                    >
                      Buka diskusi
                    </button>
                  </div>
                  <div className="context-card quiet">
                    <CalendarDays size={22} />
                    <h3>Temui mentor Anda</h3>
                    <p>
                      {state.sessions.find(
                        (s) =>
                          s.courseId === course.id &&
                          Date.parse(s.startsAt) > Date.now(),
                      )?.title ||
                        "Sesi live dan tatap muka akan tampil setelah dijadwalkan pengajar."}
                    </p>
                    <button
                      className="text-button"
                      onClick={() => setView("sessions")}
                    >
                      Lihat jadwal sesi
                    </button>
                  </div>
                </aside>
              </div>
            ) : (
              <div className="empty">
                <h2>Belum ada materi</h2>
                <p>Tambahkan materi pertama dari Kelola course.</p>
              </div>
            )}
          </main>
        </div>
      )}
    </div>
  );
}
function RenderBlock({ block: b }: { block: Block }) {
  if (b.type === "heading")
    return <h2 className="block-heading">{b.content}</h2>;
  if (b.type === "callout")
    return <div className="intro-note">{b.content}</div>;
  if (b.type === "code")
    return (
      <pre className="code-block">
        <code>{b.content}</code>
      </pre>
    );
  if (b.type === "image")
    return b.content ? (
      <figure>
        <img
          className="lesson-image"
          src={b.content}
          alt={b.caption || "Diagram materi"}
          loading="lazy"
        />
        {b.caption && <figcaption>{b.caption}</figcaption>}
      </figure>
    ) : null;
  if (b.type === "video") {
    if (!b.content)
      return (
        <div className="empty">
          <Video size={25} />
          <p>Video belum ditambahkan pengajar.</p>
        </div>
      );
    let embed = "";
    try {
      const u = new URL(b.content);
      if (["www.youtube.com", "youtube.com", "youtu.be"].includes(u.hostname)) {
        const id =
          u.hostname === "youtu.be"
            ? u.pathname.slice(1)
            : u.searchParams.get("v") || u.pathname.split("/").pop();
        if (id && /^[\w-]{11}$/.test(id))
          embed = `https://www.youtube-nocookie.com/embed/${id}`;
      }
      if (
        ["vimeo.com", "www.vimeo.com"].includes(u.hostname) &&
        /^\/\d+$/.test(u.pathname)
      )
        embed = "https://player.vimeo.com/video" + u.pathname;
    } catch {}
    return (
      <figure>
        {embed ? (
          <iframe
            className="video"
            src={embed}
            title={b.caption || "Video penjelasan"}
            allow="fullscreen; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <video className="video" controls preload="metadata" src={b.content}>
            Browser Anda tidak mendukung video.
          </video>
        )}
        {b.caption && <figcaption>{b.caption}</figcaption>}
      </figure>
    );
  }
  if (b.type === "diagram") {
    const labels = b.content.split("|").slice(0, 3);
    return (
      <div className="system-diagram">
        {labels.map((label, i) => (
          <div key={i} className={i === 1 ? "featured" : ""}>
            <span>0{i + 1}</span>
            {i === 1 && <CircuitBoard size={30} />}
            <b>{label}</b>
            <small>{["Masukan", "Pemrosesan", "Keluaran"][i]}</small>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="rich-text">
      {b.content.split("\n\n").map((p, i) => (
        <p key={i}>{p}</p>
      ))}
    </div>
  );
}
function QuizPanel({
  courseId,
  lesson,
  progress,
  refresh,
}: {
  courseId: string;
  lesson: PublicLesson;
  progress?: Progress;
  refresh: () => Promise<void>;
}) {
  const q = lesson.quiz!;
  const [answers, setAnswers] = useState<Record<string, number[]>>({}),
    [result, setResult] = useState<any>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const capped =
    q.maxAttempts > 0 && (progress?.quizAttempts || 0) >= q.maxAttempts;
  async function submit() {
    setBusy(true);
    setError("");
    try {
      setResult(
        await api("/api/studio", {
          action: "quiz",
          courseId,
          lessonId: lesson.id,
          answers,
        }),
      );
      await refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="assessment">
      <div className="assessment-head">
        <div>
          <span className="eyebrow teal">CEK PEMAHAMAN</span>
          <h2>
            {q.mode === "required"
              ? "Selesaikan sebelum melanjutkan"
              : "Tinjau pemahaman Anda"}
          </h2>
        </div>
        <span className="pill">
          {q.mode === "required" ? "Wajib lulus" : "Review"}
        </span>
      </div>
      <p className="small">
        {q.mode === "required"
          ? `Nilai minimum ${q.threshold}. Materi berikutnya terbuka setelah lulus.`
          : "Latihan ini tidak mengunci materi selanjutnya."}{" "}
        {q.maxAttempts
          ? `Maksimal ${q.maxAttempts} percobaan.`
          : "Anda boleh mencoba kembali."}
      </p>
      {q.questions.map((item, i) => (
        <fieldset key={item.id}>
          <legend>
            {i + 1}. {item.prompt}
          </legend>
          <small className="muted">
            Pilih jawaban yang sesuai; dapat lebih dari satu.
          </small>
          {item.options.map((option, index) => (
            <label
              className={`option ${(answers[item.id] || []).includes(index) ? "selected" : ""}`}
              key={index}
            >
              <input
                type="checkbox"
                checked={(answers[item.id] || []).includes(index)}
                onChange={(e) => {
                  setResult(null);
                  setAnswers({
                    ...answers,
                    [item.id]: e.target.checked
                      ? [...(answers[item.id] || []), index]
                      : (answers[item.id] || []).filter((n) => n !== index),
                  });
                }}
              />
              {option}
            </label>
          ))}
        </fieldset>
      ))}
      {result && (
        <div
          className={`feedback ${result.passed ? "success" : "warning"}`}
          role="status"
        >
          <strong>
            Nilai {result.score} / 100 ·{" "}
            {result.passed ? "Lulus" : "Belum lulus"}
          </strong>
          {result.feedback.map((r: any, i: number) => (
            <p key={r.id}>
              {i + 1}. {r.correct ? "Benar." : "Perlu ditinjau."}{" "}
              {r.explanation}
            </p>
          ))}
        </div>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="row spread">
        <small className="muted">
          {progress?.quizAttempts || 0} percobaan
          {progress?.quizPassed ? " · Syarat sudah terpenuhi" : ""}
        </small>
        <button
          className="primary"
          disabled={
            busy ||
            capped ||
            q.questions.some((item) => !answers[item.id]?.length)
          }
          onClick={submit}
        >
          {busy ? <Loader2 className="spin" size={16} /> : <Check size={16} />}
          Periksa jawaban
        </button>
      </div>
      {capped && (
        <p className="small muted">
          Batas percobaan tercapai. Mentor dapat membuka percobaan kembali.
        </p>
      )}
    </section>
  );
}
function CodePanel({
  courseId,
  lesson,
  ready,
  progress,
  refresh,
}: {
  courseId: string;
  lesson: PublicLesson;
  ready: boolean;
  progress?: Progress;
  refresh: () => Promise<void>;
}) {
  const ex = lesson.exercise!;
  const [source, setSource] = useState(ex.starter),
    [busy, setBusy] = useState(false),
    [result, setResult] = useState<any>(null),
    [error, setError] = useState(""),
    [attempt, setAttempt] = useState(""),
    [history, setHistory] = useState<any[]>([]);
  const getHistory = useCallback(async () => {
    try {
      const d = await api(
        `/api/studio?history=${courseId}&lesson=${lesson.id}`,
      );
      setHistory(d.attempts);
      const pending = d.attempts.find(
        (a: any) => a.kind === "code" && a.state === "pending",
      );
      if (pending) setAttempt(pending.id);
    } catch {}
  }, [courseId, lesson.id]);
  useEffect(() => {
    void getHistory();
  }, [getHistory]);
  useEffect(() => {
    if (!attempt) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const r = await api(
          "/api/studio?attempt=" + encodeURIComponent(attempt),
        );
        if (stopped) return;
        if (r.state === "pending") {
          timer = setTimeout(poll, 2500);
          return;
        }
        setResult(r);
        setAttempt("");
        setBusy(false);
        await refresh();
        await getHistory();
      } catch (e: any) {
        if (!stopped) {
          setError(e.message);
          setBusy(false);
          setAttempt("");
        }
      }
    }
    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [attempt, refresh, getHistory]);
  async function submit() {
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const r = await api("/api/studio", {
        action: "code",
        courseId,
        lessonId: lesson.id,
        source,
      });
      setAttempt(r.id);
    } catch (e: any) {
      setError(e.message);
      setBusy(false);
    }
  }
  return (
    <section className="assessment code-assessment">
      <div className="assessment-head">
        <div>
          <span className="eyebrow teal">CODING LAB</span>
          <h2>Uji solusi Anda</h2>
        </div>
        <span className="pill">{ex.language}</span>
      </div>
      <p>{ex.prompt}</p>
      <div className="test-examples">
        {ex.tests.map((t, i) => (
          <div key={i}>
            <strong>Contoh {i + 1}</strong>
            <small>Input</small>
            <pre>{t.input}</pre>
            <small>Output</small>
            <pre>{t.expected}</pre>
          </div>
        ))}
      </div>
      <div className="editor-bar">
        <span>
          <Code2 size={15} /> solusi.
          {ex.language === "python"
            ? "py"
            : ex.language === "cpp"
              ? "cpp"
              : "js"}
        </span>
        <span>{ex.required ? "Wajib lulus" : "Latihan review"}</span>
      </div>
      <textarea
        className="code-editor"
        aria-label="Editor kode"
        spellCheck={false}
        value={source}
        onChange={(e) => setSource(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Tab") {
            e.preventDefault();
            const t = e.currentTarget,
              a = t.selectionStart,
              b = t.selectionEnd;
            setSource(source.slice(0, a) + "    " + source.slice(b));
            requestAnimationFrame(() => {
              t.selectionStart = t.selectionEnd = a + 4;
            });
          }
        }}
      />
      <div className="row spread editor-footer">
        <small>
          {ex.tests.length} test case contoh · {ex.hiddenCount} tersembunyi
        </small>
        <button
          className="primary"
          disabled={
            !ready ||
            busy ||
            !!attempt ||
            !source.trim() ||
            (ex.maxAttempts > 0 &&
              (progress?.codeAttempts || 0) >= ex.maxAttempts)
          }
          onClick={submit}
        >
          {busy || attempt ? (
            <Loader2 size={16} className="spin" />
          ) : (
            <CirclePlay size={16} />
          )}
          Jalankan pemeriksaan
        </button>
      </div>
      {!ready && (
        <div className="feedback warning">
          Pemeriksaan otomatis belum diaktifkan. Pengelola perlu menghubungkan
          layanan sandbox. Kode belum dijalankan atau dinilai.
        </div>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {result && (
        <div
          className={`feedback ${result.passed ? "success" : "warning"}`}
          role="status"
        >
          <strong>
            {result.error ||
              `Nilai ${result.score} / 100 · ${result.passed ? "Semua pengujian lulus" : "Solusi perlu diperbaiki"}`}
          </strong>
          {result.tests?.map((t: any) => (
            <div key={t.index} className="test-result">
              <span>
                {t.passed ? "✓" : "×"} Test {t.index}
                {t.hidden ? " (tersembunyi)" : ""} — {t.status}
              </span>
              {(t.stderr || t.compileOutput) && (
                <pre>{t.stderr || t.compileOutput}</pre>
              )}
            </div>
          ))}
        </div>
      )}
      {history.length > 0 && (
        <details className="history">
          <summary>Riwayat percobaan ({history.length} terakhir)</summary>
          {history.map((h) => (
            <div className="row spread" key={h.id}>
              <span>{localDate(h.createdAt)}</span>
              <span>
                {h.kind === "quiz" ? "Kuis" : "Kode"} ·{" "}
                {h.state === "finished" ? h.score + "/100" : h.state}
              </span>
            </div>
          ))}
        </details>
      )}
    </section>
  );
}
function Completion({
  course,
  lesson,
  progress,
  refresh,
  next,
}: {
  course: PublicCourse;
  lesson: PublicLesson;
  progress?: Progress;
  refresh: () => Promise<void>;
  next: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const blocked =
    (lesson.quiz?.mode === "required" && !progress?.quizPassed) ||
    (lesson.exercise?.required && !progress?.codePassed);
  return (
    <>
      <div className="lesson-footer">
        <span>
          {blocked
            ? "Selesaikan tes wajib untuk melanjutkan."
            : progress?.complete
              ? "Materi telah diselesaikan."
              : "Siap untuk langkah berikutnya?"}
        </span>
        <div className="row">
          {!progress?.complete && (
            <button
              className="primary"
              disabled={!!blocked || busy}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  await api("/api/studio", {
                    action: "complete",
                    courseId: course.id,
                    lessonId: lesson.id,
                  });
                  await refresh();
                } catch (e: any) {
                  setError(e.message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Check size={16} />
              Tandai selesai
            </button>
          )}
          {course.lessons.indexOf(lesson) < course.lessons.length - 1 && (
            <button className="secondary" disabled={!!blocked} onClick={next}>
              Selanjutnya
            </button>
          )}
        </div>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
export function DiscussionPanel({
  courseId,
  lessonId,
}: {
  courseId: string;
  lessonId: string;
}) {
  const [messages, setMessages] = useState<Discussion[]>([]),
    [body, setBody] = useState(""),
    [reply, setReply] = useState<Discussion | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      const d = await api(
        `/api/studio?discussion=${courseId}&lesson=${lessonId}`,
      );
      setMessages(d.messages);
      setError("");
    } catch (e: any) {
      setError(e.message);
    }
  }, [courseId, lessonId]);
  useEffect(() => {
    void load();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, [load]);
  return (
    <section className="discussion">
      <div className="row spread">
        <h2>Diskusi materi</h2>
        <button
          aria-label="Muat ulang diskusi"
          className="icon-button"
          onClick={load}
        >
          <RefreshCw size={17} />
        </button>
      </div>
      <p className="small">
        Tuliskan bagian yang belum jelas atau kendala yang Anda temui. Mentor
        dapat membalas di ruang ini.
      </p>
      {!messages.length && (
        <div className="empty">
          <MessageCircle size={28} />
          <h3>Mulai percakapan pertama</h3>
          <p>Pertanyaan Anda bisa membantu peserta lainnya.</p>
        </div>
      )}
      {messages.map((m) => (
        <div className={`message ${m.parentId ? "reply" : ""}`} key={m.id}>
          <div className="row spread">
            <strong>
              {m.name}{" "}
              {m.role === "owner" && <span className="pill">Mentor</span>}
            </strong>
            <small>{localDate(m.createdAt)}</small>
          </div>
          {m.parentId && (
            <small className="muted">
              Membalas{" "}
              {messages.find((p) => p.id === m.parentId)?.name || "diskusi"}
            </small>
          )}
          <p>{m.body}</p>
          <button className="text-button" onClick={() => setReply(m)}>
            Balas
          </button>
        </div>
      ))}
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            await api("/api/studio", {
              action: "message",
              courseId,
              lessonId,
              body,
              parentId: reply?.id || null,
            });
            setBody("");
            setReply(null);
            await load();
          } catch (e: any) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {reply && (
          <div className="row spread small">
            Membalas {reply.name}
            <button type="button" onClick={() => setReply(null)}>
              Batal
            </button>
          </div>
        )}
        <label htmlFor="message-body">Pertanyaan atau tanggapan Anda</label>
        <textarea
          id="message-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={4000}
          rows={4}
          placeholder="Contoh: hasil pembacaan sensor saya berubah-ubah…"
          required
        />
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="primary" disabled={busy || !body.trim()}>
          <Send size={16} />
          Kirim pesan
        </button>
      </form>
    </section>
  );
}
function SessionList({
  sessions,
  courses,
  refresh,
}: {
  sessions: Session[];
  courses: PublicCourse[];
  refresh: () => Promise<void>;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState("");
  return (
    <>
      {error && (
        <div className="feedback warning" role="alert">
          {error}
        </div>
      )}
      {!sessions.length ? (
        <div className="empty large">
          <CalendarDays size={38} />
          <h2>Belum ada sesi terjadwal</h2>
          <p>
            Jadwal live dan tatap muka akan muncul setelah ditambahkan pengajar.
          </p>
        </div>
      ) : (
        <div className="session-grid">
          {sessions.map((s) => (
            <div className="session-card" key={s.id}>
              <div className="row spread">
                <span className="pill">
                  {s.kind === "online" ? (
                    <Video size={14} />
                  ) : (
                    <MapPin size={14} />
                  )}{" "}
                  {s.kind === "online" ? "Live online" : "Tatap muka"}
                </span>
                <small>
                  {s.count}/{s.capacity} peserta
                </small>
              </div>
              <small className="muted">
                {courses.find((c) => c.id === s.courseId)?.title}
              </small>
              <h2>{s.title}</h2>
              <p>
                <CalendarDays size={16} /> {localDate(s.startsAt)}
                <br />
                <Clock3 size={16} /> {s.duration} menit
              </p>
              {s.kind === "offline" && (
                <p>
                  <MapPin size={16} /> {s.location}
                </p>
              )}
              {Date.parse(s.startsAt) < Date.now() ? (
                <span className="muted">Sesi sudah dimulai / berakhir</span>
              ) : (
                <button
                  className={s.joined ? "secondary" : "primary"}
                  disabled={
                    busy === s.id || (!s.joined && s.count >= s.capacity)
                  }
                  onClick={async () => {
                    setBusy(s.id);
                    setError("");
                    try {
                      await api("/api/studio", {
                        action: "rsvp",
                        sessionId: s.id,
                        join: !s.joined,
                      });
                      await refresh();
                    } catch (e: any) {
                      setError(e.message);
                    } finally {
                      setBusy("");
                    }
                  }}
                >
                  {s.joined
                    ? "Batalkan pendaftaran"
                    : s.count >= s.capacity
                      ? "Sesi penuh"
                      : "Daftar sesi"}
                </button>
              )}
              {!!s.joined && s.kind === "online" && (
                <a
                  className="button-link secondary"
                  target="_blank"
                  rel="noopener noreferrer"
                  href={s.url}
                >
                  Buka ruang meeting
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
