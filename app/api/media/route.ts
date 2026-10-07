import { z } from "zod";
import { db, identity, json, AppError } from "@/lib/server";
import { ClassError } from "@/lib/classes";
import { checkAuthOrigin } from "@/lib/auth-policy";
import { authRateLimit } from "@/lib/auth-data";
import { readRequestBytes, readRequestText } from "@/lib/request-body";
import { FILE_LIMIT } from "@/lib/project-files";
import { canUploadMedia, uploadMedia, photoInfo, clearPhoto, courseMediaList, removeCourseMedia, PHOTO_LIMIT } from "@/lib/media-data";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const id = z.string().min(1).max(80).regex(/^[a-zA-Z0-9_-]+$/);
const targetSchema = z.discriminatedUnion("purpose", [
  z.object({ purpose: z.literal("avatar"), previousId: z.string().uuid().nullable() }).strict(),
  z.object({ purpose: z.literal("course"), courseId: id }).strict(),
]);
function failure(e: unknown) {
  if (e instanceof ClassError || e instanceof AppError)
    return json({ error: e.message }, e.status);
  if (e instanceof z.ZodError)
    return json({ error: "Pilihan upload tidak valid." }, 400);
  return json({ error: "Berkas belum dapat diproses. Coba kembali." }, 503);
}
export async function GET(req: Request) {
  try {
    const u = await identity(), courseId = new URL(req.url).searchParams.get("course");
    return json(courseId ? { files: await courseMediaList(db(), u, id.parse(courseId)) } : { photo: await photoInfo(db(), u.id) });
  }
  catch (e) {
    return failure(e);
  }
}
export async function POST(req: Request) {
  try {
    checkAuthOrigin(req);
    const u = await identity(), q = new URL(req.url).searchParams;
    const target = targetSchema.parse(q.get("purpose") === "course" ? { purpose: "course", courseId: q.get("course") } : { purpose: q.get("purpose"), previousId: q.get("previous") || null });
    await canUploadMedia(db(), u, target);
    await authRateLimit(db(), "upload", u.id);
    const contentType = req.headers.get("content-type") || "";
    if (!/^multipart\/form-data;\s*boundary=/i.test(contentType))
      throw new ClassError(415, "Gunakan formulir unggah.");
    const bytes = await readRequestBytes(req, (target.purpose === "avatar" ? PHOTO_LIMIT : FILE_LIMIT) + 65536);
    let form: FormData;
    try {
      form = await new Response(bytes as BodyInit, { headers: { "Content-Type": contentType } }).formData();
    }
    catch {
      throw new ClassError(400, "Formulir upload tidak valid.");
    }
    if ([...form.keys()].length !== 1 || !(form.get("file") instanceof File))
      throw new ClassError(400, "Pilih satu berkas.");
    const file = form.get("file") as File;
    return json(await uploadMedia(db(), u, target, file.name, new Uint8Array(await file.arrayBuffer())), 201);
  }
  catch (e) {
    return failure(e);
  }
}
export async function DELETE(req: Request) {
  try {
    checkAuthOrigin(req);
    const u = await identity();
    if (!req.headers.get("content-type")?.includes("application/json"))
      throw new ClassError(415, "Gunakan JSON.");
    let raw;
    try {
      raw = JSON.parse(await readRequestText(req, 1000));
    }
    catch (e) {
      if (e instanceof AppError)
        throw e;
      throw new ClassError(400, "JSON tidak valid.");
    }
    const b = z.discriminatedUnion("purpose", [z.object({ purpose: z.literal("avatar"), previousId: z.string().uuid() }).strict(), z.object({ purpose: z.literal("course"), id: z.string().uuid() }).strict()]).parse(raw);
    return json(b.purpose === "avatar" ? await clearPhoto(db(), u, b.previousId) : await removeCourseMedia(db(), u, b.id));
  }
  catch (e) {
    return failure(e);
  }
}
