import { z } from "zod";
import { identity, db, json, AppError } from "@/lib/server";
import { ClassError } from "@/lib/classes";
import {
  projectList,
  projectMutation,
  saveAssignment,
  submitProject,
  reviewProject,
} from "@/lib/projects";
export const dynamic = "force-dynamic";
function failure(e: unknown) {
  if (e instanceof ClassError || e instanceof AppError)
    return json({ error: e.message }, e.status);
  if (e instanceof z.ZodError)
    return json({ error: e.issues[0]?.message || "Isian tidak valid." }, 400);
  return json(
    { error: "Tugas belum dapat diproses. Coba lagi; isian tetap tersedia." },
    503,
  );
}
export async function GET(req: Request) {
  try {
    const u = await identity(),
      classId = new URL(req.url).searchParams.get("class");
    if (!classId) throw new ClassError(400, "Pilih kelas terlebih dahulu.");
    return json(await projectList(db(), u, classId));
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: Request) {
  try {
    if (req.headers.get("origin") !== new URL(req.url).origin)
      throw new ClassError(403, "Asal permintaan tidak valid.");
    if (!req.headers.get("content-type")?.includes("application/json"))
      throw new ClassError(415, "Gunakan JSON.");
    if (Number(req.headers.get("content-length") || 0) > 24000)
      throw new ClassError(413, "Isian terlalu besar.");
    const raw = await req.text();
    if (raw.length > 24000) throw new ClassError(413, "Isian terlalu besar.");
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      throw new ClassError(400, "JSON tidak valid.");
    }
    const b = projectMutation.parse(data),
      u = await identity(),
      d = db();
    switch (b.action) {
      case "saveAssignment":
        return json(await saveAssignment(d, u, b.assignment));
      case "submit":
        return json(await submitProject(d, u, b));
      case "review":
        return json(await reviewProject(d, u, b));
    }
  } catch (e) {
    return failure(e);
  }
}
