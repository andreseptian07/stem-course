import { env } from "cloudflare:workers";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import type { Course, Progress } from "./model";
import { sampleCourse } from "./seed";
import { blockingLesson } from "./rules";
import type { JudgeConfig } from "./judge";
export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function db() {
  if (!env.DB)
    throw new AppError(
      503,
      "Database belum tersedia. Coba lagi setelah konfigurasi selesai.",
    );
  return env.DB;
}
export function config() {
  return env as unknown as Record<string, string>;
}
export function judgeConfig(): JudgeConfig | null {
  const e = config();
  return e.JUDGE0_URL
    ? {
        url: e.JUDGE0_URL,
        token: e.JUDGE0_TOKEN,
        languageIds: {
          python: Number(e.JUDGE0_PYTHON_ID || 71),
          javascript: Number(e.JUDGE0_JAVASCRIPT_ID || 63),
          cpp: Number(e.JUDGE0_CPP_ID || 54),
        },
      }
    : null;
}
export async function identity() {
  const signed = await getChatGPTUser();
  if (!signed)
    throw new AppError(401, "Silakan masuk untuk menyimpan progres belajar.");
  const d = db();
  // Deployment is initially owner-private. Bootstrap can only be enabled by a server operator.
  if (config().OWNER_SETUP_ENABLED === "true")
    await d
      .prepare("INSERT OR IGNORE INTO settings (key,value) VALUES ('owner',?)")
      .bind(signed.userId)
      .run();
  const owner = await d
    .prepare("SELECT value FROM settings WHERE key='owner'")
    .first<{ value: string }>();
  const role = owner?.value === signed.userId ? "owner" : "student";
  await d
    .prepare(
      "INSERT INTO users(id,name,role) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,role=excluded.role",
    )
    .bind(signed.userId, signed.displayName, role)
    .run();
  if (role === "owner")
    await d
      .prepare("INSERT OR IGNORE INTO courses(id,data,version) VALUES(?,?,1)")
      .bind(sampleCourse.id, JSON.stringify(sampleCourse))
      .run();
  return { id: signed.userId, name: signed.displayName, role };
}
export function owner(user: { role: string }) {
  if (user.role !== "owner")
    throw new AppError(403, "Halaman ini hanya untuk pengelola course.");
}
export async function course(id: string, user: { role: string }) {
  const row = await db()
    .prepare("SELECT data,version FROM courses WHERE id=?")
    .bind(id)
    .first<{ data: string; version: number }>();
  if (!row) throw new AppError(404, "Course tidak ditemukan.");
  const c = { ...JSON.parse(row.data), version: row.version } as Course;
  if (!c.published && user.role !== "owner")
    throw new AppError(404, "Course belum tersedia.");
  return c;
}
export async function getProgress(userId: string, courseId: string) {
  return (
    await db()
      .prepare(
        "SELECT lesson_id AS lessonId,revision,complete,quiz_passed AS quizPassed,code_passed AS codePassed,quiz_attempts AS quizAttempts,code_attempts AS codeAttempts,score FROM progress WHERE user_id=? AND course_id=?",
      )
      .bind(userId, courseId)
      .all<Progress>()
  ).results;
}
export async function accessible(
  user: { id: string; role: string },
  courseId: string,
  lessonId: string,
) {
  const c = await course(courseId, user);
  const l = c.lessons.find((l) => l.id === lessonId);
  if (!l) throw new AppError(404, "Materi tidak ditemukan.");
  const p = await getProgress(user.id, c.id);
  const blocked = blockingLesson(c, l.id, p);
  if (blocked)
    throw new AppError(
      403,
      `Selesaikan syarat pada “${blocked.title}” terlebih dahulu.`,
    );
  return { c, l, p };
}
export async function ensureProgress(
  userId: string,
  courseId: string,
  lessonId: string,
  revision: number,
) {
  await db()
    .prepare(
      "INSERT INTO progress(user_id,course_id,lesson_id,revision) VALUES(?,?,?,?) ON CONFLICT(user_id,course_id,lesson_id) DO UPDATE SET revision=excluded.revision,complete=0,quiz_passed=0,code_passed=0,quiz_attempts=0,code_attempts=0,score=0 WHERE progress.revision != excluded.revision",
    )
    .bind(userId, courseId, lessonId, revision)
    .run();
}
export function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
