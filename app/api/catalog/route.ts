import { getSignedUser } from "@/lib/auth";
import { db, identity, json } from "@/lib/server";
import { catalogCourse } from "@/lib/catalog";
import type { Course } from "@/lib/model";
import { courseRows } from "@/lib/course-data";
import { publicSessions } from "@/lib/session-data";
import { registrationEnabled } from "@/lib/registration";
import { catalogLearningData } from "@/lib/catalog-learning-data";
import { z } from "zod";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  try {
    const query = new URL(req.url).searchParams;
    if (query.getAll("course").length > 1) return json({error: "Parameter course tidak boleh berulang."}, 400);
    const {course: selectedCourse} = z.object({course: z.string().min(1).max(80).optional()}).strict().parse(Object.fromEntries(query));
    const signed = await getSignedUser();
    const user = signed ? await identity(true) : null;
    const rows = await courseRows(db(), true);
    const courses = rows.map((r) =>
      catalogCourse(JSON.parse(r.data) as Course),
    );
    const sessions = await publicSessions(db());
    return json({
      courses,
      sessions,
      user: user ? { name: user.name, role: user.role, kind: user.kind, accessStatus: user.accessStatus } : null,
      learning: await catalogLearningData(db(), user, selectedCourse),
      registrationEnabled: await registrationEnabled(db()),
    });
  } catch (e) {
    if (e instanceof z.ZodError) return json({error: "Parameter katalog tidak sesuai."}, 400);
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
