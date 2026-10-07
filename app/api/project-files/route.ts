import { z } from "zod";
import { checkAuthOrigin, AuthError } from "@/lib/auth-policy";
import { authRateLimit } from "@/lib/auth-data";
import { readRequestBytes, readRequestText } from "@/lib/request-body";
import { db, identity, json, AppError } from "@/lib/server";
import { ClassError } from "@/lib/classes";
import { FILE_LIMIT, canUpload, uploadProjectFile, removeProjectFile } from "@/lib/project-files";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const id = z.string().min(1).max(80).regex(/^[a-zA-Z0-9_-]+$/);
function failure(e: unknown) {
  if (e instanceof AppError || e instanceof ClassError || e instanceof AuthError)
    return json({ error: e.message }, e.status);
  if (e instanceof z.ZodError)
    return json({ error: "Identitas lampiran tidak valid." }, 400);
  return json({ error: "Berkas belum dapat diproses. Coba kembali." }, 503);
}
export async function POST(req: Request) {
  try {
    checkAuthOrigin(req);
    const u = await identity(), d = db();
    const assignmentId = id.parse(new URL(req.url).searchParams.get("assignment"));
    await canUpload(d, u, assignmentId);
    await authRateLimit(d, "upload", u.id);
    const contentType = req.headers.get("content-type") || "";
    if (!/^multipart\/form-data;\s*boundary=/i.test(contentType))
      throw new ClassError(415, "Gunakan formulir unggah berkas.");
    const bytes = await readRequestBytes(req, FILE_LIMIT + 65536);
    let form: FormData;
    try {
      form = await new Response(bytes as BodyInit, { headers: { "Content-Type": contentType } }).formData();
    }
    catch {
      throw new ClassError(400, "Formulir berkas tidak valid.");
    }
    if ([...form.keys()].length !== 1 || !(form.get("file") instanceof File))
      throw new ClassError(400, "Pilih satu berkas untuk diunggah.");
    const file = form.get("file") as File;
    return json(await uploadProjectFile(d, u, assignmentId, file.name, new Uint8Array(await file.arrayBuffer())), 201);
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
    let body;
    try {
      body = JSON.parse(await readRequestText(req, 1000));
    }
    catch (e) {
      if (e instanceof AppError)
        throw e;
      throw new ClassError(400, "JSON tidak valid.");
    }
    const b = z.object({ id }).strict().parse(body);
    return json(await removeProjectFile(db(), u, b.id));
  }
  catch (e) {
    return failure(e);
  }
}
