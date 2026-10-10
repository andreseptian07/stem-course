"use client";
import {useUnsavedNavigation} from "./use-unsaved-navigation";
import AccountFrame, {AccountHeader, AccountMenu} from "./account-frame";
import type {NavigationUser,NavigationKey} from "@/lib/account-navigation";

import {clientFetch, responseJson} from '@/lib/client-fetch';
import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import {useRouter} from "next/navigation";
import {browserModelContext, type BrowserTool} from "@/lib/browser-tools";
import type {gradeQuiz} from "@/lib/rules";
type QuizResult = ReturnType<typeof gradeQuiz>;
type HistoryAttempt = {id:string;kind:string;state:string;score:number|null;createdAt:string};
type CodeResult = {id:string;state:string;passed?:boolean;score?:number;error?:string;tests?:{index:number;passed:boolean;hidden:boolean;status:string;stderr?:string;compileOutput?:string}[]};
import { canConfirmLessonCompletion } from "../lib/graduation";
import { BookOpen, Code2, CalendarDays, MessageCircle, Check, LockKeyhole, CirclePlay, PanelLeft, X, CircuitBoard, Clock3, CheckCircle2, Send, MapPin, Video, Loader2, RefreshCw } from "lucide-react";

import RenderBlock from "./lesson-block";
import type {
  State,
  PublicCourse,
  PublicLesson,
  Progress,
  Session,
  Discussion,
} from "@/lib/model";
import Admin from "./admin";
import { CourseCertificate } from "./certificates-panel";
import BrowserPractice from "./browser-practice";
const retryRequests=new Map<string,string>();
export async function api<T = State>(path = "/api/studio", body?: unknown) {
  let retryKey:string|undefined;
  const q=new URLSearchParams(location.search);
  if(path.startsWith("/api/studio?")&&q.get("class")&&!path.includes("class="))path+="&class="+encodeURIComponent(q.get("class")!);
  if(body&&typeof body==="object"&&"action" in body&&["complete","quiz","code","message"].includes(String(body.action))){
    body={...body,classId:q.get("class")||null};
    if(["complete","quiz"].includes(String((body as {action:string}).action))){
      retryKey=path+JSON.stringify(body);
      const requestId=retryRequests.get(retryKey)||crypto.randomUUID();retryRequests.set(retryKey,requestId);
      body={...(body as Record<string,unknown>),requestId};
    }
  }
  const r = await clientFetch(
    path,
    body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : { cache: "no-store" },
  );
  const d = await responseJson<T>(r, !!body);
  if(retryKey)retryRequests.delete(retryKey);
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
export default function Studio({navigation,initialView="learn"}:{navigation:NavigationUser;initialView?:string}) {
  const router = useRouter();
  const [clock,setClock] = useState(() => Date.now());
  useEffect(() => {const timer=setInterval(()=>setClock(Date.now()),30000);return()=>clearInterval(timer);},[]);
  const outlineToggle = useRef<HTMLButtonElement>(null);
  const outlineClose = useRef<HTMLButtonElement>(null);
  const [state, setState] = useState<State | null>(null),
    [failure, setFailure] = useState(""),
    [signIn, setSignIn] = useState(false),
    [view, setView] = useState(initialView),
    [adminDirty, setAdminDirty] = useState(false),
    [courseId, setCourseId] = useState(""),
    [lessonId, setLessonId] = useState(""),
    [mobile, setMobile] = useState(false),
    [discussion, setDiscussion] = useState(false),
    [notice, setNotice] = useState("");
  const load = useCallback(async () => {
    try {
      const admin=new URLSearchParams(location.search).get("view")==="admin";
      const query=new URLSearchParams(location.search);
      const params=new URLSearchParams();for(const key of ["course","class"])if(query.get(key))params.set(key,query.get(key)!);
      const result=await api(admin?"/api/studio?admin=1":"/api/studio"+(params.size?"?"+params.toString():""));
      if(!admin){const c=result.courses.find((c:PublicCourse)=>c.id===query.get("course"))||result.courses[0];if(c){query.set("course",c.id);if(c.graduation?.classId)query.set("class",c.graduation.classId);else query.delete("class");history.replaceState(null,"","/learn?"+query.toString());}}
      const data=admin?{user:result.user,curriculum:true,courses:[],progress:{},sessions:[],judgeReady:result.judgeReady}:result;
      setState(data);
      setFailure("");
      setSignIn(false);
    } catch (cause) {
      const e = cause as Error & {status?: number};
      setFailure(e.message);
      setSignIn(e.status === 401);
    }
  }, []);
  useEffect(() => {
    const startup=setTimeout(() => {
    void load();
    const q = new URLSearchParams(location.search);
    setCourseId(q.get("course") || "");
    setLessonId(q.get("lesson") || "");
    if (q.get("view") === "sessions" || q.get("view") === "admin")
      setView(q.get("view")!);
    },0);
    return()=>clearTimeout(startup);
  }, [load]);
  useEffect(() => {
    if (!mobile) return;
    const toggle=outlineToggle.current;
    outlineClose.current?.focus();
    const close = (e: KeyboardEvent) => { if (e.key === "Escape") setMobile(false); };
    window.addEventListener("keydown", close);
    return () => { window.removeEventListener("keydown", close); toggle?.focus(); };
  }, [mobile]);
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
  function updateLocation(nextView: string, nextCourse = course?.id, nextLesson = lesson?.id) {
    const query = new URLSearchParams();
    if (nextCourse) query.set("course", nextCourse);
    const classId=nextCourse===course?.id?course?.graduation?.classId:null;
    if(classId)query.set("class",classId);
    if (nextLesson) query.set("lesson", nextLesson);
    if (nextView !== "learn") query.set("view", nextView);
    history.replaceState(null, "", `/learn${query.size ? "?" + query.toString() : ""}`);
  }
  function navigateView(nextView: string) {
    if (nextView === view) return;
    if (adminDirty && !confirm("Abaikan perubahan course yang belum disimpan?")) return;
    setView(nextView);
    setAdminDirty(false);
    setMobile(false);
    updateLocation(nextView);
  }
  const selectLesson = (l: PublicLesson) => {
    setNotice("");
    if (l.locked) {
      setNotice(l.blocker||"Selesaikan seluruh syarat materi sebelumnya.");
      return;
    }
    setLessonId(l.id);
    setDiscussion(false);
    setMobile(false);
    setView("learn");
    updateLocation("learn", course?.id, l.id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const toolsState = useRef({ state, course, lesson, view, selectLesson });
  useEffect(() => { toolsState.current = {state,course,lesson,view,selectLesson}; });
  useEffect(() => {
    const ctx = browserModelContext();
    if (!ctx?.registerTool) return;
    const lifecycle = new AbortController();
    const register = (tool: BrowserTool) =>
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
      execute: (input?: Record<string, unknown>) => {
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
  const done=course?.graduation?.lessons.filter(l=>l.stagePassed).length||0;
  const percent = course?.lessons.length
    ? Math.round((done / course.lessons.length) * 100)
    : 0;
  const {guard: guardNavigation,dialog: leaveDialog} = useUnsavedNavigation(adminDirty,()=>setAdminDirty(false),"Perubahan course belum tersimpan. Tetap di halaman untuk menyimpan atau lanjutkan tanpa perubahan ini.");
  const Frame = initialView === "admin" || initialView === "sessions" ? AccountFrame : StudyFrame;
  return (
    <Frame user={navigation} current={view === "admin" ? "admin" : view === "sessions" ? "sessions" : "learn"} onNavigate={guardNavigation} mainTag="div">
      {leaveDialog}
      {!state ? (
        <main className="welcome">
          <div className="mentor-icon">
            <BookOpen size={25} />
          </div>
          <span className="eyebrow teal">{initialView === "admin" ? "PENGELOLAAN COURSE" : "RUANG BELAJAR STEM"}</span>
          <h1>
            {initialView === "admin" ? "Menyiapkan pengelolaan course" : "Menyiapkan ruang belajar"}
          </h1>
          <p>
            {signIn
              ? "Masuk untuk membuka materi, menyimpan progres, dan berdiskusi dengan mentor."
              : failure || "Memuat data sesuai akses akun Anda…"}
          </p>
          {signIn ? (
            <Link
              className="primary button-link"
              href={`/login?return_to=${encodeURIComponent("/learn" + (typeof location !== "undefined" ? location.search : ""))}`}
              target="_top"
            >
              Masuk ke akun
            </Link>
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
          onPreview={(c) => {setAdminDirty(false);router.push('/preview?course='+encodeURIComponent(c));}}
        />
      ) : view === "sessions" ? (
        <main className="full-page">
          <div className="eyebrow teal">BELAJAR BERSAMA</div>
          <h1>Sesi bersama Tutor</h1>
          <p>Ruang untuk bertanya, membahas proyek, dan berlatih bersama.</p>
          <SessionList
            sessions={state.sessions}
            classSessions={state.classSessions || []}
            courses={state.courses}
            refresh={load}
          />
        </main>
      ) : !course ? (
        <main className="welcome">
          <BookOpen size={36} />
          <h1>{state.user.role === "owner" ? "Course pertama sedang disiapkan" : "Belum ada course yang Anda ikuti"}</h1>
          <p>{state.user.role === "owner" ? "Materi akan muncul di sini setelah diterbitkan pengajar." : "Pilih dan daftar course melalui katalog untuk mulai belajar."}</p>
          {state.user.role !== "owner" && <Link className="primary" href="/courses">Jelajahi course</Link>}
          {state.user.role === "owner" && (
            <button className="primary" onClick={() => navigateView("admin")}>
              Buat course
            </button>
          )}
          <Link className="secondary button-link" href="/courses">Jelajahi course</Link>
        </main>
      ) : (
        <div className="workspace">
          <aside id="lesson-outline" className={`outline ${mobile ? "mobile-open" : ""}`}><button ref={outlineClose} className="outline-close" type="button" onClick={() => setMobile(false)}><X size={18} />Tutup daftar materi</button>
            <div className="eyebrow">
              JALUR BELAJAR / {course.category.toUpperCase()}
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
                  updateLocation("learn", e.target.value, "");
                  void load();
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
            {!!course.graduation?.classes.length&&<label className="field"><span>Kelas belajar</span><select aria-label="Pilih kelas belajar" value={course.graduation.classId||""} onChange={e=>{const q=new URLSearchParams(location.search);if(e.target.value)q.set("class",e.target.value);else q.delete("class");history.replaceState(null,"","/learn?"+q.toString());setState(null);void load();}}><option value="">Pilih kelas</option>{course.graduation.classes.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}
            {course.graduation?.problem&&<p role="status">{course.graduation.problem.message}</p>}
            <div className="progress-caption">
              <span>
                {done} dari {course.lessons.length} tahap lulus
              </span>
              <b>{percent}%</b>
            </div>
            <div className="progress">
              <span style={{ width: percent + "%" }} />
            </div>
            <CourseCertificate key={`${course.id}-${course.version}-${done}-${course.graduation?.classId || ""}`} courseId={course.id} classId={course.graduation?.classId} />
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
                  ) : l.graduation?.stagePassed ? (
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
                ref={outlineToggle}
                aria-label={mobile ? "Tutup daftar materi" : "Buka daftar materi"}
                aria-expanded={mobile}
                aria-controls="lesson-outline"
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
                        Aktivitas selesai
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
                      disabled={lesson.locked}
                      title={lesson.locked ? "Selesaikan prasyarat atau minta bantuan melalui diskusi kelas." : undefined}
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
                      <p>{lesson.blocker||"Selesaikan seluruh syarat materi sebelumnya."}</p>
                      <p>Diskusi materi terbuka setelah prasyarat terpenuhi. Untuk kendala, mintalah bantuan melalui diskusi kelas.</p>
                      <Link className="secondary button-link" href={course.graduation?.classId ? `/classes?class=${encodeURIComponent(course.graduation.classId)}` : "/classes"}>Buka diskusi kelas</Link>
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
                          <RenderBlock key={b.id} block={b} classId={course.graduation?.classId} />
                        ))
                      ) : (
                        <div className="empty">
                          {lesson.graduation?.requiredReviews.length?"Kerjakan tugas praktik melalui tautan Buka tugas di bawah.":"Pengajar sedang menyiapkan isi materi."}
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
                      {(lesson.quiz || lesson.exercise) && <AssessmentHistory
                        key={course.id + lesson.id + lesson.revision}
                        courseId={course.id} lessonId={lesson.id}
                        refreshKey={`${p?.quizAttempts || 0}:${p?.codeAttempts || 0}:${p?.version || 0}`}
                      />}
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
                    {lesson.locked ? <Link className="secondary button-link" href={course.graduation?.classId ? `/classes?class=${encodeURIComponent(course.graduation.classId)}` : "/classes"}>Buka diskusi kelas</Link> : <button
                      className="secondary"
                      onClick={() => setDiscussion(true)}
                    >
                      Buka diskusi
                    </button>}
                  </div>
                  <div className="context-card quiet">
                    <CalendarDays size={22} />
                    <h3>Temui mentor Anda</h3>
                    <p>
                      {state.classSessions?.find(s => s.courseId === course.id && (!course.graduation?.classId || s.classId === course.graduation.classId) && Date.parse(s.startsAt) + s.duration * 60000 > clock)?.title || state.sessions.find(
                        (s) =>
                          s.courseId === course.id &&
                          Date.parse(s.startsAt) > clock,
                      )?.title ||
                        "Sesi live dan tatap muka akan tampil setelah dijadwalkan pengajar."}
                    </p>
                    <button
                      className="text-button"
                      onClick={() => navigateView("sessions")}
                    >
                      Lihat jadwal sesi
                    </button>
                  </div>
                </aside>
              </div>
            ) : (
              <div className="empty">
                <h2>Belum ada materi</h2>
                <p>{state.user.role === "owner" ? "Tambahkan materi pertama dari Kelola course." : "Materi course ini sedang disiapkan oleh pengajar."}</p>
                {state.user.role === "owner" ? <button className="primary" type="button" onClick={() => navigateView("admin")}>Kelola course</button> : <Link className="secondary button-link" href="/courses">Jelajahi course lain</Link>}
              </div>
            )}
          </main>
        </div>
      )}
    </Frame>
  );
}
function StudyFrame({user,current,onNavigate,children}:{user:NavigationUser;current:NavigationKey;onNavigate?:React.MouseEventHandler<HTMLAnchorElement>;children:React.ReactNode;mainTag?:string}) {
  return <div className="studio study-frame"><a className="account-skip" href="#study-main">Lewati ke konten</a><AccountHeader user={user} onNavigate={onNavigate}/><AccountMenu user={user} current={current} onNavigate={onNavigate} compact/><div id="study-main" tabIndex={-1}>{children}</div></div>;
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
    [result, setResult] = useState<QuizResult | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const capped =
    q.maxAttempts > 0 && (progress?.quizAttempts || 0) >= q.maxAttempts;
  async function submit() {
    setBusy(true);
    setError("");
    try {
      setResult(
        await api<QuizResult>("/api/studio", {
          action: "quiz",
          courseId,
          lessonId: lesson.id,
        revision:lesson.revision,
          answers,
        }),
      );
      await refresh();
    } catch (cause) {
      const e = cause as Error & {status?: number};
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
          {result.feedback.map((r, i) => (
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
    [result, setResult] = useState<CodeResult | null>(null),
    [error, setError] = useState(""),
    [attempt, setAttempt] = useState("");
  const requestId = useRef(crypto.randomUUID());
  const getHistory = useCallback(async () => {
    try {
      const d = await api<{attempts:HistoryAttempt[]}>(
        `/api/studio?history=${courseId}&lesson=${lesson.id}`,
      );
      const pending = d.attempts.find(
        (a) =>
          a.kind === "code" && ["pending", "submitting"].includes(a.state),
      );
      if (pending) setAttempt(pending.id);
    } catch {}
  }, [courseId, lesson.id]);
  useEffect(() => {
    const startup=setTimeout(getHistory,0);return()=>clearTimeout(startup);
  }, [getHistory]);
  useEffect(() => {
    if (!attempt) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const r = await api<CodeResult>(
          "/api/studio?attempt=" + encodeURIComponent(attempt),
        );
        if (stopped) return;
        if (r.state === "pending") {
          timer = setTimeout(poll, 2500);
          return;
        }
        setResult(r);
        requestId.current = crypto.randomUUID();
        setAttempt("");
        setBusy(false);
        await refresh();
        await getHistory();
      } catch (cause) {
      const e = cause as Error & {status?: number};
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
      const r = await api<{id:string}>("/api/studio", {
        action: "code",
        courseId,
        lessonId: lesson.id,
        revision:lesson.revision,
        source,
        requestId: requestId.current,
      });
      setAttempt(r.id);
    } catch (cause) {
      const e = cause as Error & {status?: number};
      setError(e.message);
      if (e.status && e.status < 500) requestId.current = crypto.randomUUID();
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
        maxLength={20000}
        onChange={(e) => {
          setSource(e.target.value);
          requestId.current = crypto.randomUUID();
        }}
        onKeyDown={(e) => {
          if (e.key === "Tab") {
            e.preventDefault();
            const t = e.currentTarget,
              a = t.selectionStart,
              b = t.selectionEnd;
            if(source.length-(b-a)+4>20000)return;
            setSource(source.slice(0, a) + "    " + source.slice(b));
            requestId.current = crypto.randomUUID();
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
          Kirim untuk penilaian resmi
        </button>
      </div>
      <BrowserPractice exercise={ex} source={source} />
      {!ready && (
        <div className="feedback warning">
          Penilaian kode resmi sementara belum tersedia. Gunakan latihan browser
          untuk mencoba contoh; hasilnya tidak memberi nilai kelulusan.
          {ex.required&&" Tes coding wajib harus lulus melalui penilaian resmi sebelum tahap bisa diselesaikan."}
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
          {result.tests?.map((t) => (
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

    </section>
  );
}
function AssessmentHistory({courseId, lessonId, refreshKey}: {courseId: string; lessonId: string; refreshKey: string}) {
  const [attempts, setAttempts] = useState<HistoryAttempt[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let live = true;
    const startup = setTimeout(() => {
      setLoading(true);
      void api<{attempts: HistoryAttempt[]}>(`/api/studio?history=${encodeURIComponent(courseId)}&lesson=${encodeURIComponent(lessonId)}`)
        .then(data => { if (live) { setAttempts(data.attempts); setError(""); } })
        .catch(cause => { if (live) { setAttempts([]); setError(cause instanceof Error ? cause.message : "Riwayat belum dapat dimuat."); } })
        .finally(() => { if (live) setLoading(false); });
    }, 0);
    return () => { live = false; clearTimeout(startup); };
  }, [courseId, lessonId, refreshKey, retry]);
  return <section className="assessment">
    <h2>Riwayat penilaian</h2>
    {loading ? <p role="status">Memperbarui riwayat…</p> : error ? <div role="alert"><p>{error}</p><button className="secondary" onClick={() => setRetry(value => value + 1)}>Muat ulang riwayat</button></div> : !attempts.length ? <p>Belum ada percobaan penilaian.</p> : <details className="history" open>
      <summary>Riwayat percobaan ({attempts.length} terakhir)</summary>
      {attempts.map(attempt => <div className="row spread" key={attempt.id}><span>{localDate(attempt.createdAt)}</span><span>{attempt.kind === "quiz" ? "Kuis" : "Kode"} · {attempt.state === "finished" ? `${attempt.score ?? "—"}/100` : attempt.state === "pending" || attempt.state === "submitting" ? "Sedang diperiksa" : attempt.state}</span></div>)}
    </details>}
  </section>;
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
  const blocked = !canConfirmLessonCompletion(lesson.graduation);
  return (
    <>
      {lesson.graduation&&<section aria-label="Syarat kelulusan materi" className="context-card"><h3>{lesson.graduation.stagePassed?"Materi lulus":"Syarat kelulusan"}</h3>{lesson.graduation.requiredReviews.map(r=><p key={r.id}>{r.title} · {r.score===null?"Belum dinilai":`Nilai ${r.score}/100 (minimal ${r.minimumScore})`} · {r.passed?"Lulus":r.status==="submitted"?"Menunggu review":r.status==="stale"?"Perlu dikerjakan ulang":"Belum lulus"}{r.assignmentId&&course.graduation?.classId&&<> · <Link href={`/classes?class=${encodeURIComponent(course.graduation.classId)}&task=${encodeURIComponent(r.assignmentId)}`}>Buka tugas</Link></>}</p>)}{lesson.graduation.blockers.map((b,i)=><p key={b.code+i}>{b.message}</p>)}</section>}
      <div className="lesson-footer">
        <span>
          {blocked
            ? "Penuhi seluruh syarat kelulusan di atas sebelum menandai tahap selesai."
            : progress?.complete
              ? lesson.graduation?.stagePassed?"Tahap ini telah lulus.":"Aktivitas selesai; penuhi syarat kelulusan di atas."
              : "Siap untuk langkah berikutnya?"}
        </span>
        <div className="row">
            <button
              className="primary"
              disabled={blocked || busy || !!progress?.complete}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  await api("/api/studio", {
                    action: "complete",
                    courseId: course.id,
                    lessonId: lesson.id,
        revision:lesson.revision,
                  });
                  await refresh();
                } catch (cause) {
      const e = cause as Error & {status?: number};
                  setError(e.message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Check size={16} />
              {lesson.graduation?.stagePassed ? "Tahap lulus" : progress?.complete ? "Aktivitas tercatat" : "Tandai selesai"}
            </button>
          {course.lessons.indexOf(lesson) < course.lessons.length - 1 && (
            <button className="secondary" disabled={!!blocked||!lesson.graduation?.stagePassed} onClick={next}>
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
  const posting = useRef(false);
  const load = useCallback(async () => {
    try {
      const d = await api<{messages:Discussion[]}>(
        `/api/studio?discussion=${courseId}&lesson=${lessonId}`,
      );
      setMessages(d.messages);
      setError("");
    } catch (cause) {
      const e = cause as Error & {status?: number};
      setError(e.message);
    }
  }, [courseId, lessonId]);
  useEffect(() => {
    const startup=setTimeout(load,0);
    const id = setInterval(load, 15000);
    return () => {clearTimeout(startup);clearInterval(id);};
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
          if (posting.current) return;
          posting.current = true;
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
          } catch (cause) {
      const e = cause as Error & {status?: number};
            setError(e.message);
          } finally {
            posting.current = false;
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
  classSessions,
  courses,
  refresh,
}: {
  sessions: Session[];
  classSessions: NonNullable<State["classSessions"]>;
  courses: PublicCourse[];
  refresh: () => Promise<void>;
}) {
  const [clock,setClock]=useState(()=>Date.now());
  useEffect(()=>{const timer=setInterval(()=>setClock(Date.now()),30000);return()=>clearInterval(timer);},[]);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState("");
  return (
    <>
      {error && (
        <div className="feedback warning" role="alert">
          {error}
        </div>
      )}
      <h2>Jadwal kelas saya</h2>
      <p className="small muted">Jadwal dari Tutor kelas Anda. Peserta kelas tidak perlu mendaftar sesi ulang.</p>
      {!classSessions.length ? <p>Belum ada jadwal kelas mendatang. <Link href="/classes">Lihat kelas saya</Link></p> : <div className="session-grid">
        {classSessions.map(session => <article className="session-card" key={session.id}>
          <span className="pill">Sesi kelas · {session.kind === "online" ? "Live online" : "Tatap muka"}</span>
          <p className="small muted">{session.courseTitle} · {session.className}</p><h3>{session.title}</h3>
          <p>{localDate(session.startsAt)} · {session.duration} menit</p>
          {session.kind === "offline" && <p>{session.location}</p>}
          <Link className="secondary button-link" href={`/classes?class=${encodeURIComponent(session.classId)}`}>Buka kelas</Link>
          {session.kind === "online" && session.url && <a className="secondary button-link" href={session.url} target="_blank" rel="noopener noreferrer">Buka meeting</a>}
        </article>)}
      </div>}
      <h2>Sesi course yang dapat didaftarkan</h2>
      <p className="small muted">Sesi tambahan di luar jadwal kelas. Gunakan Daftar sesi untuk mengikuti.</p>
      {!sessions.length ? (
        <div className="empty large">
          <CalendarDays size={38} />
          <h2>Belum ada sesi terjadwal</h2>
          <p>
            Jadwal live dan tatap muka akan muncul setelah ditambahkan pengajar.
          </p>
          <Link className="secondary button-link" href="/classes">Lihat kelas & Tutor</Link>
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
              {Date.parse(s.startsAt) < clock ? (
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
                    } catch (cause) {
      const e = cause as Error & {status?: number};
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
                <Link
                  className="button-link secondary"
                  target="_blank"
                  rel="noopener noreferrer"
                  href={s.url}
                >
                  Buka ruang meeting
                </Link>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
