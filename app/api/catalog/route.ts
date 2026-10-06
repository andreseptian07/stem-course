import { getChatGPTUser } from "@/app/chatgpt-auth";
import { db, identity, json } from "@/lib/server";
import { catalogCourse } from "@/lib/catalog";
import type { Course } from "@/lib/model";
import { courseRows } from "@/lib/course-data";
import { publicSessions } from "@/lib/session-data";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const signed = await getChatGPTUser();
    const user = signed ? await identity(true) : null;
    const rows = await courseRows(db(), true);
    const courses = rows.map((r) =>
      catalogCourse(JSON.parse(r.data) as Course),
    );
    const sessions = await publicSessions(db());
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
