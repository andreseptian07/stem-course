import { readRequestText } from "@/lib/request-body";
import { databaseFailureMessage } from "@/lib/database-failure";
import { checkAuthOrigin } from "@/lib/auth-policy";
import { z } from "zod";
import { identity, db, json, AppError } from "@/lib/server";
import {
  ClassError,
  listClasses,
  classDetail,
  saveClass,
  requestJoin,
  setMembership,
  addPost,
  addFeedback,
  saveClassSession,
  resetClassAttempts,
  mutationSchema,
} from "@/lib/classes";
export const dynamic = "force-dynamic";
function failure(e: unknown) {
  if (e instanceof ClassError || e instanceof AppError)
    return json({ error: e.message }, e.status);
  if (e instanceof z.ZodError)
    return json({ error: e.issues[0]?.message || "Isian belum valid." }, 400);
  return json(
    {
      error:
        databaseFailureMessage(e, "Data kelas belum dapat diproses. Coba lagi; isian Anda tetap tersedia."),
    },
    503,
  );
}
export async function GET(req: Request) {
  try {
    const u = await identity(),
      id = new URL(req.url).searchParams.get("class");
    return json(
      id ? await classDetail(db(), u, id) : await listClasses(db(), u),
    );
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: Request) {
  try {
    checkAuthOrigin(req);
    if (!req.headers.get("content-type")?.includes("application/json"))
      throw new ClassError(415, "Gunakan JSON.");
    if (Number(req.headers.get("content-length") || 0) > 20000)
      throw new ClassError(413, "Isian terlalu besar.");
    const raw = await readRequestText(req, 20000);
    if (raw.length > 20000) throw new ClassError(413, "Isian terlalu besar.");
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      throw new ClassError(400, "JSON tidak valid.");
    }
    const b = mutationSchema.parse(data),
      u = await identity(),
      d = db();
    switch (b.action) {
      case "saveClass":
        return json(await saveClass(d, u, b.class));
      case "requestJoin":
        return json(await requestJoin(d, u, b.classId));
      case "membership":
        return json(await setMembership(d, u, b.classId, b.userId, b.status));
      case "post":
        return json(await addPost(d, u, b.classId, b.kind, b.body));
      case "feedback":
        return json(await addFeedback(d, u, b.classId, b.studentId, b.body));
      case "saveSession":
        return json(await saveClassSession(d, u, b.session));
      case "resetAttempts":
        return json(
          await resetClassAttempts(d, u, b.classId, b.studentId, b.lessonId),
        );
    }
  } catch (e) {
    return failure(e);
  }
}
