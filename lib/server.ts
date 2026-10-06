import { env } from "cloudflare:workers";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { sampleCourse } from "./seed";
import { seedCourse, readCourse, readProgress, accessibleLesson, initializeProgress } from "./course-data.ts";
import type { PlatformDatabase } from "./database.ts";
import { validateConfig } from "./judge";
import type { JudgeConfig } from "./judge";
import {
  AccessError as AppError,
  registerIdentity,
  requireActive,
} from "./access";
export { AccessError as AppError } from "./access";
export function db(): PlatformDatabase {
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
  if (u.role === "owner") await seedCourse(d, sampleCourse);
  return u;
}
export function owner(user: { role: string }) {
  if (user.role !== "owner")
    throw new AppError(403, "Halaman ini hanya untuk pengelola course.");
}
export async function course(id: string, user: { role: string }) {
  return readCourse(db(), id, user);
}
export async function getProgress(userId: string, courseId: string) {
  return readProgress(db(), userId, courseId);
}
export async function accessible(user: { id: string; role: string }, courseId: string, lessonId: string) {
  return accessibleLesson(db(), user, courseId, lessonId);
}
export async function ensureProgress(userId: string, courseId: string, lessonId: string, revision: number) {
  return initializeProgress(db(), userId, courseId, lessonId, revision);
}
export function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
