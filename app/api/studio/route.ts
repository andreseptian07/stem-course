import {academicProofPredicate} from "@/lib/graduation-data";
import {studioHistory,studioDiscussion,adminStudioData,personalStudioData,resetStudioAttempts} from '@/lib/studio-data';
import { authorizationGuard, requirePermission } from "@/lib/authorization";
import { learningAuthorization } from "@/lib/learning-access";
import { readRequestText } from "@/lib/request-body";
import { checkAuthOrigin } from "@/lib/auth-policy";
import { ClassError } from "@/lib/classes";
import { z } from "zod";
import {
  identity,
  db,
  course,
  accessible,
  ensureProgress,
  judgeConfig,
  AppError,
  json,
} from "@/lib/server";
import { saveCourse, completeLesson, submitQuiz } from "@/lib/course-data";
import { saveSession, setRsvp } from "@/lib/session-data";
import { JudgeError } from "@/lib/judge";
import {judgeReadiness} from "@/lib/judge-readiness";
import { startAttempt, readAttempt, CodeError } from "@/lib/code-attempts";
export const dynamic = "force-dynamic";
function error(e: unknown) {
  if (e instanceof CodeError) return json({ error: e.message }, e.status);
  if (e instanceof JudgeError) return json({ error: e.message }, 503);
  if (e instanceof AppError || e instanceof ClassError) return json({ error: e.message }, e.status);
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
    for(const key of q.keys())if(q.getAll(key).length!==1)throw new AppError(400,"Parameter tidak boleh berulang.");
    const query=z.object({history:z.string().min(1).max(80).optional(),lesson:z.string().max(80).optional(),course:z.string().max(80).optional(),class:z.string().max(80).optional(),admin:z.literal("1").optional(),discussion:z.string().min(1).max(80).optional(),attempt:z.string().min(1).max(80).optional()}).strict().parse(Object.fromEntries(q));
    if([query.history,query.admin,query.discussion,query.attempt].filter(Boolean).length>1||(query.lesson!==undefined&&!query.history&&!query.discussion))throw new AppError(400,"Parameter tindakan tidak sesuai.");
    if (q.get("history")) {
      const courseId = q.get("history")!,
        lessonId = q.get("lesson") || "";
      return json(await studioHistory(db(),u,courseId,lessonId,query.class));
    }
    if (q.get("admin") === "1") {
      await requirePermission(db(),u,"owner");
      return json(await adminStudioData(db(),u,(await judgeReadiness(judgeConfig())).passed));
    }
    if (q.get("discussion")) return json(await studioDiscussion(db(),u,q.get("discussion")!,q.get("lesson")||"",query.class));
    if (q.get("attempt")) {
      await requirePermission(db(),u,"student");
      const a = await db()
        .prepare("SELECT * FROM attempts WHERE id=? AND user_id=?")
        .bind(q.get("attempt"), u.id)
        .first<{id:string;user_id:string;course_id:string;lesson_id:string;kind:string;state:string;score:number|null;revision:number;data:string;created_at:string}>();
      if (!a) throw new AppError(404, "Percobaan tidak ditemukan.");
      if (a.kind !== "code") throw new AppError(400, "Bukan percobaan kode.");
      const c = await course(a.course_id, u);
      const l = c.lessons.find((l) => l.id === a.lesson_id);
      return json(await readAttempt(db(), judgeConfig(), u.id, a, l?.revision));
    }
    await requirePermission(db(),u,"student");
    return json(await personalStudioData(db(),u,(await judgeReadiness(judgeConfig())).passed,query.course,query.class));
  } catch (e) {
    return error(e);
  }
}
const key=z.string().min(1).max(80);
const learner={courseId:key,lessonId:key,revision:z.number().int().positive(),classId:key.nullable().optional(),requestId:z.string().uuid()};
const mutation=z.discriminatedUnion("action",[
 z.object({action:z.literal("saveCourse"),course:z.unknown()}).strict(),
 z.object({action:z.literal("saveSession"),session:z.unknown()}).strict(),
 z.object({action:z.literal("rsvp"),sessionId:key,join:z.boolean().default(true)}).strict(),
 z.object({action:z.literal("message"),courseId:key,lessonId:z.string().max(80),classId:key.nullable().optional(),body:z.string().trim().min(1).max(4000),parentId:key.nullable().optional()}).strict(),
 z.object({action:z.literal("resetAttempts"),userId:key,courseId:key,lessonId:key}).strict(),
 z.object({action:z.literal("complete"),...learner}).strict(),
 z.object({action:z.literal("quiz"),...learner,answers:z.record(z.array(z.number().int().min(0).max(7)).max(8))}).strict(),
 z.object({action:z.literal("code"),...learner,source:z.string().min(1).max(20000)}).strict(),
]);
export async function POST(req: Request) {
  try {
    checkAuthOrigin(req);
    if (!req.headers.get("content-type")?.includes("application/json"))
      throw new AppError(415, "Gunakan JSON.");
    if (Number(req.headers.get("content-length") || 0) > 1000000)
      throw new AppError(413, "Isian terlalu besar.");
    const raw = await readRequestText(req, 1000000);
    if (raw.length > 1000000) throw new AppError(413, "Isian terlalu besar.");
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      throw new AppError(400, "JSON tidak valid.");
    }
    const b=mutation.parse(data);
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
      const guard = u.owner ? await authorizationGuard(db(),u,"owner") : await learningAuthorization(db(),u,m.courseId);
      if (!u.owner && m.lessonId) {const {context}=await accessible(u,m.courseId,m.lessonId,b.classId);const proof=academicProofPredicate(context,m.lessonId,true);guard.sql+=` AND ${proof.sql}`;guard.binds.push(...proof.binds);}
      if(u.owner && !await db().prepare("SELECT 1 FROM courses WHERE id=?").bind(m.courseId).first()) throw new AppError(404,"Course tidak tersedia.");
      if (m.parentId) {
        const parent = await db()
          .prepare("SELECT course_id,lesson_id FROM messages WHERE id=?")
          .bind(m.parentId)
          .first<{course_id:string;lesson_id:string}>();
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
      const saved=await db()
        .prepare(
          `INSERT INTO messages(id,course_id,lesson_id,user_id,name,role,body,parent_id,created_at) SELECT ?,?,?,?,?,?,?,?,? WHERE ${guard.sql}`,
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
          new Date().toISOString(),...guard.binds,
        )
        .run();
      if(!saved.meta.changes) throw new AppError(409,"Akses berubah sebelum pesan tersimpan.");
      return json({ id });
    }
    if (b.action === "resetAttempts") {
      await requirePermission(db(),u,"owner");
      const v = z
        .object({
          userId: z.string(),
          courseId: z.string(),
          lessonId: z.string(),
        })
        .parse(b);
      return json(await resetStudioAttempts(db(),u,v));
    }
    const { courseId, lessonId } = ids.parse(b);
    if (b.action === "complete") return json(await completeLesson(db(), u, courseId, lessonId,b.classId,b.requestId,b.revision));
    if (b.action === "quiz") {
      const answers = z.record(z.array(z.number().int().min(0).max(7)).max(8)).parse(b.answers);
      return json(await submitQuiz(db(), u, courseId, lessonId, answers,b.classId,b.requestId,b.revision));
    }
    const { c, l } = await accessible(u, courseId, lessonId,b.classId);
    if(b.revision!==l.revision)throw new AppError(409,"Revisi penilaian berubah. Muat ulang sebelum mengerjakan.");
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
      if(!(await judgeReadiness(cfg)).passed)
        throw new AppError(503,"Penilaian kode resmi sementara belum siap. Kuota percobaan belum digunakan; coba lagi setelah layanan tersedia.");
      const source = z.string().min(1).max(20000).parse(b.source);
      const id = z.string().uuid().parse(b.requestId);
      return json(await startAttempt(db(), cfg, u.id, c.id, l, source, id,fetch,b.classId));
    }
    throw new AppError(400, "Tindakan tidak dikenal.");
  } catch (e) {
    return error(e);
  }
}
