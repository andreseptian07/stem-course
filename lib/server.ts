import { env } from "cloudflare:workers";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import type { Course, Progress } from "./model";
import { sampleCourse } from "./seed";
import { blockingLesson } from "./rules";
import { validateConfig } from "./judge";
import type { JudgeConfig } from "./judge";
import {
  AccessError as AppError,
  registerIdentity,
  requireActive,
} from "./access";
export { AccessError as AppError } from "./access";
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
  if (e.JUDGE0_ENABLED !== "true" || !e.JUDGE0_URL) return null;
  const cfg = {
    url: e.JUDGE0_URL,
    token: e.JUDGE0_TOKEN,
    apiKey: e.JUDGE0_API_KEY,
    apiHost: e.JUDGE0_API_HOST,
    languageIds: {
      python: Number(e.JUDGE0_PYTHON_ID || 71),
      javascript: Number(e.JUDGE0_JAVASCRIPT_ID || 63),
      cpp: Number(e.JUDGE0_CPP_ID || 54),
    },
  };
  try {
    validateConfig(cfg);
    return cfg;
  } catch {
    return null;
  }
}
export async function identity(allowRestricted = false) {
  const signed = await getChatGPTUser();
  if (!signed)
    throw new AppError(401, "Silakan masuk untuk menyimpan progres belajar.");
  const d = db();
  const u = await registerIdentity(
    d,
    signed,
    config().OWNER_SETUP_ENABLED === "true",
  );
  if (!allowRestricted) requireActive(u);
  if (u.role === "owner")
    await d
      .prepare("INSERT OR IGNORE INTO courses(id,data,version) VALUES(?,?,1)")
      .bind(sampleCourse.id, JSON.stringify(sampleCourse))
      .run();
  return u;
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
