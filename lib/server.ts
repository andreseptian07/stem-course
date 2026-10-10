import { runtimeDatabase } from "../db/runtime.ts";
import { requireVerifiedEmail } from "./email-policy";
import { getSignedUser } from "./auth.ts";
import { sampleCourse } from "./seed";
import { seedCourse, readLearningCourse, readProgress, accessibleLesson, initializeProgress } from "./course-data.ts";
import type { PlatformDatabase } from "./database.ts";
import {configuredJudge} from "./judge-config";
import type { JudgeConfig } from "./judge";
import {
  AccessError as AppError,
  registerIdentity,
  requireActive,
  requireOwner,
} from "./access";
export { AccessError as AppError } from "./access";
export function db(): PlatformDatabase { return runtimeDatabase(); }
export function config() { return process.env as Record<string, string>; }
export function judgeConfig(): JudgeConfig | null {
  return configuredJudge(config());
}
export async function identity(allowRestricted = false) {
  const signed = await getSignedUser();
  if (!signed)
    throw new AppError(401, "Silakan masuk untuk menyimpan progres belajar.");
  const d = db();
  const u = await registerIdentity(
    d,
    signed,
    false,
  );
  if (!allowRestricted) { await requireVerifiedEmail(d, signed.userId); requireActive(u); }
  if (u.owner && u.kind === "staff") { await requireOwner(d,u); await seedCourse(d,sampleCourse); }
  return u;
}
export function owner(user: { role: string }) {
  if (user.role !== "owner")
    throw new AppError(403, "Halaman ini hanya untuk pengelola course.");
}
export async function course(id: string, user: { id: string; role: string }) {
  return readLearningCourse(db(), id, user);
}
export async function getProgress(userId: string, courseId: string) {
  return readProgress(db(), userId, courseId);
}
export async function accessible(user: { id: string; role: string }, courseId: string, lessonId: string,classId?:string|null) {
  return accessibleLesson(db(), user, courseId, lessonId,classId);
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
