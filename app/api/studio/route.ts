import { readRequestText } from "@/lib/request-body";
import { checkAuthOrigin } from "@/lib/auth-policy";
import { z } from "zod";
import {
  identity,
  owner,
  db,
  course,
  getProgress,
  accessible,
  ensureProgress,
  judgeConfig,
  AppError,
  json,
} from "@/lib/server";
import { publicCourse } from "@/lib/rules";
import { courseRows, saveCourse, completeLesson, submitQuiz } from "@/lib/course-data";
import { learningSessions, saveSession, setRsvp } from "@/lib/session-data";
import { JudgeError } from "@/lib/judge";
import { startAttempt, readAttempt, CodeError } from "@/lib/code-attempts";
import type { Course } from "@/lib/model";
export const dynamic = "force-dynamic";
function error(e: unknown) {
  if (e instanceof CodeError) return json({ error: e.message }, e.status);
  if (e instanceof JudgeError) return json({ error: e.message }, 503);
  if (e instanceof AppError) return json({ error: e.message }, e.status);
  if (e instanceof z.ZodError)
    return json({ error: e.issues[0]?.message || "Isian belum valid." }, 400);
  console.error(
    "STEM request failed",
    e instanceof Error ? e.message : "unknown",
  );
  return json(
    {
      error: "Permintaan belum berhasil. Isian Anda tetap tersedia; coba lagi.",
    },
    503,
  );
}
const ids = z.object({
  courseId: z.string().max(80),
  lessonId: z.string().max(80),
});
export async function GET(req: Request) {
  try {
    const u = await identity();
    const q = new URL(req.url).searchParams;
    if (q.get("history")) {
      const courseId = q.get("history")!,
        lessonId = q.get("lesson") || "";
      await accessible(u, courseId, lessonId);
      return json({
        attempts: (
          await db()
            .prepare(
              "SELECT id,kind,state,score,created_at AS createdAt FROM attempts WHERE user_id=? AND course_id=? AND lesson_id=? ORDER BY created_at DESC LIMIT 10",
            )
            .bind(u.id, courseId, lessonId)
            .all()
        ).results,
      });
    }
    if (q.get("admin") === "1") {
      owner(u);
      return json({
        courses: (await courseRows(db())).map((r) => ({ ...JSON.parse(r.data), version: r.version })),
        users: (await db().prepare("SELECT id,name,role FROM users").all())
          .results,
        progress: (
          await db()
            .prepare(
              "SELECT p.*,u.name FROM progress p JOIN users u ON u.id=p.user_id ORDER BY p.course_id,p.user_id",
            )
            .all()
        ).results,
        sessions: await learningSessions(db(), u),
        judgeReady: !!judgeConfig(),
      });
    }
    if (q.get("discussion")) {
      const courseId = q.get("discussion")!,
        lessonId = q.get("lesson") || "";
      if (lessonId && u.role !== "owner")
        await accessible(u, courseId, lessonId);
      else await course(courseId, u);
      return json({
        messages: (
          await db()
            .prepare(
              "SELECT id,course_id AS courseId,lesson_id AS lessonId,user_id AS userId,name,role,body,parent_id AS parentId,created_at AS createdAt FROM messages WHERE course_id=? AND lesson_id=? ORDER BY created_at LIMIT 300",
            )
            .bind(courseId, lessonId)
            .all()
        ).results,
      });
    }
    if (q.get("attempt")) {
      const a = await db()
        .prepare("SELECT * FROM attempts WHERE id=? AND user_id=?")
        .bind(q.get("attempt"), u.id)
        .first<any>();
      if (!a) throw new AppError(404, "Percobaan tidak ditemukan.");
      if (a.kind !== "code") throw new AppError(400, "Bukan percobaan kode.");
      const c = await course(a.course_id, u);
      const l = c.lessons.find((l) => l.id === a.lesson_id);
      return json(await readAttempt(db(), judgeConfig(), u.id, a, l?.revision));
    }
    const rows = await courseRows(db());
    const visible = rows
      .map((r) => ({ ...JSON.parse(r.data), version: r.version }) as Course)
      .filter((c) => c.published || u.role === "owner");
    const progress: Record<string, any> = {};
    for (const c of visible) progress[c.id] = await getProgress(u.id, c.id);
    return json({
      user: u,
      courses: visible.map((c) => publicCourse(c, progress[c.id])),
      progress,
      sessions: await learningSessions(db(), u),
      judgeReady: !!judgeConfig(),
    });
  } catch (e) {
    return error(e);
  }
}
export async function POST(req: Request) {
  try {
    checkAuthOrigin(req);
    if (!req.headers.get("content-type")?.includes("application/json"))
      throw new AppError(415, "Gunakan JSON.");
    if (Number(req.headers.get("content-length") || 0) > 1000000)
      throw new AppError(413, "Isian terlalu besar.");
    const raw = await readRequestText(req, 1000000);
    if (raw.length > 1000000) throw new AppError(413, "Isian terlalu besar.");
    let b: any;
    try {
      b = JSON.parse(raw);
    } catch {
      throw new AppError(400, "JSON tidak valid.");
    }
    const u = await identity();
    if (b.action === "saveCourse") return json({ course: await saveCourse(db(), u, b.course) });
    if (b.action === "saveSession") return json(await saveSession(db(), u, b.session));
    if (b.action === "rsvp") {
      const id = z.string().max(80).parse(b.sessionId);
      return json(await setRsvp(db(), u, id, b.join !== false));
    }
    if (b.action === "message") {
      const m = z
        .object({
          courseId: z.string().max(80),
          lessonId: z.string().max(80),
          body: z.string().trim().min(1).max(4000),
          parentId: z.string().max(80).nullable().optional(),
        })
        .parse(b);
      if (m.lessonId && u.role !== "owner")
        await accessible(u, m.courseId, m.lessonId);
      else await course(m.courseId, u);
      if (m.parentId) {
        const parent = await db()
          .prepare("SELECT course_id,lesson_id FROM messages WHERE id=?")
          .bind(m.parentId)
          .first<any>();
        if (
          !parent ||
          parent.course_id !== m.courseId ||
          parent.lesson_id !== m.lessonId
        )
          throw new AppError(400, "Diskusi induk tidak sesuai.");
      }
      const recent = await db()
        .prepare(
          "SELECT count(*) AS n FROM messages WHERE user_id=? AND created_at>?",
        )
        .bind(u.id, new Date(Date.now() - 60000).toISOString())
        .first<{ n: number }>();
      if ((recent?.n || 0) >= 10)
        throw new AppError(429, "Tunggu sebentar sebelum mengirim pesan lagi.");
      const id = crypto.randomUUID();
      await db()
        .prepare(
          "INSERT INTO messages(id,course_id,lesson_id,user_id,name,role,body,parent_id,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
        )
        .bind(
          id,
          m.courseId,
          m.lessonId,
          u.id,
          u.name,
          u.role,
          m.body,
          m.parentId || null,
          new Date().toISOString(),
        )
        .run();
      return json({ id });
    }
    if (b.action === "resetAttempts") {
      owner(u);
      const v = z
        .object({
          userId: z.string(),
          courseId: z.string(),
          lessonId: z.string(),
        })
        .parse(b);
      await db()
        .prepare(
          "UPDATE progress SET quiz_attempts=0,code_attempts=0 WHERE user_id=? AND course_id=? AND lesson_id=?",
        )
        .bind(v.userId, v.courseId, v.lessonId)
        .run();
      return json({ ok: true });
    }
    const { courseId, lessonId } = ids.parse(b);
    if (b.action === "complete") return json(await completeLesson(db(), u, courseId, lessonId));
    if (b.action === "quiz") {
      const answers = z.record(z.array(z.number().int().min(0).max(7)).max(8)).parse(b.answers);
      return json(await submitQuiz(db(), u, courseId, lessonId, answers));
    }
    const { c, l } = await accessible(u, courseId, lessonId);
    await ensureProgress(u.id, c.id, l.id, l.revision);
    if (b.action === "code") {
      if (!l.exercise)
        throw new AppError(400, "Materi ini tidak memiliki latihan kode.");
      const cfg = judgeConfig();
      if (!cfg)
        throw new AppError(
          503,
          "Pemeriksaan kode belum diaktifkan. Pengelola perlu menghubungkan layanan sandbox Judge0.",
        );
      const source = z.string().min(1).max(20000).parse(b.source);
      const id = z.string().uuid().parse(b.requestId);
      return json(await startAttempt(db(), cfg, u.id, c.id, l, source, id));
    }
    throw new AppError(400, "Tindakan tidak dikenal.");
  } catch (e) {
    return error(e);
  }
}
