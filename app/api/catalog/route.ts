import { getChatGPTUser } from "@/app/chatgpt-auth";
import { db, identity, json } from "@/lib/server";
import { catalogCourse } from "@/lib/catalog";
import type { Course } from "@/lib/model";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const signed = await getChatGPTUser();
    const user = signed ? await identity() : null;
    const rows = (
      await db()
        .prepare(
          "SELECT data FROM courses WHERE json_extract(data,'$.published')=1 ORDER BY rowid",
        )
        .all<{ data: string }>()
    ).results;
    const courses = rows.map((r) =>
      catalogCourse(JSON.parse(r.data) as Course),
    );
    const sessions = (
      await db()
        .prepare(
          "SELECT s.id,s.course_id AS courseId,s.title,s.kind,s.starts_at AS startsAt,s.duration,s.capacity,s.location,(SELECT COUNT(*) FROM rsvps WHERE session_id=s.id) AS count FROM sessions s JOIN courses c ON c.id=s.course_id WHERE json_extract(c.data,'$.published')=1 AND s.starts_at>? ORDER BY s.starts_at",
        )
        .bind(new Date().toISOString())
        .all()
    ).results;
    return json({
      courses,
      sessions,
      user: user ? { name: user.name, role: user.role } : null,
    });
  } catch (e) {
    console.error(
      "Catalog unavailable",
      e instanceof Error ? e.message : "unknown",
    );
    return json(
      { error: "Katalog belum dapat dimuat. Silakan coba lagi." },
      503,
    );
  }
}
