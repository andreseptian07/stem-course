import { z } from "zod";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import {
  db,
  identity,
  course,
  getProgress,
  json,
  AppError,
} from "@/lib/server";
import { emptyProfile, profileSchema, dashboardCourse } from "@/lib/account";
import { classAgenda } from "@/lib/classes";
import type { Course } from "@/lib/model";
export const dynamic = "force-dynamic";
function failure(e: unknown) {
  if (e instanceof AppError) return json({ error: e.message }, e.status);
  if (e instanceof z.ZodError)
    return json({ error: e.issues[0]?.message || "Isian belum valid." }, 400);
  console.error(
    "Account request failed",
    e instanceof Error ? e.message : "unknown",
  );
  return json(
    {
      error:
        "Data akun belum dapat diproses. Coba lagi; perubahan Anda tetap tersedia.",
    },
    503,
  );
}
export async function GET() {
  try {
    const u = await identity();
    const signed = await getChatGPTUser();
    const p = await db()
      .prepare("SELECT data,version FROM profiles WHERE user_id=?")
      .bind(u.id)
      .first<{ data: string; version: number }>();
    const rows = (
      await db()
        .prepare(
          "SELECT c.data,c.version,e.created_at AS enrolledAt FROM courses c LEFT JOIN enrollments e ON e.course_id=c.id AND e.user_id=? WHERE (json_extract(c.data,'$.published')=1 OR ?='owner') AND (e.user_id IS NOT NULL OR EXISTS(SELECT 1 FROM progress p WHERE p.course_id=c.id AND p.user_id=?)) ORDER BY e.created_at DESC,c.rowid",
        )
        .bind(u.id, u.role, u.id)
        .all<{ data: string; version: number; enrolledAt: string | null }>()
    ).results;
    const courses = await Promise.all(
      rows.map(async (r) =>
        dashboardCourse(
          { ...JSON.parse(r.data), version: r.version } as Course,
          await getProgress(u.id, JSON.parse(r.data).id),
          r.enrolledAt,
        ),
      ),
    );
    const sessions = (
      await db()
        .prepare(
          "SELECT s.id,s.course_id AS courseId,json_extract(c.data,'$.title') AS courseTitle,s.title,s.kind,s.starts_at AS startsAt,s.duration,s.location,s.url FROM rsvps r JOIN sessions s ON s.id=r.session_id JOIN courses c ON c.id=s.course_id WHERE r.user_id=? AND (json_extract(c.data,'$.published')=1 OR ?='owner') AND datetime(s.starts_at,'+' || s.duration || ' minutes')>datetime(?) ORDER BY s.starts_at",
        )
        .bind(u.id, u.role, new Date().toISOString())
        .all()
    ).results;
    const agenda = [...sessions, ...(await classAgenda(db(), u))].sort(
      (a: any, b: any) => a.startsAt.localeCompare(b.startsAt),
    );
    return json({
      user: { ...u, email: signed!.email },
      profile: p
        ? { ...JSON.parse(p.data), version: p.version }
        : emptyProfile(u.name),
      courses,
      sessions: agenda,
    });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: Request) {
  try {
    if (req.headers.get("origin") !== new URL(req.url).origin)
      throw new AppError(403, "Asal permintaan tidak valid.");
    if (!req.headers.get("content-type")?.includes("application/json"))
      throw new AppError(415, "Gunakan JSON.");
    if (Number(req.headers.get("content-length") || 0) > 15000)
      throw new AppError(413, "Isian terlalu besar.");
    const raw = await req.text();
    if (raw.length > 15000) throw new AppError(413, "Isian terlalu besar.");
    let b: any;
    try {
      b = JSON.parse(raw);
    } catch {
      throw new AppError(400, "JSON tidak valid.");
    }
    const u = await identity();
    if (b.action === "enroll") {
      const id = z.string().min(1).max(80).parse(b.courseId);
      const c = await course(id, u);
      if (!c.published) throw new AppError(400, "Course belum diterbitkan.");
      await db()
        .prepare(
          "INSERT OR IGNORE INTO enrollments(user_id,course_id,created_at) VALUES(?,?,?)",
        )
        .bind(u.id, id, new Date().toISOString())
        .run();
      return json({ courseId: id });
    }
    if (b.action === "saveProfile") {
      const p = profileSchema.parse(b.profile);
      const old = await db()
        .prepare("SELECT version FROM profiles WHERE user_id=?")
        .bind(u.id)
        .first<{ version: number }>();
      if ((old?.version || 0) !== p.version)
        throw new AppError(
          409,
          "Profil sudah berubah. Muat ulang profil sebelum menyimpan.",
        );
      const next = { ...p, version: p.version + 1 };
      const result = old
        ? await db()
            .prepare(
              "UPDATE profiles SET data=?,version=?,updated_at=? WHERE user_id=? AND version=?",
            )
            .bind(
              JSON.stringify(next),
              next.version,
              new Date().toISOString(),
              u.id,
              p.version,
            )
            .run()
        : await db()
            .prepare(
              "INSERT OR IGNORE INTO profiles(user_id,data,version,updated_at) VALUES(?,?,?,?)",
            )
            .bind(
              u.id,
              JSON.stringify(next),
              next.version,
              new Date().toISOString(),
            )
            .run();
      if (!result.meta.changes)
        throw new AppError(
          409,
          "Profil berubah saat disimpan. Muat ulang dan coba lagi.",
        );
      return json({ profile: next });
    }
    throw new AppError(400, "Aksi tidak dikenal.");
  } catch (e) {
    return failure(e);
  }
}
