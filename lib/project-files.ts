import {loadGraduationContext,academicProofPredicate,requireAcademicLesson} from "./graduation-data.ts";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile, unlink, open, realpath, lstat } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import {requirePermission,policySql} from "./authorization.ts";
import { classAccess, ClassError, type ClassUser } from "./classes.ts";
import type { PlatformDatabase } from "./database.ts";
export const FILE_LIMIT = 5 * 1024 * 1024;
export type FileEnvironment = Record<string, string | undefined>;
export function fileStorage(env: FileEnvironment = process.env) {
  const root = env.UPLOAD_STORAGE_DIR ? path.resolve(env.UPLOAD_STORAGE_DIR) : path.resolve("work/private-uploads");
  if (env.NODE_ENV === "production" && (!env.UPLOAD_STORAGE_DIR || !path.isAbsolute(env.UPLOAD_STORAGE_DIR) || !env.UPLOAD_STORAGE_ID || !env.APP_URL || root === process.cwd() || root.startsWith(process.cwd() + path.sep)))
    throw new ClassError(503, "Penyimpanan berkas belum dikonfigurasi.");
  const publicRoot = path.resolve("public");
  if (root === publicRoot || root.startsWith(publicRoot + path.sep))
    throw new ClassError(503, "Penyimpanan berkas harus privat.");
  const origin = new URL(env.APP_URL || "http://127.0.0.1:5173").origin;
  const scope = createHash("sha256").update(origin + "\n" + (env.UPLOAD_STORAGE_ID || root)).digest("hex");
  return { root, scope };
}
export function inspectFile(name: string, bytes: Uint8Array) {
  if (!bytes.length || bytes.length > FILE_LIMIT)
    throw new ClassError(413, "Berkas harus berisi data dan maksimal 5 MB.");
  const clean = name.replace(/\\/g, "/").split("/").pop()!.normalize("NFC").replace(/[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/g, "").trim();
  if (!clean || clean.length > 180)
    throw new ClassError(400, "Nama berkas maksimal 180 karakter.");
  const ext = clean.split(".").pop()?.toLowerCase(), b = Buffer.from(bytes);
  let mime = "";
  if (ext === "pdf" && b.subarray(0, 5).toString() === "%PDF-")
    mime = "application/pdf";
  if (ext === "png" && b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    mime = "image/png";
  if (["jpg", "jpeg"].includes(ext || "") && b[0] === 255 && b[1] === 216 && b[2] === 255)
    mime = "image/jpeg";
  if (ext === "txt") {
    try {
      const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      if (!/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(text))
        mime = "text/plain; charset=utf-8";
    }
    catch { }
  }
  if (!mime)
    throw new ClassError(415, "Gunakan PDF, PNG, JPEG, atau TXT dengan isi berkas yang sesuai.");
  return { name: clean, mime, size: bytes.length };
}
export async function canUpload(d: PlatformDatabase, u: ClassUser, assignmentId: string) {
  await requirePermission(d,u,"student");
  const row=await d.prepare("SELECT a.id,a.class_id,a.version,a.assessment_revision,c.course_id FROM class_assignments a JOIN cohorts c ON c.id=a.class_id WHERE a.id=? AND a.status='published' AND c.status!='archived'").bind(assignmentId).first<{id:string;class_id:string;version:number;assessment_revision:number;course_id:string}>();
  if(!row)throw new ClassError(403,"Upload hanya tersedia saat tugas terbuka.");
  const ctx=await loadGraduationContext(d,u,row.course_id,row.class_id);
  if(ctx.state.problem)throw new ClassError(409,ctx.state.problem.message);
  const binding=ctx.bindings.find(b=>b.assignment_id===assignmentId);
  const lesson=binding?requireAcademicLesson(ctx,binding.lesson_id):null;
  const guard=academicProofPredicate(ctx,binding?.lesson_id);
  const revision=lesson?.revision||0;
  guard.sql+=" AND EXISTS(SELECT 1 FROM class_assignments WHERE id=? AND version=? AND status='published') AND (NOT EXISTS(SELECT 1 FROM project_submissions WHERE assignment_id=? AND student_id=?) OR EXISTS(SELECT 1 FROM project_submissions s WHERE s.assignment_id=? AND s.student_id=? AND s.attempt=(SELECT max(attempt) FROM project_submissions WHERE assignment_id=s.assignment_id AND student_id=s.student_id) AND (s.status='changes_requested' OR s.assessment_revision!=? OR s.lesson_revision!=?)))";
  guard.binds.push(row.id,row.version,row.id,u.id,row.id,u.id,row.assessment_revision,revision);
  if(!await d.prepare(`SELECT 1 WHERE ${guard.sql}`).bind(...guard.binds).first())throw new ClassError(403,"Upload hanya tersedia saat Anda dapat mengumpulkan tugas.");
  return guard;
}
export async function privateDirectory(env: FileEnvironment) {
  const { root, scope } = fileStorage(env);
  await mkdir(root, { recursive: true, mode: 0o700 });
  const actual = await realpath(root), pub = await realpath(path.resolve("public")).catch(() => path.resolve("public"));
  if (actual === pub || actual.startsWith(pub + path.sep))
    throw new ClassError(503, "Penyimpanan berkas harus privat.");
  const checkout = await realpath(process.cwd());
  if (env.NODE_ENV === "production" && (actual === checkout || actual.startsWith(checkout + path.sep)))
    throw new ClassError(503, "Penyimpanan produksi harus berada di luar checkout aplikasi.");
  const dir = path.join(actual, scope);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  if ((await lstat(dir)).isSymbolicLink())
    throw new ClassError(503, "Penyimpanan berkas tidak valid.");
  return dir;
}
export async function uploadProjectFile(d: PlatformDatabase, u: ClassUser, assignmentId: string, name: string, bytes: Uint8Array, env: FileEnvironment = process.env) {
  const guard=await canUpload(d,u,assignmentId);
  const meta = inspectFile(name, bytes), { scope } = fileStorage(env), id = randomUUID();
  const dir = await privateDirectory(env);
  // Reserve metadata before writing. Incomplete reservations cannot be downloaded or submitted.
  const r = await d.prepare(`INSERT INTO project_files(id,owner_id,assignment_id,scope,name,mime,size,ready,created_at) SELECT ?,?,?,?,?,?,?,0,? WHERE (SELECT count(*) FROM project_files WHERE owner_id=? AND assignment_id=? AND scope=? AND submission_id IS NULL)<3 AND (SELECT COALESCE(sum(size),0) FROM project_files WHERE owner_id=? AND scope=?) + ? <= ? AND ${guard.sql}`).bind(id,u.id, assignmentId, scope, meta.name, meta.mime, meta.size, new Date().toISOString(), u.id, assignmentId, scope, u.id, scope, meta.size,200*1024*1024,...guard.binds).run();
  if (!r.meta.changes)
    throw new ClassError(409, "Maksimal 3 lampiran per kiriman dan 200 MB berkas per akun. Hapus lampiran yang belum dikirim bila perlu.");
  try {
    await writeFile(path.join(dir, id), bytes, { flag: "wx", mode: 0o600 });
    await canUpload(d, u, assignmentId);
    const ready=await d.prepare(`UPDATE project_files SET ready=1 WHERE id=? AND owner_id=? AND submission_id IS NULL AND ${guard.sql}`).bind(id,u.id,...guard.binds).run();
    if(!ready.meta.changes)throw new ClassError(403,"Akses upload berubah sebelum berkas disimpan.");
  }
  catch (e) {
    await unlink(path.join(dir, id)).catch(() => { });
    await d.prepare("DELETE FROM project_files WHERE id=? AND submission_id IS NULL").bind(id).run();
    throw e;
  }
  return { id, assignmentId, ...meta };
}
export async function removeProjectFile(d: PlatformDatabase, u: ClassUser, id: string, env: FileEnvironment = process.env) {
  await requirePermission(d,u,"student");
  const row=await d.prepare("SELECT a.class_id FROM project_files f JOIN class_assignments a ON a.id=f.assignment_id WHERE f.id=? AND f.owner_id=? AND f.submission_id IS NULL").bind(id,u.id).first<{class_id:string}>();
  if(!row)throw new ClassError(404,"Lampiran tidak ditemukan.");
  const {c,guard}=await classAccess(d,u,row.class_id,"member");
  if(c.status==="archived")throw new ClassError(409,"Kelas diarsipkan.");
  const { scope } = fileStorage(env);
  const r = await d.prepare(`DELETE FROM project_files WHERE id=? AND owner_id=? AND scope=? AND submission_id IS NULL AND ${guard.sql}`).bind(id,u.id,scope,...guard.binds).run();
  if (!r.meta.changes)
    throw new ClassError(404, "Lampiran belum dikirim tidak ditemukan.");
  if (/^[a-f0-9-]{36}$/.test(id))
    await unlink(path.join(await privateDirectory(env), id)).catch((e: NodeJS.ErrnoException) => { if (e.code !== "ENOENT")
      throw e; });
  return { ok: true };
}
export async function downloadProjectFile(d: PlatformDatabase, u: ClassUser, id: string, env: FileEnvironment = process.env) {
  await requirePermission(d,u,'account');
  const {scope}=fileStorage(env);
  const query=`SELECT f.id,f.name,f.mime,f.size,a.class_id FROM project_files f JOIN class_assignments a ON a.id=f.assignment_id JOIN cohorts c ON c.id=a.class_id WHERE f.id=? AND f.scope=? AND f.ready=1 AND ((f.submission_id IS NULL AND f.owner_id=? AND ${policySql('studentClass','c.id')}) OR (EXISTS(SELECT 1 FROM project_submissions s WHERE s.id=f.submission_id AND s.student_id=f.owner_id AND s.assignment_id=f.assignment_id) AND (${policySql('tutor','c.id')} OR (f.owner_id=? AND a.status!='draft' AND ${policySql('studentClass','c.id')}))))`;
  const values=[id,scope,u.id,u.id,u.id,u.id,u.id];
  const f=await d.prepare(query).bind(...values).first<{id:string;name:string;mime:string;size:number;class_id:string}>();
  if (!f || !/^[a-f0-9-]{36}$/.test(f.id))
    throw new ClassError(404, "Lampiran tidak ditemukan atau akses telah berakhir.");
  const {guard}=await classAccess(d,u,f.class_id,"member");
  try {
    const handle = await open(path.join(await privateDirectory(env), f.id), constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const st = await handle.stat();
      if (!st.isFile() || st.size !== f.size || st.size > FILE_LIMIT)
        throw new Error("invalid");
      const bytes=await handle.readFile();
      if(!await d.prepare(`${query} AND ${guard.sql}`).bind(...values,...guard.binds).first())throw new ClassError(404,"Akses lampiran berakhir.");
      return { ...f, bytes };
    }
    finally {
      await handle.close();
    }
  }
  catch {
    throw new ClassError(404, "Berkas belum tersedia pada penyimpanan ini.");
  }
}
export async function projectFileList(d:PlatformDatabase,u:ClassUser,classId:string,_staff:boolean,env:FileEnvironment=process.env){
  await classAccess(d,u,classId,'member');
  const {scope}=fileStorage(env);
  return (await d.prepare(`SELECT f.id,f.assignment_id AS assignmentId,f.submission_id AS submissionId,f.name,f.mime,f.size,f.ready FROM project_files f JOIN class_assignments a ON a.id=f.assignment_id JOIN cohorts c ON c.id=a.class_id WHERE a.class_id=? AND f.scope=? AND ((f.owner_id=? AND a.status!='draft' AND ${policySql('studentClass','c.id')}) OR (f.ready=1 AND EXISTS(SELECT 1 FROM project_submissions s WHERE s.id=f.submission_id AND s.student_id=f.owner_id AND s.assignment_id=f.assignment_id) AND ${policySql('tutor','c.id')})) ORDER BY f.created_at,f.id`).bind(classId,scope,u.id,u.id,u.id).all<{id:string;assignmentId:string;submissionId:string|null;name:string;mime:string;size:number;ready:number}>()).results;
}
