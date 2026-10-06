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
import { publicCourse, gradeQuiz, canComplete, progressFor } from "@/lib/rules";
import { courseSchema, sessionSchema } from "@/lib/validation";
import { submitCode, pollCode } from "@/lib/judge";
import type { Course } from "@/lib/model";
export const dynamic = "force-dynamic";
function error(e: unknown) {
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
async function sessions(user: { id: string; role: string }) {
  return (
    await db()
      .prepare(
        `SELECT s.id,s.course_id AS courseId,s.title,s.kind,s.starts_at AS startsAt,s.duration,s.location,s.capacity,CASE WHEN ?='owner' OR EXISTS(SELECT 1 FROM rsvps WHERE session_id=s.id AND user_id=?) THEN s.url ELSE '' END AS url,(SELECT count(*) FROM rsvps WHERE session_id=s.id) AS count,EXISTS(SELECT 1 FROM rsvps WHERE session_id=s.id AND user_id=?) AS joined FROM sessions s JOIN courses c ON c.id=s.course_id WHERE (?='owner' OR json_extract(c.data,'$.published')=1) ORDER BY s.starts_at`,
      )
      .bind(user.role, user.id, user.id, user.role)
      .all()
  ).results;
}
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
        courses: (
          await db()
            .prepare("SELECT data,version FROM courses ORDER BY rowid")
            .all<{ data: string; version: number }>()
        ).results.map((r) => ({ ...JSON.parse(r.data), version: r.version })),
        users: (await db().prepare("SELECT id,name,role FROM users").all())
          .results,
        progress: (
          await db()
            .prepare(
              "SELECT p.*,u.name FROM progress p JOIN users u ON u.id=p.user_id ORDER BY p.course_id,p.user_id",
            )
            .all()
        ).results,
        sessions: await sessions(u),
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
      const data = JSON.parse(a.data);
      if (a.state !== "pending")
        return json({
          id: a.id,
          state: a.state,
          score: a.score,
          ...data.result,
        });
      const cfg = judgeConfig();
      if (!cfg) throw new AppError(503, "Pemeriksa kode belum dihubungkan.");
      if (Date.now() - Date.parse(a.created_at) > 300000) {
        await db()
          .prepare(
            "UPDATE attempts SET state='error' WHERE id=? AND state='pending'",
          )
          .bind(a.id)
          .run();
        return json({
          id: a.id,
          state: "error",
          error:
            "Pemeriksaan melewati batas waktu. Hubungi mentor jika kuota percobaan habis.",
        });
      }
      const result = await pollCode(cfg, data.tokens);
      if (result.some((r) => r.status.id <= 2))
        return json({ id: a.id, state: "pending" });
      const passed = result.every((r) => r.status.id === 3);
      const score = Math.round(
        (result.filter((r) => r.status.id === 3).length / result.length) * 100,
      );
      const output = {
        passed,
        tests: result.map((r, i) => ({
          index: i + 1,
          hidden: data.hidden[i],
          passed: r.status.id === 3,
          status: r.status.description,
          ...(!data.hidden[i]
            ? {
                stdout: r.stdout,
                stderr: r.stderr,
                compileOutput: r.compile_output,
              }
            : {}),
        })),
      };
      const c = await course(a.course_id, u);
      const l = c.lessons.find((l) => l.id === a.lesson_id);
      const current = l?.revision === a.revision;
      const statements = [
        db()
          .prepare(
            "UPDATE attempts SET state='finished',score=?,data=? WHERE id=? AND state='pending'",
          )
          .bind(score, JSON.stringify({ ...data, result: output }), a.id),
      ];
      if (current && passed)
        statements.push(
          db()
            .prepare(
              "UPDATE progress SET code_passed=1 WHERE user_id=? AND course_id=? AND lesson_id=? AND revision=?",
            )
            .bind(u.id, a.course_id, a.lesson_id, a.revision),
        );
      await db().batch(statements);
      return json({
        id: a.id,
        state: "finished",
        score,
        ...output,
        stale: !current,
      });
    }
    const rows = (
      await db()
        .prepare("SELECT data,version FROM courses ORDER BY rowid")
        .all<{ data: string; version: number }>()
    ).results;
    const visible = rows
      .map((r) => ({ ...JSON.parse(r.data), version: r.version }) as Course)
      .filter((c) => c.published || u.role === "owner");
    const progress: Record<string, any> = {};
    for (const c of visible) progress[c.id] = await getProgress(u.id, c.id);
    return json({
      user: u,
      courses: visible.map((c) => publicCourse(c, progress[c.id])),
      progress,
      sessions: await sessions(u),
      judgeReady: !!judgeConfig(),
    });
  } catch (e) {
    return error(e);
  }
}
export async function POST(req: Request) {
  try {
    if (req.headers.get("origin") !== new URL(req.url).origin)
      throw new AppError(403, "Asal permintaan tidak valid.");
    if (!req.headers.get("content-type")?.includes("application/json"))
      throw new AppError(415, "Gunakan JSON.");
    if (Number(req.headers.get("content-length") || 0) > 1000000)
      throw new AppError(413, "Isian terlalu besar.");
    const raw = await req.text();
    if (raw.length > 1000000) throw new AppError(413, "Isian terlalu besar.");
    let b: any;
    try {
      b = JSON.parse(raw);
    } catch {
      throw new AppError(400, "JSON tidak valid.");
    }
    const u = await identity();
    if (b.action === "saveCourse") {
      owner(u);
      const next = courseSchema.parse(b.course);
      const old = await db()
        .prepare("SELECT data,version FROM courses WHERE id=?")
        .bind(next.id)
        .first<{ data: string; version: number }>();
      if (old) {
        if (old.version !== next.version)
          throw new AppError(
            409,
            "Course sudah berubah. Muat ulang sebelum menyimpan.",
          );
        const previous = JSON.parse(old.data) as Course;
        next.lessons = next.lessons.map((l) => {
          const prior = previous.lessons.find((p) => p.id === l.id);
          return {
            ...l,
            revision: prior
              ? JSON.stringify({ ...l, revision: 0 }) ===
                JSON.stringify({ ...prior, revision: 0 })
                ? prior.revision
                : prior.revision + 1
              : 1,
          };
        });
        next.version = old.version + 1;
        const updated = await db()
          .prepare(
            "UPDATE courses SET data=?,version=? WHERE id=? AND version=?",
          )
          .bind(JSON.stringify(next), next.version, next.id, old.version)
          .run();
        if (!updated.meta.changes)
          throw new AppError(
            409,
            "Course berubah saat disimpan. Muat ulang dan coba lagi.",
          );
      } else {
        next.version = 1;
        await db()
          .prepare("INSERT INTO courses(id,data,version) VALUES(?,?,1)")
          .bind(next.id, JSON.stringify(next))
          .run();
      }
      return json({ course: next });
    }
    if (b.action === "saveSession") {
      owner(u);
      const s = sessionSchema.parse(b.session);
      await course(s.courseId, u);
      if (Date.parse(s.startsAt) <= Date.now())
        throw new AppError(400, "Pilih waktu sesi yang akan datang.");
      const id = s.id || crypto.randomUUID();
      const registered = await db()
        .prepare("SELECT COUNT(*) AS total FROM rsvps WHERE session_id=?")
        .bind(id)
        .first<{ total: number }>();
      if ((registered?.total || 0) > s.capacity)
        throw new AppError(
          400,
          "Kapasitas tidak boleh lebih kecil dari jumlah peserta terdaftar.",
        );
      await db()
        .prepare(
          "INSERT INTO sessions(id,course_id,title,kind,starts_at,duration,location,url,capacity) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET course_id=excluded.course_id,title=excluded.title,kind=excluded.kind,starts_at=excluded.starts_at,duration=excluded.duration,location=excluded.location,url=excluded.url,capacity=excluded.capacity",
        )
        .bind(
          id,
          s.courseId,
          s.title,
          s.kind,
          s.startsAt,
          s.duration,
          s.location,
          s.url,
          s.capacity,
        )
        .run();
      return json({ id });
    }
    if (b.action === "rsvp") {
      const id = z.string().max(80).parse(b.sessionId);
      const s = await db()
        .prepare("SELECT * FROM sessions WHERE id=?")
        .bind(id)
        .first<any>();
      if (!s) throw new AppError(404, "Sesi tidak ditemukan.");
      await course(s.course_id, u);
      if (Date.parse(s.starts_at) < Date.now())
        throw new AppError(400, "Pendaftaran sesi sudah ditutup.");
      if (b.join === false) {
        await db()
          .prepare("DELETE FROM rsvps WHERE session_id=? AND user_id=?")
          .bind(id, u.id)
          .run();
        return json({ joined: false });
      }
      await db()
        .prepare(
          "INSERT OR IGNORE INTO rsvps(session_id,user_id) SELECT ?,? WHERE (SELECT count(*) FROM rsvps WHERE session_id=?) < ?",
        )
        .bind(id, u.id, id, s.capacity)
        .run();
      const joined = await db()
        .prepare("SELECT 1 FROM rsvps WHERE session_id=? AND user_id=?")
        .bind(id, u.id)
        .first();
      if (!joined) throw new AppError(409, "Sesi sudah penuh.");
      return json({ joined: true });
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
    const { c, l, p } = await accessible(u, courseId, lessonId);
    await ensureProgress(u.id, c.id, l.id, l.revision);
    if (b.action === "complete") {
      if (!canComplete(l, progressFor(l, p)))
        throw new AppError(403, "Lulus tes wajib terlebih dahulu.");
      await db()
        .prepare(
          "UPDATE progress SET complete=1 WHERE user_id=? AND course_id=? AND lesson_id=? AND revision=?",
        )
        .bind(u.id, c.id, l.id, l.revision)
        .run();
      return json({ complete: true });
    }
    if (b.action === "quiz") {
      if (!l.quiz) throw new AppError(400, "Materi ini tidak memiliki kuis.");
      const answers = z
        .record(z.array(z.number().int().min(0).max(7)).max(8))
        .parse(b.answers);
      const reserve = await db()
        .prepare(
          "UPDATE progress SET quiz_attempts=quiz_attempts+1 WHERE user_id=? AND course_id=? AND lesson_id=? AND revision=? AND (?=0 OR quiz_attempts<?)",
        )
        .bind(
          u.id,
          c.id,
          l.id,
          l.revision,
          l.quiz.maxAttempts,
          l.quiz.maxAttempts,
        )
        .run();
      if (!reserve.meta.changes)
        throw new AppError(
          429,
          "Batas percobaan tercapai. Hubungi mentor untuk membuka percobaan kembali.",
        );
      const result = gradeQuiz(l.quiz, answers);
      const id = crypto.randomUUID();
      await db().batch([
        db()
          .prepare(
            "UPDATE progress SET quiz_passed=max(quiz_passed,?),score=? WHERE user_id=? AND course_id=? AND lesson_id=? AND revision=?",
          )
          .bind(
            result.passed ? 1 : 0,
            result.score,
            u.id,
            c.id,
            l.id,
            l.revision,
          ),
        db()
          .prepare(
            "INSERT INTO attempts(id,user_id,course_id,lesson_id,revision,kind,state,score,data,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
          )
          .bind(
            id,
            u.id,
            c.id,
            l.id,
            l.revision,
            "quiz",
            "finished",
            result.score,
            JSON.stringify({ answers, result }),
            new Date().toISOString(),
          ),
      ]);
      return json(result);
    }
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
      const pending = await db()
        .prepare(
          "SELECT id FROM attempts WHERE user_id=? AND kind='code' AND state='pending' AND created_at>? LIMIT 1",
        )
        .bind(u.id, new Date(Date.now() - 300000).toISOString())
        .first();
      if (pending)
        throw new AppError(409, "Tunggu pemeriksaan sebelumnya selesai.");
      const recent = await db()
        .prepare(
          "SELECT count(*) AS n FROM attempts WHERE user_id=? AND kind='code' AND created_at>?",
        )
        .bind(u.id, new Date(Date.now() - 60000).toISOString())
        .first<{ n: number }>();
      if ((recent?.n || 0) >= 5)
        throw new AppError(429, "Maksimal lima pengiriman kode per menit.");
      const reserve = await db()
        .prepare(
          "UPDATE progress SET code_attempts=code_attempts+1 WHERE user_id=? AND course_id=? AND lesson_id=? AND revision=? AND (?=0 OR code_attempts<?)",
        )
        .bind(
          u.id,
          c.id,
          l.id,
          l.revision,
          l.exercise.maxAttempts,
          l.exercise.maxAttempts,
        )
        .run();
      if (!reserve.meta.changes)
        throw new AppError(
          429,
          "Batas percobaan kode tercapai. Hubungi mentor.",
        );
      try {
        const tokens = await submitCode(
          cfg,
          l.exercise.language,
          source,
          l.exercise.tests,
        );
        const id = crypto.randomUUID();
        await db()
          .prepare(
            "INSERT INTO attempts(id,user_id,course_id,lesson_id,revision,kind,state,data,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
          )
          .bind(
            id,
            u.id,
            c.id,
            l.id,
            l.revision,
            "code",
            "pending",
            JSON.stringify({
              tokens,
              source,
              hidden: l.exercise.tests.map((t) => t.hidden),
            }),
            new Date().toISOString(),
          )
          .run();
        return json({ id, state: "pending" });
      } catch (e) {
        await db()
          .prepare(
            "UPDATE progress SET code_attempts=max(0,code_attempts-1) WHERE user_id=? AND course_id=? AND lesson_id=? AND revision=?",
          )
          .bind(u.id, c.id, l.id, l.revision)
          .run();
        throw e;
      }
    }
    throw new AppError(400, "Tindakan tidak dikenal.");
  } catch (e) {
    return error(e);
  }
}
